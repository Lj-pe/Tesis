import argparse
import csv
import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge


FIRST_DATE = date(2025, 10, 1)
LAST_DATE = date(2026, 11, 6)
LABEL_START_DATE = FIRST_DATE + timedelta(days=1)
HORIZONS = (7, 14, 30)
HISTORY_DAYS = 56
DEVELOPMENT_ORIGIN_LAST = date(2026, 7, 27)
HOLDOUT_ORIGIN_FIRST = date(2026, 9, 7)
HOLDOUT_ORIGIN_LAST = date(2026, 10, 5)
RIDGE_ALPHAS = (0.1, 1.0, 10.0, 100.0)
CROSTON_ALPHAS = (0.05, 0.1, 0.2, 0.3)
TSB_SMOOTHING = (0.05, 0.1, 0.2)
INPUT_FILES = (
    "productos.csv",
    "ventas_diarias.csv",
    "movimientos.csv",
    "compras.csv",
    "recepciones.csv",
)


class ExperimentError(Exception):
    pass


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_csv(run_directory, filename):
    path = run_directory / filename
    expected_hash = json.loads(
        (run_directory / "metadata.json").read_text(encoding="utf-8")
    ).get("files", {}).get(filename, {}).get("sha256")
    if not expected_hash or sha256(path) != expected_hash:
        raise ExperimentError(f"Hash inválido o ausente para {filename}.")
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def as_int(value, field):
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ExperimentError(f"Valor entero inválido en {field}: {value!r}.") from error


def as_float(value, field):
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ExperimentError(f"Valor numérico inválido en {field}: {value!r}.") from error
    if not math.isfinite(result):
        raise ExperimentError(f"Valor no finito en {field}.")
    return result


def parse_date(value):
    return date.fromisoformat(value)


def contiguous_mondays(start, end):
    cursor = start
    while cursor.weekday() != 0:
        cursor += timedelta(days=1)
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=7)


def load_inputs(run_directory):
    metadata = json.loads((run_directory / "metadata.json").read_text(encoding="utf-8"))
    if metadata.get("database") != "minimarket_tesis":
        raise ExperimentError("El extracto no identifica minimarket_tesis.")
    if metadata.get("interval", {}).get("last_commercial_date_inclusive") != LAST_DATE.isoformat():
        raise ExperimentError("El extracto no respeta el corte de fechas acordado.")
    sources = {filename[:-4]: load_csv(run_directory, filename) for filename in INPUT_FILES}
    products = sources["productos"]
    if not products:
        raise ExperimentError("El catálogo está vacío.")
    product_ids = [as_int(row["producto_id"], "producto_id") for row in products]
    if len(product_ids) != len(set(product_ids)):
        raise ExperimentError("El catálogo contiene IDs duplicados.")
    return metadata, sources, product_ids


def build_panel(sources, product_ids):
    dates = [
        LABEL_START_DATE + timedelta(days=index)
        for index in range((LAST_DATE - LABEL_START_DATE).days + 1)
    ]
    movements = defaultdict(list)
    for row in sources["movimientos"]:
        event_date = parse_date(row["fecha_comercial"])
        if event_date < FIRST_DATE or event_date > LAST_DATE:
            continue
        product_id = as_int(row["producto_id"], "movimientos.producto_id")
        if product_id not in product_ids:
            raise ExperimentError("Movimiento referencia un producto fuera del catálogo.")
        movements[(product_id, event_date)].append((
            row["ocurrido_en"],
            as_int(row["movimiento_id"], "movimiento_id"),
            as_int(row["variacion_unidades"], "variacion_unidades"),
            row["tipo"],
        ))

    sales = defaultdict(dict)
    prices = defaultdict(dict)
    for row in sources["ventas_diarias"]:
        product_id = as_int(row["producto_id"], "ventas_diarias.producto_id")
        day = parse_date(row["fecha_comercial"])
        if day < LABEL_START_DATE or day > LAST_DATE:
            continue
        if product_id not in product_ids:
            raise ExperimentError("Venta referencia un producto fuera del catálogo.")
        quantity = as_float(row["unidades"], "ventas_diarias.unidades")
        if quantity <= 0:
            raise ExperimentError("Venta realizada con cantidad no positiva.")
        sales[product_id][day] = quantity
        prices[product_id][day] = as_float(
            row["precio_unitario_ponderado"],
            "ventas_diarias.precio_unitario_ponderado",
        )

    panel = {}
    for product_id in product_ids:
        stock = 0
        initial_events = sorted(movements.get((product_id, FIRST_DATE), []))
        for _, _, delta, _ in initial_events:
            stock += delta
        if stock < 0:
            raise ExperimentError(
                f"Saldo de cierre inicial negativo para producto {product_id}."
            )
        values = []
        statuses = []
        end_stocks = []
        for day in dates:
            opening_stock = stock
            events = sorted(movements.get((product_id, day), []))
            minimum_intraday_stock = opening_stock
            for _, _, delta, _ in events:
                stock += delta
                minimum_intraday_stock = min(minimum_intraday_stock, stock)
            if stock < 0:
                raise ExperimentError(
                    f"Saldo de inventario negativo reconstruido para producto {product_id} en {day}."
                )
            if opening_stock <= 0 or minimum_intraday_stock <= 0 or stock <= 0:
                status = "censored_or_unavailable"
            else:
                status = "observed_available"
            quantity = sales[product_id].get(day, 0.0)
            if status != "observed_available" and day in sales[product_id]:
                status = "censored_with_recorded_sales"
            if status == "observed_available":
                values.append(quantity)
            else:
                values.append(None)
            statuses.append(status)
            end_stocks.append(stock)
        panel[product_id] = {
            "values": values,
            "statuses": statuses,
            "stock": end_stocks,
            "prices": [prices[product_id].get(day) for day in dates],
            "sales": sales[product_id],
        }

    purchase_lines = []
    for row in sources["compras"]:
        purchase_lines.append({
            "purchase_id": as_int(row["compra_id"], "compras.compra_id"),
            "product_id": as_int(row["producto_id"], "compras.producto_id"),
            "created": datetime.strptime(row["creada_en"], "%Y-%m-%d %H:%M:%S"),
            "ordered_units": as_float(row["unidades_pedidas"], "compras.unidades_pedidas"),
        })
    receipt_units = defaultdict(list)
    receipts_by_product_day = defaultdict(float)
    for row in sources["recepciones"]:
        product_id = as_int(row["producto_id"], "recepciones.producto_id")
        purchase_id = as_int(row["compra_id"], "recepciones.compra_id")
        received_at = datetime.strptime(row["recibida_en"], "%Y-%m-%d %H:%M:%S")
        day = received_at.date()
        units = as_float(row["unidades_recibidas"], "recepciones.unidades_recibidas")
        receipt_units[(purchase_id, product_id)].append((received_at, units))
        receipts_by_product_day[(product_id, day)] += units

    return dates, panel, purchase_lines, receipt_units, receipts_by_product_day


