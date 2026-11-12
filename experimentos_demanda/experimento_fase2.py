import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge

import experimento_minimarket as v3


WINDOWS_BY_HORIZON = {
    7: (30, 45, 60, 90),
    14: (60, 90, 120, 150),
    30: (90, 120, 150, 180, 210),
}
STRATEGIES = ("rolling", "weighted_full_history")
RIDGE_GROUPS = ("history", "price", "supply", "full")
TOP_PREDICTIONS_PER_HORIZON = 5


def decay_weights(ages, half_life):
    return [2.0 ** (-age / half_life) for age in ages]


def weighted_mean(values, weights):
    denominator = sum(weights)
    if not values or denominator <= 0:
        return 0.0
    return sum(value * weight for value, weight in zip(values, weights)) / denominator


def selected_history(values, origin_index, window, strategy):
    history = [float(value) for value in values[:origin_index + 1]]
    if strategy == "rolling":
        return history[-min(window, len(history)):]
    if strategy == "weighted_full_history":
        return history
    raise v3.ExperimentError(f"Estrategia desconocida: {strategy}")


def history_rate(history, window, strategy):
    if not history:
        return 0.0
    if strategy == "rolling":
        return sum(history) / len(history)
    weights = decay_weights(range(len(history) - 1, -1, -1), window)
    return weighted_mean(history, weights)


def croston_weighted(history, alpha, half_life):
    events = [(index, float(value)) for index, value in enumerate(history) if value > 0]
    if len(events) < 2:
        return history_rate(history, half_life, "weighted_full_history")
    latest = len(history) - 1
    sizes = [size for _, size in events]
    size_weights = decay_weights(
        [latest - index for index, _ in events],
        half_life,
    )
    intervals = [
        float(events[index][0] - events[index - 1][0])
        for index in range(1, len(events))
    ]
    interval_weights = decay_weights(
        [latest - events[index][0] for index in range(1, len(events))],
        half_life,
    )
    size = weighted_mean(sizes, size_weights)
    interval = weighted_mean(intervals, interval_weights)
    return max(0.0, (1.0 - alpha / 2.0) * size / interval)


def adida_forecast(history, alpha, horizon, strategy, half_life):
    weekly = [
        sum(history[max(0, end - 7):end])
        for end in range(len(history), 0, -7)
        if end - 7 >= 0
    ]
    weekly.reverse()
    if not weekly:
        return history_rate(history, half_life, strategy) * horizon
    if strategy == "rolling":
        rate = v3.forecast_croston(weekly, alpha)
        if rate is None:
            rate = sum(weekly[-4:]) / min(len(weekly), 4) / 7.0
        else:
            rate /= 7.0
    else:
        rate = croston_weighted(weekly, alpha, max(half_life / 7.0, 1.0)) / 7.0
    return max(0.0, rate * horizon)


def tsb_weighted(history, alpha, beta, half_life):
    if not any(value > 0 for value in history):
        return 0.0
    scaled_alpha = 1.0 - (1.0 - alpha) ** (7.0 / half_life)
    scaled_beta = 1.0 - (1.0 - beta) ** (7.0 / half_life)
    return v3.forecast_tsb(history, scaled_alpha, scaled_beta)


def candidate_specs(horizon):
    specs = []
    for strategy in STRATEGIES:
        for window in WINDOWS_BY_HORIZON[horizon]:
            specs.append({
                "model": "moving_average",
                "family": "moving_average",
                "strategy": strategy,
                "window_days": window,
                "kind": "moving",
            })
            for alpha in v3.CROSTON_ALPHAS:
                specs.append({
                    "model": f"croston_sba_alpha_{alpha:g}",
                    "family": "croston_sba",
                    "strategy": strategy,
                    "window_days": window,
                    "kind": "croston",
                    "alpha": alpha,
                })
            for alpha in v3.TSB_SMOOTHING:
                for beta in v3.TSB_SMOOTHING:
                    specs.append({
                        "model": f"tsb_alpha_{alpha:g}_beta_{beta:g}",
                        "family": "tsb",
                        "strategy": strategy,
                        "window_days": window,
                        "kind": "tsb",
                        "alpha": alpha,
                        "beta": beta,
                    })
            for alpha in v3.CROSTON_ALPHAS:
                specs.append({
                    "model": f"adida_alpha_{alpha:g}",
                    "family": "adida",
                    "strategy": strategy,
                    "window_days": window,
                    "kind": "adida",
                    "alpha": alpha,
                })
            for group in RIDGE_GROUPS:
                for alpha in v3.RIDGE_ALPHAS:
                    specs.append({
                        "model": f"ridge_{group}_alpha_{alpha:g}",
                        "family": f"ridge_{group}",
                        "strategy": strategy,
                        "window_days": window,
                        "kind": "ridge",
                        "group": group,
                        "alpha": alpha,
                    })
    return specs


def candidate_id(spec):
    return "|".join((
        spec["strategy"],
        str(spec["window_days"]),
        spec["model"],
    ))


def v3_common_keys(rows, horizon):
    model_keys = defaultdict(set)
    for row in rows:
        if int(row["horizon_days"]) == horizon:
            model_keys[row["model"]].add((
                int(row["product_id"]),
                row["origin"],
            ))
    if not model_keys:
        raise v3.ExperimentError(
            f"v3 no contiene predicciones para el horizonte de {horizon} días."
        )
    return set.intersection(*model_keys.values())