def panel_rows(dates, panel):
    rows = []
    for product_id, series in panel.items():
        for index, day in enumerate(dates):
            quantity = series["values"][index]
            rows.append({
                "producto_id": product_id,
                "fecha": day.isoformat(),
                "estado_observacion": series["statuses"][index],
                "ventas_unidades": "" if quantity is None else quantity,
                "stock_cierre_reconstruido": series["stock"][index],
                "precio_unitario_ponderado": (
                    "" if series["prices"][index] is None else series["prices"][index]
                ),
            })
    return rows


def availability_summary(dates, panel):
    counts = defaultdict(int)
    for series in panel.values():
        for status in series["statuses"]:
            counts[status] += 1
    return {
        "product_count": len(panel),
        "calendar_day_count": len(dates),
        "product_day_count": len(panel) * len(dates),
        "observed_available_product_days": counts["observed_available"],
        "unknown_initial_product_days": counts["unknown_initial_balance"],
        "censored_or_unavailable_product_days": counts["censored_or_unavailable"],
        "censored_with_recorded_sales_product_days": counts["censored_with_recorded_sales"],
        "first_label_date": dates[0].isoformat(),
        "last_label_date": dates[-1].isoformat(),
    }


def prepare_feature_indexes(purchase_lines, receipts_by_product_day):
    purchases_by_product = defaultdict(list)
    receipts_by_product = defaultdict(list)
    for line in purchase_lines:
        purchases_by_product[line["product_id"]].append(line)
    for (product_id, day), units in receipts_by_product_day.items():
        receipts_by_product[product_id].append((day, units))
    return purchases_by_product, receipts_by_product


def rolling_features(dates, panel, product_id, origin_index, horizon, feature_group,
                     purchase_lines_by_product, receipt_units,
                     receipts_by_product_day_by_product, feature_cache):
    cache_key = (product_id, origin_index, horizon, feature_group)
    if cache_key in feature_cache:
        return feature_cache[cache_key]
    series = panel[product_id]
    start = origin_index - HISTORY_DAYS + 1
    if start < 0:
        return None
    history = series["values"][start:origin_index + 1]
    if len(history) != HISTORY_DAYS or any(value is None for value in history):
        return None
    numeric = [float(value) for value in history]
    features = {f"product_id={product_id}": 1.0}
    for window in (7, 14, 28, 56):
        values = numeric[-window:]
        features[f"sales_rate_{window}"] = sum(values) / window
        features[f"positive_day_fraction_{window}"] = sum(value > 0 for value in values) / window
    features["trend_14_vs_previous_14"] = (
        sum(numeric[-14:]) / 14 - sum(numeric[-28:-14]) / 14
    )
    positive_positions = [index for index, value in enumerate(numeric) if value > 0]
    features["days_since_sale_capped_56"] = (
        56 - positive_positions[-1] - 1 if positive_positions else 56
    )
    centered = np.arange(28, dtype=float) - 13.5
    slope = float(np.dot(centered, np.array(numeric[-28:])) / np.dot(centered, centered))
    features["slope_28"] = float(slope)
    for weekday in range(7):
        count = sum(
            (dates[index].weekday() == weekday)
            for index in range(origin_index + 1, origin_index + horizon + 1)
        )
        features[f"target_weekday_{weekday}_fraction"] = count / horizon

    if feature_group in ("price", "full"):
        observed_prices = [
            value for value in series["prices"][start:origin_index + 1]
            if value is not None
        ]
        features["has_price_history"] = float(bool(observed_prices))
        if observed_prices:
            features["last_recorded_unit_price"] = observed_prices[-1]
            features["mean_recorded_unit_price"] = sum(observed_prices) / len(observed_prices)
            features["price_change_last_vs_mean"] = (
                observed_prices[-1] - sum(observed_prices) / len(observed_prices)
            )

    if feature_group in ("supply", "full"):
        origin = dates[origin_index]
        cutoff = datetime.combine(origin, datetime.max.time())
        lookback = datetime.combine(origin - timedelta(days=27), datetime.min.time())
        features["stock_at_origin"] = float(series["stock"][origin_index])
        features["receipts_units_28"] = sum(
            units for day, units in receipts_by_product_day_by_product.get(product_id, ())
            if origin - timedelta(days=27) <= day <= origin
        )
        features["orders_units_28"] = sum(
            line["ordered_units"] for line in purchase_lines_by_product.get(product_id, ())
            if lookback <= line["created"] <= cutoff
        )
        pending = 0.0
        ordered_by_purchase_product = defaultdict(float)
        for line in purchase_lines_by_product.get(product_id, ()):
            if line["created"] <= cutoff:
                ordered_by_purchase_product[(line["purchase_id"], line["product_id"])] += (
                    line["ordered_units"]
                )
        for key, ordered in ordered_by_purchase_product.items():
            received_to_date = sum(
                units for received_at, units in receipt_units.get(key, [])
                if received_at <= cutoff
            )
            pending += max(0.0, ordered - received_to_date)
        features["pending_order_units_asof_origin"] = pending
    feature_cache[cache_key] = features
    return features


def forecast_croston(history, alpha):
    positive = [(index, value) for index, value in enumerate(history) if value > 0]
    if len(positive) < 2:
        return None
    size = float(positive[0][1])
    interval = float(positive[0][0] + 1)
    previous = positive[0][0]
    for index, value in positive[1:]:
        gap = float(index - previous)
        size += alpha * (float(value) - size)
        interval += alpha * (gap - interval)
        previous = index
    return max(0.0, (1.0 - alpha / 2.0) * size / interval)


def forecast_tsb(history, alpha, beta):
    first_positive = next(
        (index for index, value in enumerate(history) if value > 0),
        None,
    )
    if first_positive is None:
        return 0.0
    probability = 1.0 / (first_positive + 1)
    size = float(history[first_positive])
    for value in history[first_positive + 1:]:
        occurrence = 1.0 if value > 0 else 0.0
        probability += beta * (occurrence - probability)
        if occurrence:
            size += alpha * (float(value) - size)
    return max(0.0, probability * size)


def model_grid():
    candidates = []
    candidates.append(("naive_7", {"kind": "moving", "window": 7}))
    for window in (14, 28, 56):
        candidates.append((f"moving_average_{window}", {
            "kind": "moving",
            "window": window,
        }))
    for alpha in CROSTON_ALPHAS:
        candidates.append((f"croston_sba_alpha_{alpha:g}", {
            "kind": "croston",
            "alpha": alpha,
        }))
    for alpha in TSB_SMOOTHING:
        for beta in TSB_SMOOTHING:
            candidates.append((f"tsb_alpha_{alpha:g}_beta_{beta:g}", {
                "kind": "tsb",
                "alpha": alpha,
                "beta": beta,
            }))
    for alpha in CROSTON_ALPHAS:
        candidates.append((f"adida_alpha_{alpha:g}", {
            "kind": "adida",
            "alpha": alpha,
        }))
    for group in ("history", "price", "supply", "full"):
        for alpha in RIDGE_ALPHAS:
            candidates.append((f"ridge_{group}_alpha_{alpha:g}", {
                "kind": "ridge",
                "group": group,
                "alpha": alpha,
            }))
    return candidates


def family_for(name):
    if name.startswith("naive_"):
        return "naive_7"
    if name.startswith("moving_average_"):
        return "moving_average"
    if name.startswith("croston_sba_"):
        return "croston_sba"
    if name.startswith("tsb_"):
        return "tsb"
    if name.startswith("adida_"):
        return "adida"
    if name.startswith("ridge_"):
        return "_".join(name.split("_")[:2])
    raise ExperimentError(f"Familia desconocida: {name}")


def forecast_candidate(name, config, history, horizon):
    if config["kind"] == "moving":
        window = min(config["window"], len(history))
        rate = sum(history[-window:]) / window
        return rate * horizon / 1.0
    if config["kind"] == "croston":
        rate = forecast_croston(history, config["alpha"])
        if rate is None:
            rate = sum(history[-28:]) / min(len(history), 28)
        return rate * horizon
    if config["kind"] == "tsb":
        return forecast_tsb(history, config["alpha"], config["beta"]) * horizon
    if config["kind"] == "adida":
        weekly = [
            sum(history[index:index + 7])
            for index in range(0, len(history), 7)
            if len(history[index:index + 7]) == 7
        ]
        rate = forecast_croston(weekly, config["alpha"])
        if rate is None:
            recent = weekly[-4:]
            rate = sum(recent) / len(recent) if recent else 0.0
        return rate * horizon / 7.0
    raise ExperimentError(f"Modelo no univariado: {name}")


def eligible_sample(dates, panel, product_id, origin_index, horizon):
    start = origin_index - HISTORY_DAYS + 1
    target_start = origin_index + 1
    target_end = target_start + horizon
    if start < 0 or target_end > len(dates):
        return None
    history = panel[product_id]["values"][start:origin_index + 1]
    target = panel[product_id]["values"][target_start:target_end]
    if any(value is None for value in history) or any(value is None for value in target):
        return None
    return sum(float(value) for value in target)