def as_prediction(row):
    return {
        **row,
        "horizon_days": int(row["horizon_days"]),
        "product_id": int(row["product_id"]),
        "actual_units": float(row["actual_units"]),
        "predicted_units": float(row["predicted_units"]),
    }


def input_v3_predictions(v3_directory, phase):
    filename = (
        "predicciones_desarrollo.csv"
        if phase == "desarrollo"
        else "predicciones_holdout.csv"
    )
    with (v3_directory / filename).open(encoding="utf-8-sig", newline="") as stream:
        return [as_prediction(row) for row in csv.DictReader(stream)]


def prepare_indexes(purchase_lines, receipt_units, receipts_by_product_day):
    purchases, receipts = v3.prepare_feature_indexes(
        purchase_lines,
        receipts_by_product_day,
    )
    return purchases, receipt_units, receipts


def weighted_slope(values, weights):
    if len(values) < 2:
        return 0.0
    positions = np.arange(len(values), dtype=float)
    weight_array = np.asarray(weights, dtype=float)
    value_array = np.asarray(values, dtype=float)
    mean_position = float(np.average(positions, weights=weight_array))
    mean_value = float(np.average(value_array, weights=weight_array))
    centered = positions - mean_position
    denominator = float(np.dot(weight_array, centered * centered))
    if denominator <= 0:
        return 0.0
    return float(np.dot(weight_array, centered * (value_array - mean_value)) / denominator)


def phase2_features(
    dates,
    panel,
    product_id,
    origin_index,
    horizon,
    spec,
    purchase_lines_by_product,
    receipt_units,
    receipts_by_product_day_by_product,
    cache,
):
    strategy = spec["strategy"]
    window = spec["window_days"]
    group = spec["group"]
    cache_key = (
        product_id, origin_index, horizon, group, strategy, window,
    )
    if cache_key in cache:
        return cache[cache_key]

    series = panel[product_id]
    all_history = series["values"][:origin_index + 1]
    if not all_history or any(value is None for value in all_history):
        return None
    if strategy == "rolling":
        values = [float(value) for value in all_history[-min(window, len(all_history)):]]
        weights = [1.0] * len(values)
    else:
        values = [float(value) for value in all_history]
        weights = decay_weights(range(len(values) - 1, -1, -1), window)
    features = {f"product_id={product_id}": 1.0}
    features["sales_rate_configured"] = weighted_mean(values, weights)
    features["positive_fraction_configured"] = weighted_mean(
        [float(value > 0) for value in values],
        weights,
    )
    features["slope_configured"] = weighted_slope(values, weights)
    positive_positions = [index for index, value in enumerate(values) if value > 0]
    features["days_since_sale_capped"] = (
        len(values) - positive_positions[-1] - 1 if positive_positions else len(values)
    )
    features["history_days_available"] = float(len(values))

    for weekday in range(7):
        count = sum(
            dates[index].weekday() == weekday
            for index in range(origin_index + 1, origin_index + horizon + 1)
        )
        features[f"target_weekday_{weekday}_fraction"] = count / horizon

    if group in ("price", "full"):
        price_history = [
            (index, price)
            for index, price in enumerate(series["prices"][:origin_index + 1])
            if price is not None
        ]
        if strategy == "rolling":
            price_history = [
                (index, price) for index, price in price_history
                if index >= origin_index - window + 1
            ]
            price_weights = [1.0] * len(price_history)
        else:
            price_weights = decay_weights(
                [origin_index - index for index, _ in price_history],
                window,
            )
        prices = [price for _, price in price_history]
        features["has_price_history"] = float(bool(prices))
        if prices:
            features["last_recorded_unit_price"] = prices[-1]
            features["mean_recorded_unit_price"] = weighted_mean(prices, price_weights)
            features["price_change_last_vs_mean"] = (
                prices[-1] - features["mean_recorded_unit_price"]
            )

    if group in ("supply", "full"):
        origin = dates[origin_index]
        cutoff = origin
        features["stock_at_origin"] = float(series["stock"][origin_index])
        order_lines = purchase_lines_by_product.get(product_id, ())
        receipt_days = receipts_by_product_day_by_product.get(product_id, ())
        if strategy == "rolling":
            lower = origin - timedelta(days=min(window, len(dates)) - 1)
            features["orders_units_configured"] = sum(
                line["ordered_units"] for line in order_lines
                if line["created"].date() <= cutoff and line["created"].date() >= lower
            )
            features["receipts_units_configured"] = sum(
                units for day, units in receipt_days if lower <= day <= cutoff
            )
        else:
            order_ages = [
                (line["created"].date(), line["ordered_units"])
                for line in order_lines
                if line["created"].date() <= cutoff
            ]
            features["orders_units_configured"] = sum(
                units * 2.0 ** (-(origin - day).days / window)
                for day, units in order_ages
            )
            features["receipts_units_configured"] = sum(
                units * 2.0 ** (-(origin - day).days / window)
                for day, units in receipt_days if day <= cutoff
            )
        features["receipts_units_28"] = sum(
            units for day, units in receipt_days
            if origin - timedelta(days=27) <= day <= origin
        )
        features["orders_units_28"] = sum(
            line["ordered_units"] for line in order_lines
            if origin - timedelta(days=27) <= line["created"].date() <= origin
        )
        ordered = defaultdict(float)
        for line in order_lines:
            if line["created"].date() <= cutoff:
                ordered[(line["purchase_id"], product_id)] += line["ordered_units"]
        pending = 0.0
        for key, ordered_units in ordered.items():
            received = sum(
                units for received_at, units in receipt_units.get(key, ())
                if received_at.date() <= cutoff
            )
            pending += max(0.0, ordered_units - received)
        features["pending_order_units_asof_origin"] = pending
    cache[cache_key] = features
    return features