def training_examples(dates, panel, product_ids, horizon, origin_index,
                      feature_group, origins, purchase_lines_by_product,
                      receipt_units, receipts_by_product_day_by_product,
                      feature_cache):
    feature_rows = []
    targets = []
    for historical_origin in origins:
        historical_index = (historical_origin - dates[0]).days
        if historical_index + horizon >= origin_index:
            continue
        for product_id in product_ids:
            target = eligible_sample(
                dates, panel, product_id, historical_index, horizon
            )
            if target is None:
                continue
            features = rolling_features(
                dates, panel, product_id, historical_index, horizon, feature_group,
                purchase_lines_by_product, receipt_units,
                receipts_by_product_day_by_product, feature_cache,
            )
            if features is not None:
                feature_rows.append(features)
                targets.append(target)
    return feature_rows, targets


def fit_and_predict_ridge(train_features, train_targets, test_features, alpha):
    if len(train_targets) < 20:
        return None
    vectorizer = DictVectorizer(sparse=True)
    x_train = vectorizer.fit_transform(train_features)
    x_test = vectorizer.transform(test_features)
    model = Ridge(alpha=alpha, solver="lsqr")
    model.fit(x_train, np.asarray(train_targets, dtype=float))
    return np.maximum(0.0, model.predict(x_test))


def make_origin_sets(dates):
    development = list(contiguous_mondays(
        date(2025, 12, 1),
        DEVELOPMENT_ORIGIN_LAST,
    ))
    holdout = list(contiguous_mondays(
        HOLDOUT_ORIGIN_FIRST,
        HOLDOUT_ORIGIN_LAST,
    ))
    max_horizon = max(HORIZONS)
    development = [
        origin for origin in development
        if origin + timedelta(days=max_horizon) < HOLDOUT_ORIGIN_FIRST
    ]
    holdout = [
        origin for origin in holdout
        if origin + timedelta(days=max_horizon) <= dates[-1]
    ]
    return development, holdout


def evaluate_phase(phase, origins, dates, panel, product_ids,
                   purchase_lines, receipt_units, receipts_by_product_day,
                   training_origins=None):
    all_predictions = []
    model_configs = model_grid()
    date_index = {day: index for index, day in enumerate(dates)}
    purchase_lines_by_product, receipts_by_product_day_by_product = (
        prepare_feature_indexes(purchase_lines, receipts_by_product_day)
    )
    feature_cache = {}
    for horizon in HORIZONS:
        eligible = {}
        for origin in origins:
            origin_index = date_index.get(origin)
            if origin_index is None:
                continue
            for product_id in product_ids:
                actual = eligible_sample(
                    dates, panel, product_id, origin_index, horizon
                )
                if actual is not None:
                    eligible[(product_id, origin.isoformat())] = {
                        "product_id": product_id,
                        "origin": origin.isoformat(),
                        "target_start": dates[origin_index + 1].isoformat(),
                        "target_end": dates[origin_index + horizon].isoformat(),
                        "actual": actual,
                        "frequency_segment": frequency_segment(
                            panel[product_id]["values"][origin_index - HISTORY_DAYS + 1:
                                                       origin_index + 1]
                        ),
                    }

        model_predictions = defaultdict(dict)
        origin_train_cache = {}
        for name, config in model_configs:
            if config["kind"] != "ridge":
                for key, sample in eligible.items():
                    product_id = sample["product_id"]
                    origin = date.fromisoformat(sample["origin"])
                    origin_index = date_index[origin]
                    history = panel[product_id]["values"][
                        origin_index - HISTORY_DAYS + 1:origin_index + 1
                    ]
                    prediction = forecast_candidate(
                        name, config, [float(value) for value in history], horizon
                    )
                    model_predictions[name][key] = max(0.0, float(prediction))
                continue

            group = config["group"]
            for origin in origins:
                origin_index = date_index.get(origin)
                if origin_index is None:
                    continue
                test_items = [
                    (key, sample) for key, sample in eligible.items()
                    if sample["origin"] == origin.isoformat()
                ]
                if not test_items:
                    continue
                features = []
                keys = []
                for key, sample in test_items:
                    row = rolling_features(
                        dates, panel, sample["product_id"], origin_index, horizon,
                        group, purchase_lines_by_product, receipt_units,
                        receipts_by_product_day_by_product, feature_cache,
                    )
                    if row is not None:
                        features.append(row)
                        keys.append(key)
                if not features:
                    continue
                cache_key = (origin.isoformat(), horizon, group)
                if cache_key not in origin_train_cache:
                    origin_train_cache[cache_key] = training_examples(
                        dates, panel, product_ids, horizon, origin_index, group,
                        [
                            candidate for candidate in (training_origins or origins)
                            if candidate < origin
                        ],
                        purchase_lines_by_product, receipt_units,
                        receipts_by_product_day_by_product, feature_cache,
                    )
                train_x, train_y = origin_train_cache[cache_key]
                predicted = fit_and_predict_ridge(
                    train_x, train_y, features, config["alpha"]
                )
                if predicted is None:
                    continue
                for key, value in zip(keys, predicted):
                    model_predictions[name][key] = float(value)

        for name, config in model_configs:
            family = family_for(name)
            for key, prediction in model_predictions[name].items():
                sample = eligible[key]
                all_predictions.append({
                    "phase": phase,
                    "horizon_days": horizon,
                    "model": name,
                    "family": family,
                    "product_id": sample["product_id"],
                    "origin": sample["origin"],
                    "target_start": sample["target_start"],
                    "target_end": sample["target_end"],
                    "frequency_segment": sample["frequency_segment"],
                    "actual_units": sample["actual"],
                    "predicted_units": prediction,
                })
    return all_predictions


def frequency_segment(history):
    positive = sum(value > 0 for value in history)
    if positive == 0:
        return "sin_ventas_en_56d"
    if positive < 8:
        return "intermitente_menos_8_dias_positivos"
    return "frecuente_8_o_mas_dias_positivos"


def metric_values(rows):
    if not rows:
        return None
    actual = [float(row["actual_units"]) for row in rows]
    errors = [
        abs(float(row["actual_units"]) - float(row["predicted_units"]))
        for row in rows
    ]
    squared = [
        (float(row["actual_units"]) - float(row["predicted_units"])) ** 2
        for row in rows
    ]
    denominator = sum(actual)
    return {
        "n_product_origins": len(rows),
        "products": len({row["product_id"] for row in rows}),
        "origins": len({row["origin"] for row in rows}),
        "actual_units": denominator,
        "mae": sum(errors) / len(errors),
        "rmse": math.sqrt(sum(squared) / len(squared)),
        "wape": sum(errors) / denominator if denominator > 0 else None,
        "origin_mae_std": stddev([
            sum(abs(float(row["actual_units"]) - float(row["predicted_units"]))
                for row in rows if row["origin"] == origin)
            / sum(row["origin"] == origin for row in rows)
            for origin in sorted({row["origin"] for row in rows})
        ]),
    }


def stddev(values):
    if len(values) < 2:
        return 0.0
    return float(np.std(np.asarray(values, dtype=float), ddof=1))


def summarize_candidates(predictions):
    groups = defaultdict(list)
    for row in predictions:
        groups[(row["horizon_days"], row["model"])].append(row)
    return {
        (horizon, model): metric_values(rows)
        for (horizon, model), rows in groups.items()
    }


def common_keys_for_horizon(predictions, horizon):
    model_keys = defaultdict(set)
    for row in predictions:
        if row["horizon_days"] == horizon:
            model_keys[row["model"]].add((
                row["product_id"], row["origin"]
            ))
    if not model_keys:
        return set()
    return set.intersection(*model_keys.values())


def rank_candidates(predictions, horizon):
    common = common_keys_for_horizon(predictions, horizon)
    if not common:
        return [], 0
    common_predictions = [
        row for row in predictions
        if row["horizon_days"] == horizon
        and (row["product_id"], row["origin"]) in common
    ]
    metrics = summarize_candidates(common_predictions)
    families = defaultdict(list)
    for (candidate_horizon, model), values in metrics.items():
        if candidate_horizon == horizon:
            families[family_for(model)].append((model, values))

    family_winners = []
    for family, candidates in families.items():
        scored_family = []
        for model, values in candidates:
            ranks = []
            for field in ("mae", "rmse", "wape"):
                ordered = sorted(
                    (
                        (candidate[field], candidate_model)
                        for candidate_model, candidate in candidates
                        if candidate[field] is not None
                    ),
                    key=lambda item: (item[0], item[1]),
                )
                if not ordered:
                    continue
                ranks.append(1 + next(
                    index for index, (_, candidate_model) in enumerate(ordered)
                    if candidate_model == model
                ))
            if not ranks:
                continue
            scored_family.append((
                sum(ranks) / len(ranks),
                model,
                values,
            ))
        if not scored_family:
            continue
        family_score, winner, values = min(
            scored_family,
            key=lambda item: (item[0], item[1]),
        )
        family_winners.append({
            "family": family,
            "model": winner,
            "metrics": values,
            "within_family_rank": family_score,
        })

    for item in family_winners:
        ranks = []
        for field in ("mae", "rmse", "wape"):
            ordered = sorted(
                (
                    (candidate["metrics"][field], candidate["family"])
                    for candidate in family_winners
                    if candidate["metrics"][field] is not None
                ),
                key=lambda value: (value[0], value[1]),
            )
            if not ordered:
                continue
            ranks.append(1 + next(
                index for index, (_, family) in enumerate(ordered)
                if family == item["family"]
            ))
        item["mean_metric_rank"] = sum(ranks) / len(ranks) if ranks else math.inf

    family_winners.sort(key=lambda item: (
        item["mean_metric_rank"],
        item["metrics"]["mae"],
        item["metrics"]["rmse"],
    ))
    for index, item in enumerate(family_winners, start=1):
        item["rank"] = index
    return family_winners, len(common)


def selected_family_predictions(predictions, rankings):
    selected = {
        (item["family"], item["model"])
        for ranking in rankings.values()
        for item in ranking
    }
    return [
        row for row in predictions
        if (row["family"], row["model"]) in selected
    ]


def segment_metrics(predictions, selected_models):
    groups = defaultdict(list)
    selected = set(selected_models)
    for row in predictions:
        if row["model"] not in selected:
            continue
        groups[(
            row["phase"], row["horizon_days"], row["model"],
            row["frequency_segment"],
        )].append(row)
    return [
        {
            "phase": phase,
            "horizon_days": horizon,
            "model": model,
            "frequency_segment": segment,
            **metric_values(rows),
        }
        for (phase, horizon, model, segment), rows in sorted(groups.items())
    ]


def write_csv(path, rows, columns):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path, data):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")