def training_examples(
    dates,
    panel,
    product_ids,
    horizon,
    origin_index,
    spec,
    historical_origins,
    indexes,
    feature_cache,
):
    purchase_lines_by_product, receipt_units, receipts_by_product_day_by_product = indexes
    feature_rows = []
    targets = []
    for historical_origin in historical_origins:
        historical_index = (historical_origin - dates[0]).days
        if historical_index + horizon >= origin_index:
            continue
        for product_id in product_ids:
            target = v3.eligible_sample(
                dates, panel, product_id, historical_index, horizon
            )
            if target is None:
                continue
            features = phase2_features(
                dates, panel, product_id, historical_index, horizon, spec,
                purchase_lines_by_product, receipt_units,
                receipts_by_product_day_by_product, feature_cache,
            )
            if features is not None:
                feature_rows.append(features)
                targets.append(target)
    return feature_rows, targets


def predict_ridge(train_features, train_targets, test_features, alpha):
    if len(train_targets) < 20:
        return None
    vectorizer = DictVectorizer(sparse=True)
    x_train = vectorizer.fit_transform(train_features)
    model = Ridge(alpha=alpha, solver="lsqr")
    model.fit(x_train, np.asarray(train_targets, dtype=float))
    return np.maximum(0.0, model.predict(vectorizer.transform(test_features)))


def model_forecast(spec, panel, product_id, origin_index, horizon):
    history = selected_history(
        panel[product_id]["values"],
        origin_index,
        spec["window_days"],
        spec["strategy"],
    )
    if not history:
        return 0.0
    strategy = spec["strategy"]
    window = spec["window_days"]
    kind = spec["kind"]
    if kind == "moving":
        return history_rate(history, window, strategy) * horizon
    if kind == "croston":
        if strategy == "rolling":
            rate = v3.forecast_croston(history, spec["alpha"])
            if rate is None:
                rate = sum(history[-28:]) / min(len(history), 28)
        else:
            rate = croston_weighted(history, spec["alpha"], window)
        return rate * horizon
    if kind == "tsb":
        if strategy == "rolling":
            rate = v3.forecast_tsb(history, spec["alpha"], spec["beta"])
        else:
            rate = tsb_weighted(history, spec["alpha"], spec["beta"], window)
        return rate * horizon
    if kind == "adida":
        return adida_forecast(
            history, spec["alpha"], horizon, strategy, window
        )
    raise v3.ExperimentError(f"Modelo inesperado: {kind}")


def predict_one_spec(
    spec,
    horizon,
    phase,
    origins,
    dates,
    panel,
    product_ids,
    indexes,
    training_origins,
    allowed_keys,
    feature_cache,
    train_cache,
):
    date_index = {day: index for index, day in enumerate(dates)}
    predictions = []
    for origin in origins:
        origin_index = date_index.get(origin)
        if origin_index is None:
            continue
        selected = [
            (product_id, origin.isoformat())
            for product_id in product_ids
            if (product_id, origin.isoformat()) in allowed_keys
        ]
        if not selected:
            continue
        if spec["kind"] != "ridge":
            for product_id, origin_text in selected:
                history_start = max(0, origin_index - v3.HISTORY_DAYS + 1)
                predictions.append({
                    "phase": phase,
                    "horizon_days": horizon,
                    "candidate_id": candidate_id(spec),
                    "model": spec["model"],
                    "family": spec["family"],
                    "strategy": spec["strategy"],
                    "window_days": spec["window_days"],
                    "feature_group": "",
                    "product_id": product_id,
                    "origin": origin_text,
                    "actual_units": v3.eligible_sample(
                        dates, panel, product_id, origin_index, horizon
                    ),
                    "predicted_units": max(
                        0.0,
                        float(model_forecast(spec, panel, product_id, origin_index, horizon)),
                    ),
                    "frequency_segment": v3.frequency_segment(
                        panel[product_id]["values"][history_start:origin_index + 1]
                    ),
                })
            continue

        test_features = []
        test_keys = []
        purchase_lines_by_product, receipt_units, receipts_by_product_day_by_product = indexes
        for product_id, origin_text in selected:
            features = phase2_features(
                dates, panel, product_id, origin_index, horizon, spec,
                purchase_lines_by_product, receipt_units,
                receipts_by_product_day_by_product, feature_cache,
            )
            if features is not None:
                test_features.append(features)
                test_keys.append((product_id, origin_text))
        if not test_features:
            continue
        train_key = (
            horizon,
            origin_text,
            spec["strategy"],
            spec["window_days"],
            spec["group"],
        )
        if train_key not in train_cache:
            previous_origins = [
                day for day in training_origins if day < origin
            ]
            train_cache[train_key] = training_examples(
                dates, panel, product_ids, horizon, origin_index, spec,
                previous_origins, indexes, feature_cache,
            )
        train_features, train_targets = train_cache[train_key]
        values = predict_ridge(
            train_features, train_targets, test_features, spec["alpha"]
        )
        if values is None:
            continue
        for (product_id, origin_text), prediction in zip(test_keys, values):
            history_start = max(0, origin_index - v3.HISTORY_DAYS + 1)
            predictions.append({
                "phase": phase,
                "horizon_days": horizon,
                "candidate_id": candidate_id(spec),
                "model": spec["model"],
                "family": spec["family"],
                "strategy": spec["strategy"],
                "window_days": spec["window_days"],
                "feature_group": spec["group"],
                "product_id": product_id,
                "origin": origin_text,
                "actual_units": v3.eligible_sample(
                    dates, panel, product_id, origin_index, horizon
                ),
                "predicted_units": float(prediction),
                "frequency_segment": v3.frequency_segment(
                    panel[product_id]["values"][history_start:origin_index + 1]
                ),
            })
    return predictions