def plot_results(output_directory, development_rankings, holdout_predictions):
    for horizon in HORIZONS:
        ranking = development_rankings.get(horizon, [])
        if not ranking:
            continue
        holdout_by_model = {
            model: metrics
            for (candidate_horizon, model), metrics in summarize_candidates([
                prediction for prediction in holdout_predictions
                if prediction["horizon_days"] == horizon
            ]).items()
            if candidate_horizon == horizon
        }
        labels = [row["family"] for row in ranking]
        development_wape = [
            row["metrics"]["wape"] or 0.0 for row in ranking
        ]
        holdout_wape = []
        for row in ranking:
            metric = holdout_by_model.get(row["model"])
            holdout_wape.append(metric["wape"] if metric and metric["wape"] is not None else 0.0)
        positions = np.arange(len(labels))
        width = 0.38
        figure, axis = plt.subplots(figsize=(max(9, len(labels) * 1.15), 5.5))
        axis.bar(positions - width / 2, development_wape, width, label="Desarrollo")
        axis.bar(positions + width / 2, holdout_wape, width, label="Holdout")
        axis.set_xticks(positions, labels, rotation=35, ha="right")
        axis.set_ylabel("WAPE")
        axis.set_title(f"Comparación por horizonte de {horizon} días")
        axis.grid(axis="y", alpha=0.25)
        axis.legend()
        figure.tight_layout()
        figure.savefig(output_directory / f"wape_h{horizon}.png", dpi=150)
        plt.close(figure)


def historical_reference():
    return {
        "source": "experimentos_demanda/INFORME_METODOLOGICO_DEMANDA.md, cohorte común de datos antiguos",
        "comparability": "descriptiva solamente; distinta base, catálogo, período y soporte de observación",
        "metrics": {
            "7": {
                "model": "promedio_movil_4_semanas",
                "mae": 2.7888,
                "rmse": 3.4336,
                "wape": 0.7033,
                "pairs": 116,
                "products": 14,
            },
            "14": {
                "model": "promedio_movil_4_semanas",
                "mae": 3.7255,
                "rmse": 5.0029,
                "wape": 0.4738,
                "pairs": 102,
                "products": 13,
            },
            "30": {
                "model": "croston_sba",
                "mae": 5.7584,
                "rmse": 7.8849,
                "wape": 0.3553,
                "pairs": 67,
                "products": 10,
            },
        },
        "warning": "Los resultados antiguos son exploratorios y su política posterior fue definida post hoc.",
    }