def metric_row(predictions, spec, phase, horizon):
    values = v3.metric_values(predictions)
    if values is None:
        return None
    return {
        "phase": phase,
        "horizon_days": horizon,
        "candidate_id": candidate_id(spec),
        "model": spec["model"],
        "family": spec["family"],
        "strategy": spec["strategy"],
        "window_days": spec["window_days"],
        "feature_group": spec.get("group", ""),
        "alpha": spec.get("alpha", ""),
        "beta": spec.get("beta", ""),
        **values,
    }


def rank_metrics(rows):
    if not rows:
        return []
    rank_values = defaultdict(list)
    for metric in ("mae", "rmse", "wape"):
        ordered = sorted(
            (row[metric], row["candidate_id"])
            for row in rows if row[metric] is not None
        )
        for rank, (_, candidate) in enumerate(ordered, start=1):
            rank_values[candidate].append(rank)
    ranked = []
    for row in rows:
        ranks = rank_values.get(row["candidate_id"], [])
        if not ranks:
            continue
        ranked.append({
            **row,
            "mean_metric_rank": sum(ranks) / len(ranks),
        })
    return sorted(
        ranked,
        key=lambda row: (
            row["mean_metric_rank"],
            row["mae"],
            row["rmse"],
            row["candidate_id"],
        ),
    )


def product_and_segment_rows(predictions):
    by_product = defaultdict(list)
    by_segment = defaultdict(list)
    for row in predictions:
        product_key = (
            row["phase"], row["horizon_days"], row["candidate_id"],
            row["product_id"],
        )
        segment_key = (
            row["phase"], row["horizon_days"], row["candidate_id"],
            row["frequency_segment"],
        )
        by_product[product_key].append(row)
        by_segment[segment_key].append(row)
    product_rows = []
    for key, rows in by_product.items():
        product_rows.append({
            "phase": key[0],
            "horizon_days": key[1],
            "candidate_id": key[2],
            "product_id": key[3],
            **v3.metric_values(rows),
        })
    segment_rows = []
    for key, rows in by_segment.items():
        segment_rows.append({
            "phase": key[0],
            "horizon_days": key[1],
            "candidate_id": key[2],
            "frequency_segment": key[3],
            **v3.metric_values(rows),
        })
    return product_rows, segment_rows


def write_csv(path, rows, columns):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def v3_controls(v3_rows, phase, horizon):
    selected = [
        row for row in v3_rows
        if row["horizon_days"] == horizon
    ]
    results = []
    for model in sorted({row["model"] for row in selected}):
        rows = [row for row in selected if row["model"] == model]
        results.append({
            "phase": phase,
            "horizon_days": horizon,
            "candidate_id": f"v3_control|{model}",
            "model": model,
            "family": rows[0]["family"],
            "strategy": "v3_fixed_56_day",
            "window_days": 56,
            "feature_group": "",
            "alpha": "",
            "beta": "",
            **v3.metric_values(rows),
        })
    return results


def load_v3_selection(v3_directory):
    return json.loads((v3_directory / "resumen.json").read_text(encoding="utf-8"))