def write_report(path, metadata, availability, development_rankings,
                 holdout_predictions, segment_rows,
                 holdout_origins, output_directory):
    lines = [
        "# Experimento de demanda: minimarket_tesis",
        "",
        f"- Extracto: `{metadata['run_id']}`",
        f"- Generado UTC: `{datetime.now(timezone.utc).isoformat()}`",
        f"- Intervalo de etiquetas: {availability['first_label_date']} a {availability['last_label_date']}",
        "- 07/11 y 08/11 excluidos; el 01/10 se procesa solo para establecer el saldo de apertura de las etiquetas.",
        "- Los producto-días sin stock continuo positivo quedan desconocidos/censurados; no se imputan.",
        "",
        "## Cobertura observable",
        "",
        f"- Productos: {availability['product_count']}; fechas: {availability['calendar_day_count']}; "
        f"producto-días candidatos: {availability['product_day_count']}.",
        f"- Observables con disponibilidad positiva todo el día: {availability['observed_available_product_days']}.",
        f"- Sin saldo inicial verificable: {availability['unknown_initial_product_days']} producto-días.",
        f"- Censurados/no disponibles: {availability['censored_or_unavailable_product_days']}; "
        f"con ventas registradas durante día censurado: {availability['censored_with_recorded_sales_product_days']}.",
        "- La clasificación usa el libro registrado y asume que el negocio informó todas las ventas; no prueba ausencia de movimientos omitidos ni demanda latente durante quiebres.",
        "",
        "## Protocolo",
        "",
        f"- Desarrollo: orígenes cronológicos semanales hasta {DEVELOPMENT_ORIGIN_LAST}; los objetivos de 30 días terminan antes del holdout.",
        f"- Holdout terminal: orígenes semanales {HOLDOUT_ORIGIN_FIRST}–{HOLDOUT_ORIGIN_LAST}; los hiperparámetros se eligen únicamente con desarrollo.",
        f"- Orígenes holdout utilizados: {', '.join(day.isoformat() for day in holdout_origins) or 'ninguno'}.",
        "- Se evalúan solo producto-orígenes con 56 días históricos consecutivos observables y todos los días del horizonte observables.",
        "- Ventanas de 14/30 días se solapan; las métricas agregadas y errores por origen no son observaciones independientes.",
        "- Ridge es global y directo por horizonte; entrena solo con ejemplos históricos cuyo objetivo concluye antes del origen actual.",
        "- En holdout, Ridge se reentrena con orígenes anteriores disponibles, incluidos los del propio holdout; los hiperparámetros y familias quedan congelados por desarrollo.",
        "- Ranking de desarrollo: promedio de rangos MAE/RMSE/WAPE en cohorte común. Holdout no se usa para escoger parámetros ni ganador.",
        "",
        "## Resultados de desarrollo y holdout",
        "",
        "| Horizonte | Rango dev | Familia/configuración | Dev n | Dev MAE | Dev RMSE | Dev WAPE | Holdout n | Holdout MAE | Holdout RMSE | Holdout WAPE |",
        "|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    holdout_metrics = summarize_candidates(holdout_predictions)
    for horizon in HORIZONS:
        for ranked in development_rankings.get(horizon, []):
            dev = ranked["metrics"]
            hold = holdout_metrics.get((horizon, ranked["model"]))
            lines.append(
                f"| {horizon} | {ranked['rank']} | `{ranked['model']}` | "
                f"{dev['n_product_origins']} | {dev['mae']:.3f} | {dev['rmse']:.3f} | "
                f"{format_metric(dev['wape'])} | "
                f"{hold['n_product_origins'] if hold else 0} | "
                f"{format_metric(hold['mae'] if hold else None)} | "
                f"{format_metric(hold['rmse'] if hold else None)} | "
                f"{format_metric(hold['wape'] if hold else None)} |"
            )
    lines += [
        "",
        "La tabla ordena por evaluación de desarrollo sobre una cohorte común; métricas por configuración están en `metricas_cohorte_comun.csv`, y la cobertura completa por candidato en `metricas_candidatos.csv`. Holdout puede tener menor cobertura porque se exige observabilidad íntegra del horizonte.",
        "",
        "## Variables y decisiones",
        "",
        "- Base univariada: rezagos/tasas de 7/14/28/56 días, días positivos, tiempo desde última venta, tendencia corta y calendario del horizonte.",
        "- Candidatas adicionales evaluadas mediante Ridge: precios ponderados históricos registrados antes del origen; saldo reconstruido, órdenes registradas, recepciones y cantidades pendientes conocidas al origen.",
        "- Categoría, marca, presentación y precio actual no entran al modelo: el catálogo consultado muestra `creado_en` común posterior al inicio de ventas y no hay historial de cambios que demuestre que esos atributos/precios eran conocidos en cada origen.",
        "- Ningún resultado de holdout se usa para seleccionar features o hiperparámetros.",
        "",
        "## Comparación histórica (escenario A)",
        "",
        "La sección histórica se conserva como referencia descriptiva y no como comparación equivalente. El experimento antiguo usó otra BD/extracto y una cohorte común de 14/13/10 productos para 7/14/30 días; no se emparejaron productos.",
        "",
        "| Horizonte | Referencia histórica | MAE | RMSE | WAPE |",
        "|---:|---|---:|---:|---:|",
    ]
    for horizon, item in historical_reference()["metrics"].items():
        lines.append(
            f"| {horizon} | {item['model']} | {item['mae']:.4f} | "
            f"{item['rmse']:.4f} | {item['wape']:.1%} |"
        )
    lines += [
        "",
        "No se comparan numéricamente estas métricas con B/C como evidencia de mejora: período, catálogo, cohorte y definición de observabilidad difieren.",
        "",
        "## Segmentos y limitaciones",
        "",
        "Los resultados segmentados por frecuencia están en `metricas_segmento.csv`. En el holdout hay pocos orígenes semanales y horizontes solapados; resultados variables no justifican una afirmación de superioridad general. Los días censurados no se evalúan, por lo que la predicción no estima ventas perdidas durante quiebres.",
        "",
        "| Fase | Horizonte | Modelo | Segmento | n | MAE | RMSE | WAPE |",
        "|---|---:|---|---|---:|---:|---:|---:|",
    ]
    for row in segment_rows:
        lines.append(
            f"| {row['phase']} | {row['horizon_days']} | `{row['model']}` | "
            f"{row['frequency_segment']} | {row['n_product_origins']} | "
            f"{format_metric(row['mae'])} | {format_metric(row['rmse'])} | "
            f"{format_metric(row['wape'])} |"
        )
    lines += [
        "",
        "## Archivos generados",
        "",
        "- `serie_diaria.csv`: panel producto-fecha; venta vacía si la observación no es válida.",
        "- `predicciones_desarrollo.csv`, `predicciones_holdout.csv`: predicciones por origen, producto y modelo.",
        "- `metricas_candidatos.csv`, `metricas_segmento.csv`, `resumen.json`.",
        "- `metricas_cohorte_comun.csv` compara configuraciones sobre los mismos producto-orígenes.",
        "- `wape_h7.png`, `wape_h14.png`, `wape_h30.png`.",
        "- Los archivos de origen conservan hashes y consultas en `metadata.json`.",
        "",
        f"Directorio de resultados: `{output_directory}`",
        "",
    ]
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("\n".join(lines))


def format_metric(value):
    if value is None:
        return "n/d"
    if isinstance(value, float) and not math.isfinite(value):
        return "n/d"
    return f"{value:.3f}"


def candidate_metric_rows(predictions, phase):
    grouped = defaultdict(list)
    for row in predictions:
        grouped[(row["horizon_days"], row["model"], row["family"])].append(row)
    result = []
    for (horizon, model, family), rows in sorted(grouped.items()):
        metrics = metric_values(rows)
        result.append({
            "phase": phase,
            "horizon_days": horizon,
            "model": model,
            "family": family,
            **metrics,
        })
    return result


def common_cohort_metric_rows(predictions, phase):
    rows = []
    for horizon in HORIZONS:
        common = common_keys_for_horizon(predictions, horizon)
        if not common:
            continue
        models = sorted({
            row["model"] for row in predictions
            if row["horizon_days"] == horizon
        })
        for model in models:
            selected = [
                row for row in predictions
                if row["horizon_days"] == horizon
                and row["model"] == model
                and (row["product_id"], row["origin"]) in common
            ]
            metrics = metric_values(selected)
            rows.append({
                "phase": phase,
                "horizon_days": horizon,
                "model": model,
                "family": family_for(model),
                **metrics,
            })
    return rows


def run(run_directory, output_directory):
    if output_directory.exists():
        raise ExperimentError(f"La carpeta de salida ya existe; no se sobrescribe: {output_directory}")
    metadata, sources, product_ids = load_inputs(run_directory)
    dates, panel, purchase_lines, receipt_units, receipts_by_product_day = build_panel(
        sources, product_ids
    )
    availability = availability_summary(dates, panel)
    output_directory.mkdir(parents=True, exist_ok=False)

    write_csv(
        output_directory / "serie_diaria.csv",
        panel_rows(dates, panel),
        [
            "producto_id", "fecha", "estado_observacion", "ventas_unidades",
            "stock_cierre_reconstruido", "precio_unitario_ponderado",
        ],
    )
    development_origins, holdout_origins = make_origin_sets(dates)
    development_predictions = evaluate_phase(
        "desarrollo", development_origins, dates, panel, product_ids,
        purchase_lines, receipt_units, receipts_by_product_day,
    )
    holdout_predictions = evaluate_phase(
        "holdout", holdout_origins, dates, panel, product_ids,
        purchase_lines, receipt_units, receipts_by_product_day,
        training_origins=development_origins + holdout_origins,
    )
    rankings = {
        horizon: rank_candidates(development_predictions, horizon)[0]
        for horizon in HORIZONS
    }
    common_counts = {
        str(horizon): rank_candidates(development_predictions, horizon)[1]
        for horizon in HORIZONS
    }

    prediction_columns = [
        "phase", "horizon_days", "model", "family", "product_id", "origin",
        "target_start", "target_end", "frequency_segment",
        "actual_units", "predicted_units",
    ]
    selected_dev = selected_family_predictions(development_predictions, rankings)
    selected_holdout = selected_family_predictions(holdout_predictions, rankings)
    write_csv(output_directory / "predicciones_desarrollo.csv", selected_dev, prediction_columns)
    write_csv(output_directory / "predicciones_holdout.csv", selected_holdout, prediction_columns)
    metric_rows = (
        candidate_metric_rows(development_predictions, "desarrollo")
        + candidate_metric_rows(holdout_predictions, "holdout")
    )
    write_csv(
        output_directory / "metricas_candidatos.csv",
        metric_rows,
        [
            "phase", "horizon_days", "model", "family", "n_product_origins",
            "products", "origins", "actual_units", "mae", "rmse", "wape",
            "origin_mae_std",
        ],
    )
    common_metric_rows = (
        common_cohort_metric_rows(development_predictions, "desarrollo")
        + common_cohort_metric_rows(holdout_predictions, "holdout")
    )
    write_csv(
        output_directory / "metricas_cohorte_comun.csv",
        common_metric_rows,
        [
            "phase", "horizon_days", "model", "family", "n_product_origins",
            "products", "origins", "actual_units", "mae", "rmse", "wape",
            "origin_mae_std",
        ],
    )
    segment_rows = segment_metrics(
        selected_dev + selected_holdout,
        {row["model"] for row in selected_dev + selected_holdout},
    )
    write_csv(
        output_directory / "metricas_segmento.csv",
        segment_rows,
        [
            "phase", "horizon_days", "model", "frequency_segment",
            "n_product_origins", "products", "origins", "actual_units",
            "mae", "rmse", "wape", "origin_mae_std",
        ],
    )

    summary = {
        "experiment": "minimarket-demand-daily-v1",
        "source_run_id": metadata["run_id"],
        "source_files_sha256": {
            filename: metadata["files"][filename]["sha256"]
            for filename in INPUT_FILES
        },
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "availability": availability,
        "development_origins": [day.isoformat() for day in development_origins],
        "holdout_origins": [day.isoformat() for day in holdout_origins],
        "holdout_is_used_for_selection": False,
        "holdout_training_policy": (
            "Ridge is refit at each origin using development origins and prior holdout "
            "origins whose labels end before the current origin; selected families and "
            "hyperparameters remain fixed from development."
        ),
        "common_development_product_origins_by_horizon": common_counts,
        "selected_development_families": {
            str(horizon): rankings[horizon] for horizon in HORIZONS
        },
        "historical_reference": historical_reference(),
        "interpretation": {
            "sales_target": "unidades de ventas realizadas observadas",
            "missing_days": "unknown unless opening stock, all intraday movement balances and closing stock are positive",
            "stockout_demand": "censored and excluded, not imputed",
            "holdout_warning": "few weekly origins and overlapping horizons; report as terminal evidence, not independent samples",
        },
    }
    write_json(output_directory / "resumen.json", summary)
    plot_results(output_directory, rankings, holdout_predictions)
    write_report(
        output_directory / "INFORME_EXPERIMENTO.md",
        metadata, availability, rankings, selected_holdout,
        segment_rows, holdout_origins, output_directory,
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Construye el panel de observabilidad y evalúa modelos sin imputar días censurados."
    )
    parser.add_argument("extract_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    arguments = parser.parse_args()
    try:
        result = run(arguments.extract_directory, arguments.output_directory)
        print(json.dumps({
            "output_directory": str(arguments.output_directory.resolve()),
            "availability": result["availability"],
            "common_development_product_origins_by_horizon":
                result["common_development_product_origins_by_horizon"],
            "selected_development_families": result["selected_development_families"],
        }, ensure_ascii=False, indent=2))
    except (ExperimentError, OSError, KeyError, ValueError) as error:
        print(f"Experimento detenido: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