def write_report(
    path,
    source_run_id,
    availability,
    dev_origins,
    holdout_origins,
    dev_rankings,
    holdout_metrics,
    control_metrics,
    product_metrics,
    segment_metrics,
    v3_summary,
):
    lines = [
        "# Fase 2: optimización experimental de demanda",
        "",
        f"- Extracto: `{source_run_id}`",
        f"- Comparador inmutable: v3 (`{v3_summary['source_run_id']}`).",
        f"- Etiquetas: {availability['first_label_date']} a {availability['last_label_date']}; "
        "observabilidad y exclusiones heredadas sin cambios.",
        f"- Producto-días observables: {availability['observed_available_product_days']} de "
        f"{availability['product_day_count']}; censurados/no disponibles: "
        f"{availability['censored_or_unavailable_product_days']}.",
        "",
        "## Método y control de fuga",
        "",
        "- Orígenes y cohortes comunes se toman de las predicciones guardadas de v3. Solo se puntúan producto-orígenes presentes en la intersección común de los modelos v3 para cada fase y horizonte.",
        "- Ventana móvil usa min(X, días históricos disponibles) y no incorpora observaciones posteriores al origen.",
        "- Historial completo ponderado usa pesos exponenciales normalizados `2^(-edad/X)`. X funciona como semivida: una observación X días antigua pesa la mitad que una de hoy. Así se compara la escala temporal con la ventana móvil sin cortar el historial.",
        "- Para TSB, alpha y beta se reescalan desde la semivida de 7 días: `1-(1-parametro)^(7/X)`. Croston pondera eventos e intervalos por recencia; ADIDA aplica la ponderación a bloques semanales.",
        "- Ridge usa las mismas variables candidatas por grupo que v3, pero recalcula estadísticos sobre X días o sobre todo el historial ponderado. Compras, recepciones, stock y precio solo entran si eran conocidos en el origen.",
        "- Ridge se reentrena por origen con objetivos históricos que terminan estrictamente antes del origen. Hiperparámetros se seleccionan con desarrollo; el holdout solo evalúa las configuraciones ya elegidas.",
        f"- Desarrollo: {len(dev_origins)} orígenes ({dev_origins[0].isoformat()}–{dev_origins[-1].isoformat()}); "
        f"holdout: {', '.join(day.isoformat() for day in holdout_origins)}.",
        "- Las cohortes comunes v3 pueden excluir algunos orígenes por cobertura del Ridge; el número efectivo es `n_product_origins` en cada tabla.",
        "- La clasificación/ponderación no imputó días desconocidos. Los errores agregados no son independientes: los horizontes de 14/30 días se solapan y hay pocos orígenes de holdout.",
        "",
        "## Configuración ganadora por horizonte",
        "",
        "| Horizonte | Candidato Fase 2 | Dev n | MAE | RMSE | WAPE | Holdout n | MAE | RMSE | WAPE |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for horizon in v3.HORIZONS:
        winner = dev_rankings[horizon][0]
        hold = next(
            (
                row for row in holdout_metrics
                if row["horizon_days"] == horizon
                and row["candidate_id"] == winner["candidate_id"]
            ),
            None,
        )
        lines.append(
            f"| {horizon} | `{winner['model']}` / `{winner['strategy']}` / "
            f"{winner['window_days']}d"
            f"{' / ' + winner['feature_group'] if winner['feature_group'] else ''} | "
            f"{winner['n_product_origins']} | {v3.format_metric(winner['mae'])} | "
            f"{v3.format_metric(winner['rmse'])} | {v3.format_metric(winner['wape'])} | "
            f"{hold['n_product_origins'] if hold else 0} | "
            f"{v3.format_metric(hold['mae'] if hold else None)} | "
            f"{v3.format_metric(hold['rmse'] if hold else None)} | "
            f"{v3.format_metric(hold['wape'] if hold else None)} |"
        )
    lines += [
        "",
        "## Comparación directa con v3",
        "",
        "| Horizonte | Mejor v3 (desarrollo) | v3 MAE/RMSE/WAPE | Mejor Fase 2 (desarrollo) | Fase 2 MAE/RMSE/WAPE | Cambio MAE | Cambio RMSE | Cambio WAPE | Holdout Fase 2 vs v3 |",
        "|---:|---|---|---|---|---:|---:|---:|---|",
    ]
    for horizon in v3.HORIZONS:
        winner = dev_rankings[horizon][0]
        selected_v3 = v3_summary["selected_development_families"][str(horizon)][0]["model"]
        baseline = next(
            row for row in control_metrics
            if row["phase"] == "desarrollo"
            and row["horizon_days"] == horizon
            and row["model"] == selected_v3
        )
        baseline_holdout = next(
            row for row in control_metrics
            if row["phase"] == "holdout"
            and row["horizon_days"] == horizon
            and row["model"] == selected_v3
        )
        best_holdout = next(
            (
                row for row in holdout_metrics
                if row["horizon_days"] == horizon
                and row["candidate_id"] == winner["candidate_id"]
            ),
            None,
        )
        development_change = [
            (winner[metric] - baseline[metric]) / baseline[metric] * 100
            if baseline[metric] else math.nan
            for metric in ("mae", "rmse", "wape")
        ]
        holdout_change = [
            (best_holdout[metric] - baseline_holdout[metric])
            / baseline_holdout[metric] * 100
            if best_holdout and baseline_holdout[metric] else math.nan
            for metric in ("mae", "rmse", "wape")
        ]
        lines.append(
            f"| {horizon} | `{selected_v3}` | "
            f"{v3.format_metric(baseline['mae'])}/{v3.format_metric(baseline['rmse'])}/"
            f"{v3.format_metric(baseline['wape'])} | "
            f"`{winner['candidate_id']}` | "
            f"{v3.format_metric(winner['mae'])}/{v3.format_metric(winner['rmse'])}/"
            f"{v3.format_metric(winner['wape'])} | "
            f"{development_change[0]:+.1f}% | {development_change[1]:+.1f}% | "
            f"{development_change[2]:+.1f}% | "
            f"{holdout_change[0]:+.1f}% / {holdout_change[1]:+.1f}% / "
            f"{holdout_change[2]:+.1f}% (MAE/RMSE/WAPE) |"
        )
    lines += [
        "",
        "Los cambios porcentuales negativos son mejoras (menos error). La comparación de desarrollo usa la intersección de producto-orígenes de v3; las métricas de configuración y control están en `metricas_candidatos.csv`. En holdout, ninguna configuración se selecciona con sus métricas.",
        "",
        "## Estabilidad por segmento y producto",
        "",
        "| Horizonte | Segmento holdout | Fase 2 MAE | v3 MAE | Fase 2 WAPE | v3 WAPE |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    for horizon in v3.HORIZONS:
        if horizon != v3.HORIZONS[0]:
            lines.extend([
                "",
                "| Horizonte | Segmento holdout | Fase 2 MAE | v3 MAE | Fase 2 WAPE | v3 WAPE |",
                "|---:|---|---:|---:|---:|---:|",
            ])
        winner = dev_rankings[horizon][0]
        selected_v3 = v3_summary["selected_development_families"][str(horizon)][0]["model"]
        candidate_id_value = winner["candidate_id"]
        baseline_id = f"v3_control|{selected_v3}"
        candidate_segments = {
            row["frequency_segment"]: row
            for row in segment_metrics
            if row["phase"] == "holdout"
            and row["horizon_days"] == horizon
            and row["candidate_id"] == candidate_id_value
        }
        baseline_segments = {
            row["frequency_segment"]: row
            for row in segment_metrics
            if row["phase"] == "holdout"
            and row["horizon_days"] == horizon
            and row["candidate_id"] == baseline_id
        }
        for segment in sorted(set(candidate_segments) & set(baseline_segments)):
            candidate = candidate_segments[segment]
            baseline = baseline_segments[segment]
            lines.append(
                f"| {horizon} | {segment} | "
                f"{v3.format_metric(candidate['mae'])} | "
                f"{v3.format_metric(baseline['mae'])} | "
                f"{v3.format_metric(candidate['wape'])} | "
                f"{v3.format_metric(baseline['wape'])} |"
            )
        candidate_products = {
            row["product_id"]: row
            for row in product_metrics
            if row["phase"] == "holdout"
            and row["horizon_days"] == horizon
            and row["candidate_id"] == candidate_id_value
        }
        baseline_products = {
            row["product_id"]: row
            for row in product_metrics
            if row["phase"] == "holdout"
            and row["horizon_days"] == horizon
            and row["candidate_id"] == baseline_id
        }
        paired = [
            (
                candidate_products[product_id]["mae"],
                baseline_products[product_id]["mae"],
            )
            for product_id in set(candidate_products) & set(baseline_products)
        ]
        better = sum(candidate < baseline for candidate, baseline in paired)
        worse = sum(candidate > baseline for candidate, baseline in paired)
        equal = len(paired) - better - worse
        lines.append(
            f"\nH{horizon}: MAE por producto en holdout mejora en {better}, "
            f"empeora en {worse}, queda igual en {equal} de {len(paired)} "
            f"productos frente al mejor modelo v3."
        )
    lines += [
        "",
        "## Recomendación y estabilidad",
        "",
        "La selección principal usa el promedio de rangos MAE/RMSE/WAPE entre todas las configuraciones sobre la misma cohorte. Consulte `metricas_candidatos.csv` para ver la tabla completa, `metricas_por_producto.csv` y `metricas_por_segmento.csv` para heterogeneidad y cobertura.",
        "- Interpretar los resultados como evidencia exploratoria: solo hay cinco orígenes semanales de holdout y sus horizontes se solapan.",
        "- La selección por rango reduce sensibilidad a escala entre métricas, pero no sustituye intervalos de incertidumbre ni análisis de costo de sobrestock/quiebre.",
        "- No se declara mejora general si el ganador de desarrollo empeora de forma material en holdout o si la cobertura/productos/segmentos cambian.",
        "",
        "## Archivos",
        "",
        "- `metricas_candidatos.csv`: todas las ventanas, estrategias y modelos, además de los controles v3.",
        "- `predicciones_top5.csv`: predicciones de desarrollo y holdout de los cinco mejores candidatos por horizonte.",
        "- `metricas_por_producto.csv`, `metricas_por_segmento.csv`, `resumen.json` y gráficos WAPE.",
        "",
        "Reejecución: `python experimentos_demanda/experimento_fase2.py <extract-directory> <v3-results-directory> <new-output-directory>`.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def plot_results(output_directory, dev_rankings, holdout_metrics):
    for horizon in v3.HORIZONS:
        ranked = dev_rankings[horizon][:10]
        labels = [
            f"{row['strategy'].replace('_', ' ')}\n{row['window_days']}d "
            f"{row['family']}"
            for row in ranked
        ]
        dev_values = [row["wape"] or 0.0 for row in ranked]
        hold_values = []
        for row in ranked:
            hold = next(
                (
                    candidate for candidate in holdout_metrics
                    if candidate["horizon_days"] == horizon
                    and candidate["candidate_id"] == row["candidate_id"]
                ),
                None,
            )
            hold_values.append(hold["wape"] if hold and hold["wape"] is not None else 0.0)
        positions = np.arange(len(ranked))
        width = 0.38
        figure, axis = v3.plt.subplots(figsize=(max(10, len(ranked) * 1.1), 6))
        axis.bar(positions - width / 2, dev_values, width, label="Desarrollo")
        axis.bar(positions + width / 2, hold_values, width, label="Holdout")
        axis.set_xticks(positions, labels, rotation=35, ha="right")
        axis.set_ylabel("WAPE")
        axis.set_title(f"Fase 2: mejores configuraciones, horizonte {horizon} días")
        axis.grid(axis="y", alpha=0.25)
        axis.legend()
        figure.tight_layout()
        figure.savefig(output_directory / f"wape_h{horizon}.png", dpi=150)
        v3.plt.close(figure)


def read_output_metrics(path):
    integer_fields = {
        "horizon_days", "window_days", "n_product_origins", "products",
        "origins", "product_id",
    }
    float_fields = {
        "actual_units", "mae", "rmse", "wape", "origin_mae_std",
    }
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        for field in integer_fields:
            if row.get(field):
                row[field] = int(row[field])
        for field in float_fields:
            if row.get(field):
                row[field] = float(row[field])
            else:
                row[field] = None
    return rows


def refresh_report(output_directory, v3_directory):
    summary = json.loads((output_directory / "resumen.json").read_text(encoding="utf-8"))
    v3_summary = load_v3_selection(v3_directory)
    all_metrics = read_output_metrics(output_directory / "metricas_candidatos.csv")
    dev_rankings = {
        int(horizon): rows
        for horizon, rows in summary["selected_development"].items()
    }
    write_report(
        output_directory / "INFORME_FASE2.md",
        summary["source_run_id"],
        summary["availability"],
        [date.fromisoformat(value) for value in summary["development_origins"]],
        [date.fromisoformat(value) for value in summary["holdout_origins"]],
        dev_rankings,
        [
            row for row in all_metrics
            if row["phase"] == "holdout"
            and row["strategy"] != "v3_fixed_56_day"
        ],
        [
            row for row in all_metrics
            if row["strategy"] == "v3_fixed_56_day"
        ],
        read_output_metrics(output_directory / "metricas_por_producto.csv"),
        read_output_metrics(output_directory / "metricas_por_segmento.csv"),
        v3_summary,
    )


def run(extract_directory, v3_directory, output_directory):
    repository_root = Path(__file__).resolve().parent.parent
    resolved_output = output_directory.resolve()
    try:
        resolved_output.relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise v3.ExperimentError("La salida de Fase 2 debe permanecer fuera del repositorio.")
    if output_directory.exists():
        raise v3.ExperimentError(f"La salida ya existe; no se sobrescribe: {output_directory}")
    v3_summary = load_v3_selection(v3_directory)
    metadata, sources, product_ids = v3.load_inputs(extract_directory)
    if metadata["run_id"] != v3_summary["source_run_id"]:
        raise v3.ExperimentError("El extracto no coincide con la fuente registrada por v3.")
    dates, panel, purchase_lines, receipt_units, receipts_by_product_day = (
        v3.build_panel(sources, product_ids)
    )
    availability = v3.availability_summary(dates, panel)
    if availability != v3_summary["availability"]:
        raise v3.ExperimentError("La cobertura reconstruida no coincide con la de v3.")
    development_origins, holdout_origins = v3.make_origin_sets(dates)
    if [day.isoformat() for day in development_origins] != v3_summary["development_origins"]:
        raise v3.ExperimentError("Orígenes de desarrollo no coinciden con v3.")
    if [day.isoformat() for day in holdout_origins] != v3_summary["holdout_origins"]:
        raise v3.ExperimentError("Orígenes holdout no coinciden con v3.")

    v3_dev = input_v3_predictions(v3_directory, "desarrollo")
    v3_hold = input_v3_predictions(v3_directory, "holdout")
    common_keys = {
        (phase, horizon): v3_common_keys(rows, horizon)
        for phase, rows in (("desarrollo", v3_dev), ("holdout", v3_hold))
        for horizon in v3.HORIZONS
    }
    for horizon in v3.HORIZONS:
        expected = int(v3_summary["common_development_product_origins_by_horizon"][str(horizon)])
        if len(common_keys[("desarrollo", horizon)]) != expected:
            raise v3.ExperimentError(
                f"La cohorte común v3 de {horizon} días no coincide con el resumen."
            )

    indexes = prepare_indexes(
        purchase_lines,
        receipt_units,
        receipts_by_product_day,
    )
    output_directory.mkdir(parents=True, exist_ok=False)
    all_metrics = []
    all_configs = [
        {"horizon_days": horizon, "candidate_id": candidate_id(spec), **spec}
        for horizon in v3.HORIZONS
        for spec in candidate_specs(horizon)
    ]
    all_predictions = []
    product_metrics = []
    segment_metrics = []
    development_rankings = {}
    holdout_metrics = []
    control_metrics = []
    candidate_cache = {}
    feature_cache = {}
    train_cache = {}

    for phase, origins, training_origins, v3_rows in (
        ("desarrollo", development_origins, development_origins, v3_dev),
        (
            "holdout",
            holdout_origins,
            development_origins + holdout_origins,
            v3_hold,
        ),
    ):
        for horizon in v3.HORIZONS:
            allowed = common_keys[(phase, horizon)]
            common_v3_rows = [
                row for row in v3_rows
                if row["horizon_days"] == horizon
                and (row["product_id"], row["origin"]) in allowed
            ]
            controls = v3_controls(common_v3_rows, phase, horizon)
            control_metrics.extend(controls)
            control_predictions = [
                {
                    **row,
                    "candidate_id": f"v3_control|{row['model']}",
                    "strategy": "v3_fixed_56_day",
                    "window_days": 56,
                    "feature_group": "",
                }
                for row in common_v3_rows
            ]
            product_rows, segment_rows = product_and_segment_rows(control_predictions)
            product_metrics.extend(product_rows)
            segment_metrics.extend(segment_rows)
            candidate_specs_for_horizon = candidate_specs(horizon)
            phase_rows = []
            for index, spec in enumerate(candidate_specs_for_horizon, start=1):
                predictions = predict_one_spec(
                    spec, horizon, phase, origins, dates, panel, product_ids,
                    indexes, training_origins, allowed, feature_cache, train_cache,
                )
                expected_count = len(allowed)
                if len(predictions) != expected_count:
                    raise v3.ExperimentError(
                        f"{candidate_id(spec)} cubrió {len(predictions)} de "
                        f"{expected_count} producto-orígenes comunes ({phase}, H{horizon})."
                    )
                candidate_cache[(phase, horizon, candidate_id(spec))] = spec
                row = metric_row(predictions, spec, phase, horizon)
                if row is not None:
                    phase_rows.append(row)
                    all_metrics.append(row)
                    product_rows, segment_rows = product_and_segment_rows(predictions)
                    product_metrics.extend(product_rows)
                    segment_metrics.extend(segment_rows)
                if phase == "desarrollo" and index % 20 == 0:
                    print(
                        f"desarrollo H{horizon}: {index}/"
                        f"{len(candidate_specs_for_horizon)} configuraciones",
                        file=sys.stderr,
                    )
                del predictions
            if phase == "desarrollo":
                development_rankings[horizon] = rank_metrics(phase_rows)
                if not development_rankings[horizon]:
                    raise v3.ExperimentError(
                        f"No hubo candidatos evaluables en desarrollo para H{horizon}."
                    )
            else:
                holdout_metrics.extend(phase_rows)

    for horizon in v3.HORIZONS:
        for row in development_rankings[horizon][:TOP_PREDICTIONS_PER_HORIZON]:
            spec = candidate_cache[("desarrollo", horizon, row["candidate_id"])]
            for phase, origins, training_origins in (
                ("desarrollo", development_origins, development_origins),
                (
                    "holdout",
                    holdout_origins,
                    development_origins + holdout_origins,
                ),
            ):
                predictions = predict_one_spec(
                    spec, horizon, phase, origins, dates, panel, product_ids,
                    indexes, training_origins, common_keys[(phase, horizon)],
                    feature_cache, train_cache,
                )
                for prediction in predictions:
                    product_id = prediction["product_id"]
                    origin_index = (date.fromisoformat(prediction["origin"]) - dates[0]).days
                    prediction["frequency_segment"] = v3.frequency_segment(
                        panel[product_id]["values"][
                            origin_index - v3.HISTORY_DAYS + 1:origin_index + 1
                        ]
                    )
                    all_predictions.append(prediction)
    all_metrics.extend(control_metrics)
    metric_columns = [
        "phase", "horizon_days", "candidate_id", "model", "family", "strategy",
        "window_days", "feature_group", "alpha", "beta",
        "n_product_origins", "products", "origins", "actual_units",
        "mae", "rmse", "wape", "origin_mae_std",
    ]
    write_csv(output_directory / "metricas_candidatos.csv", all_metrics, metric_columns)
    write_csv(
        output_directory / "configuraciones.csv",
        all_configs,
        [
            "horizon_days", "candidate_id", "model", "family", "strategy",
            "window_days", "kind", "group", "alpha", "beta",
        ],
    )
    write_csv(
        output_directory / "metricas_por_producto.csv",
        product_metrics,
        [
            "phase", "horizon_days", "candidate_id", "product_id",
            "n_product_origins", "products", "origins", "actual_units",
            "mae", "rmse", "wape", "origin_mae_std",
        ],
    )
    write_csv(
        output_directory / "metricas_por_segmento.csv",
        segment_metrics,
        [
            "phase", "horizon_days", "candidate_id", "frequency_segment",
            "n_product_origins", "products", "origins", "actual_units",
            "mae", "rmse", "wape", "origin_mae_std",
        ],
    )
    write_csv(
        output_directory / "predicciones_top5.csv",
        all_predictions,
        [
            "phase", "horizon_days", "candidate_id", "model", "family",
            "strategy", "window_days", "feature_group", "product_id", "origin",
            "actual_units", "predicted_units", "frequency_segment",
        ],
    )
    plot_results(output_directory, development_rankings, holdout_metrics)
    report_best = {
        horizon: development_rankings[horizon]
        for horizon in v3.HORIZONS
    }
    write_report(
        output_directory / "INFORME_FASE2.md",
        metadata["run_id"],
        availability,
        development_origins,
        holdout_origins,
        report_best,
        holdout_metrics,
        control_metrics,
        product_metrics,
        segment_metrics,
        v3_summary,
    )
    summary = {
        "experiment": "minimarket-demand-phase2-v4",
        "source_run_id": metadata["run_id"],
        "v3_results_directory": str(v3_directory.resolve()),
        "availability": availability,
        "development_origins": [day.isoformat() for day in development_origins],
        "holdout_origins": [day.isoformat() for day in holdout_origins],
        "common_product_origins": {
            f"{phase}_h{horizon}": len(keys)
            for (phase, horizon), keys in common_keys.items()
        },
        "window_sets": {str(h): list(w) for h, w in WINDOWS_BY_HORIZON.items()},
        "strategies": {
            "rolling": "últimos min(X, días disponibles), sin fuga",
            "weighted_full_history": "media exponencial 2^(-edad/X), X como semivida",
        },
        "holdout_used_for_selection": False,
        "selected_development": {
            str(horizon): development_rankings[horizon][:TOP_PREDICTIONS_PER_HORIZON]
            for horizon in v3.HORIZONS
        },
        "v3_selected_development": v3_summary["selected_development_families"],
        "metric_rows": len(all_metrics),
        "configuration_rows": len(all_configs),
        "prediction_rows_top5": len(all_predictions),
        "source_files_sha256": v3_summary["source_files_sha256"],
    }
    with (output_directory / "resumen.json").open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Optimiza ventanas y ponderación temporal contra v3."
    )
    parser.add_argument("extract_directory", type=Path)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    try:
        summary = run(args.extract_directory, args.v3_directory, args.output_directory)
        print(json.dumps({
            "output_directory": str(args.output_directory.resolve()),
            "common_product_origins": summary["common_product_origins"],
            "selected_development": {
                horizon: [
                    {
                        "candidate_id": row["candidate_id"],
                        "mae": row["mae"],
                        "rmse": row["rmse"],
                        "wape": row["wape"],
                    }
                    for row in rows[:1]
                ]
                for horizon, rows in summary["selected_development"].items()
            },
        }, ensure_ascii=False, indent=2))
    except (v3.ExperimentError, OSError, KeyError, ValueError) as error:
        print(f"Fase 2 detenida: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
