import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import experimento_fase2 as phase2
import experimento_minimarket as v3
import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge


SEGMENT_WINDOW_DAYS = 56
FREQUENT_MIN_SALE_DAYS = 8
FREQUENT_MAX_MEAN_INTERVAL_DAYS = 7.0
FREQUENT_MAX_DAYS_SINCE_SALE = 14
LOW_MAX_UNITS_PER_56_DAYS = 8.0


def classify_product_history(values):
    if len(values) != SEGMENT_WINDOW_DAYS or any(value is None for value in values):
        return {
            "segment": "unknown",
            "window_days": len(values),
            "sale_days": None,
            "units": None,
            "mean_inter_sale_interval_days": None,
        }

    numeric = [float(value) for value in values]
    sale_positions = [index for index, value in enumerate(numeric) if value > 0]
    sale_days = len(sale_positions)
    units = sum(numeric)
    intervals = [
        sale_positions[index] - sale_positions[index - 1]
        for index in range(1, sale_days)
    ]
    mean_interval = sum(intervals) / len(intervals) if intervals else None
    days_since_sale = (
        len(numeric) - sale_positions[-1] - 1 if sale_positions else None
    )

    if (
        sale_days >= FREQUENT_MIN_SALE_DAYS
        and mean_interval is not None
        and mean_interval <= FREQUENT_MAX_MEAN_INTERVAL_DAYS
        and days_since_sale is not None
        and days_since_sale <= FREQUENT_MAX_DAYS_SINCE_SALE
    ):
        segment = "frequent"
    elif units <= LOW_MAX_UNITS_PER_56_DAYS:
        segment = "low"
    else:
        segment = "intermittent"

    return {
        "segment": segment,
        "window_days": SEGMENT_WINDOW_DAYS,
        "sale_days": sale_days,
        "units": units,
        "mean_inter_sale_interval_days": mean_interval,
        "days_since_sale": days_since_sale,
    }


def segment_at_origin(dates, panel, product_id, origin):
    try:
        origin_index = dates.index(origin)
    except ValueError as error:
        raise v3.ExperimentError(f"Origen fuera del panel: {origin}.") from error
    start = origin_index - SEGMENT_WINDOW_DAYS + 1
    if start < 0:
        return classify_product_history([])
    return classify_product_history(
        panel[product_id]["values"][start:origin_index + 1]
    )


def segment_keys(dates, panel, keys):
    by_segment = defaultdict(set)
    labels = {}
    diagnostics = []
    for product_id, origin_text in keys:
        origin = date.fromisoformat(origin_text)
        observation = segment_at_origin(dates, panel, product_id, origin)
        if observation["segment"] == "unknown":
            raise v3.ExperimentError(
                f"No se puede segmentar producto {product_id} en {origin_text}: "
                "historial incompleto o no observable."
            )
        key = (product_id, origin_text)
        labels[key] = observation["segment"]
        by_segment[observation["segment"]].add(key)
        diagnostics.append({
            "product_id": product_id,
            "origin": origin_text,
            **observation,
        })
    return by_segment, labels, diagnostics


def candidate_specs(horizon, segment):
    specs = []
    v4_specs = phase2.candidate_specs(horizon)
    if segment == "frequent":
        specs.extend(
            spec for spec in v4_specs
            if spec["kind"] == "moving" or spec["kind"] == "ridge"
        )
        for strategy in phase2.STRATEGIES:
            for window in phase2.WINDOWS_BY_HORIZON[horizon]:
                specs.append({
                    "model": "linear_trend",
                    "family": "linear_trend",
                    "strategy": strategy,
                    "window_days": window,
                    "kind": "trend",
                })
    elif segment == "intermittent":
        specs.extend(
            spec for spec in v4_specs
            if spec["kind"] in {"croston", "tsb", "adida"}
        )
    elif segment == "low":
        specs.append({
            "model": "zero_baseline",
            "family": "baseline",
            "strategy": "baseline",
            "window_days": 0,
            "kind": "zero",
        })
        specs.extend(
            spec for spec in v4_specs
            if spec["kind"] == "moving"
        )
    else:
        raise v3.ExperimentError(f"Segmento no reconocido: {segment}.")
    return specs


def candidate_id(segment, spec):
    return "|".join((
        segment,
        spec["strategy"],
        str(spec["window_days"]),
        spec["model"],
    ))


def trend_forecast(spec, panel, product_id, origin_index, horizon):
    history = phase2.selected_history(
        panel[product_id]["values"],
        origin_index,
        spec["window_days"],
        spec["strategy"],
    )
    if len(history) < 2:
        return sum(history) / len(history) * horizon if history else 0.0
    if spec["strategy"] == "rolling":
        weights = [1.0] * len(history)
    else:
        weights = phase2.decay_weights(
            range(len(history) - 1, -1, -1),
            spec["window_days"],
        )
    slope = phase2.weighted_slope(history, weights)
    positions = list(range(len(history)))
    weight_total = sum(weights)
    mean_position = sum(pos * weight for pos, weight in zip(positions, weights)) / weight_total
    mean_value = sum(value * weight for value, weight in zip(history, weights)) / weight_total
    intercept = mean_value - slope * mean_position
    return sum(
        max(0.0, intercept + slope * position)
        for position in range(len(history), len(history) + horizon)
    )


def forecast(spec, panel, product_id, origin_index, horizon):
    if spec["kind"] == "zero":
        return 0.0
    if spec["kind"] == "trend":
        return trend_forecast(spec, panel, product_id, origin_index, horizon)
    return phase2.model_forecast(spec, panel, product_id, origin_index, horizon)


def segment_training_examples(
    segment,
    spec,
    horizon,
    origin_index,
    dates,
    panel,
    product_ids,
    historical_origins,
    indexes,
    feature_cache,
):
    purchase_lines_by_product, receipt_units, receipts_by_product_day = indexes
    feature_rows = []
    targets = []
    for historical_origin in historical_origins:
        historical_index = (historical_origin - dates[0]).days
        if historical_index + horizon >= origin_index:
            continue
        history_start = historical_index - SEGMENT_WINDOW_DAYS + 1
        if history_start < 0:
            continue
        for product_id in product_ids:
            historical_values = panel[product_id]["values"][
                history_start:historical_index + 1
            ]
            if classify_product_history(historical_values)["segment"] != segment:
                continue
            target = v3.eligible_sample(
                dates,
                panel,
                product_id,
                historical_index,
                horizon,
            )
            if target is None:
                continue
            features = phase2.phase2_features(
                dates,
                panel,
                product_id,
                historical_index,
                horizon,
                spec,
                purchase_lines_by_product,
                receipt_units,
                receipts_by_product_day,
                feature_cache,
            )
            if features is not None:
                feature_rows.append(features)
                targets.append(target)
    return feature_rows, targets


def predict_segment_spec(
    spec,
    segment,
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
    if spec["kind"] != "ridge":
        results = []
        date_index = {day: index for index, day in enumerate(dates)}
        for origin in origins:
            origin_index = date_index.get(origin)
            if origin_index is None:
                continue
            for product_id in product_ids:
                origin_text = origin.isoformat()
                key = (product_id, origin_text)
                if key not in allowed_keys:
                    continue
                results.append({
                    "phase": phase,
                    "horizon_days": horizon,
                    "segment": segment,
                    "candidate_id": candidate_id(segment, spec),
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
                        float(forecast(spec, panel, product_id, origin_index, horizon)),
                    ),
                })
        return results

    date_index = {day: index for index, day in enumerate(dates)}
    purchase_lines_by_product, receipt_units, receipts_by_product_day = indexes
    result = []
    for origin in origins:
        origin_index = date_index.get(origin)
        if origin_index is None:
            continue
        origin_text = origin.isoformat()
        selected = [
            product_id for product_id in product_ids
            if (product_id, origin_text) in allowed_keys
        ]
        if not selected:
            continue
        test_features = []
        test_product_ids = []
        for product_id in selected:
            features = phase2.phase2_features(
                dates,
                panel,
                product_id,
                origin_index,
                horizon,
                spec,
                purchase_lines_by_product,
                receipt_units,
                receipts_by_product_day,
                feature_cache,
            )
            if features is not None:
                test_features.append(features)
                test_product_ids.append(product_id)
        if len(test_features) != len(selected):
            raise v3.ExperimentError(
                f"Ridge no pudo construir features para todos los productos "
                f"del segmento {segment} en {origin_text}."
            )
        cache_key = (
            segment,
            spec["strategy"],
            spec["window_days"],
            spec["group"],
            horizon,
            origin_text,
        )
        if cache_key not in train_cache:
            train_cache[cache_key] = segment_training_examples(
                segment,
                spec,
                horizon,
                origin_index,
                dates,
                panel,
                product_ids,
                [day for day in training_origins if day < origin],
                indexes,
                feature_cache,
            )
        train_features, train_targets = train_cache[cache_key]
        if not train_targets:
            raise v3.ExperimentError(
                f"Ridge segmentado sin ejemplos de entrenamiento ({segment}, {origin_text})."
            )
        vectorizer = DictVectorizer(sparse=True)
        x_train = vectorizer.fit_transform(train_features)
        model = Ridge(alpha=spec["alpha"], solver="lsqr")
        model.fit(x_train, np.asarray(train_targets, dtype=float))
        predictions = np.maximum(
            0.0,
            model.predict(vectorizer.transform(test_features)),
        )
        for product_id, prediction in zip(test_product_ids, predictions):
            result.append({
                "phase": phase,
                "horizon_days": horizon,
                "segment": segment,
                "candidate_id": candidate_id(segment, spec),
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
                "training_examples": len(train_targets),
            })
    return result


def metric_row(predictions, segment, spec, phase, horizon):
    values = v3.metric_values(predictions)
    if values is None:
        return None
    training_sizes = [
        row["training_examples"] for row in predictions
        if row.get("training_examples") is not None
    ]
    return {
        "phase": phase,
        "horizon_days": horizon,
        "segment": segment,
        "candidate_id": candidate_id(segment, spec),
        "model": spec["model"],
        "family": spec["family"],
        "strategy": spec["strategy"],
        "window_days": spec["window_days"],
        "feature_group": spec.get("group", ""),
        "alpha": spec.get("alpha", ""),
        "beta": spec.get("beta", ""),
        "minimum_training_examples": min(training_sizes) if training_sizes else "",
        "median_training_examples": (
            float(np.median(training_sizes)) if training_sizes else ""
        ),
        **values,
    }


def rank_candidates(rows):
    if not rows:
        return []
    rankings = defaultdict(list)
    for metric in ("mae", "rmse", "wape"):
        ordered = sorted(
            (row[metric], row["candidate_id"])
            for row in rows
            if row[metric] is not None
        )
        for rank, (_, candidate) in enumerate(ordered, start=1):
            rankings[candidate].append(rank)
    result = []
    for row in rows:
        ranks = rankings.get(row["candidate_id"], [])
        if ranks:
            result.append({
                **row,
                "mean_metric_rank": sum(ranks) / len(ranks),
            })
    return sorted(
        result,
        key=lambda row: (
            row["mean_metric_rank"],
            row["mae"],
            row["rmse"],
            row["candidate_id"],
        ),
    )


def load_v3_selected_predictions(directory, summary, phase):
    filename = (
        "predicciones_desarrollo.csv"
        if phase == "desarrollo"
        else "predicciones_holdout.csv"
    )
    selected_models = {
        int(horizon): summary["selected_development_families"][str(horizon)][0]["model"]
        for horizon in v3.HORIZONS
    }
    rows = []
    with (directory / filename).open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            horizon = int(row["horizon_days"])
            if row["model"] != selected_models[horizon]:
                continue
            rows.append({
                **row,
                "horizon_days": horizon,
                "product_id": int(row["product_id"]),
                "actual_units": float(row["actual_units"]),
                "predicted_units": float(row["predicted_units"]),
                "candidate_id": f"v3|{row['model']}",
                "segment": "",
                "strategy": "v3",
                "window_days": v3.HISTORY_DAYS,
                "feature_group": "",
            })
    return rows


def load_v4_selected_predictions(directory, summary, phase):
    selected = {
        int(horizon): rows[0]["candidate_id"]
        for horizon, rows in summary["selected_development"].items()
    }
    rows = []
    with (directory / "predicciones_top5.csv").open(
        encoding="utf-8-sig",
        newline="",
    ) as stream:
        for row in csv.DictReader(stream):
            horizon = int(row["horizon_days"])
            if row["phase"] != phase or row["candidate_id"] != selected[horizon]:
                continue
            rows.append({
                **row,
                "horizon_days": horizon,
                "product_id": int(row["product_id"]),
                "actual_units": float(row["actual_units"]),
                "predicted_units": float(row["predicted_units"]),
                "segment": "",
            })
    return rows


def assert_same_actuals(rows_by_source, phase, horizon, expected_keys, dates, panel):
    observed = {}
    for source_name, rows in rows_by_source.items():
        actuals = {
            (row["product_id"], row["origin"]): row["actual_units"]
            for row in rows
            if row["horizon_days"] == horizon
        }
        if set(actuals) != expected_keys:
            raise v3.ExperimentError(
                f"Cohorte distinta para {source_name} en {phase}, H{horizon}."
            )
        if observed and actuals != next(iter(observed.values())):
            raise v3.ExperimentError(
                f"Valores reales incompatibles entre fuentes en {phase}, H{horizon}."
            )
        observed[source_name] = actuals
    panel_actuals = {}
    for product_id, origin_text in expected_keys:
        origin_index = (
            date.fromisoformat(origin_text) - dates[0]
        ).days
        panel_actuals[(product_id, origin_text)] = v3.eligible_sample(
            dates,
            panel,
            product_id,
            origin_index,
            horizon,
        )
    if observed and panel_actuals != next(iter(observed.values())):
        raise v3.ExperimentError(
            f"Los reales de v3/v4 no coinciden con el panel ({phase}, H{horizon})."
        )


def metrics_by_product(predictions, labels):
    grouped = defaultdict(list)
    for row in predictions:
        key = (
            row["phase"],
            row["horizon_days"],
            row["segment"] or labels[(row["product_id"], row["origin"])],
            row["candidate_id"],
            row["product_id"],
        )
        grouped[key].append(row)
    return [
        {
            "phase": phase,
            "horizon_days": horizon,
            "segment": segment,
            "candidate_id": candidate,
            "product_id": product_id,
            **v3.metric_values(rows),
        }
        for (phase, horizon, segment, candidate, product_id), rows
        in sorted(grouped.items())
    ]


def metrics_by_segment(predictions):
    grouped = defaultdict(list)
    for row in predictions:
        grouped[(
            row["phase"], row["horizon_days"], row["segment"],
            row["candidate_id"],
        )].append(row)
    return [
        {
            "phase": phase,
            "horizon_days": horizon,
            "segment": segment,
            "candidate_id": candidate,
            **v3.metric_values(rows),
        }
        for (phase, horizon, segment, candidate), rows in sorted(grouped.items())
    ]


def write_csv(path, rows, columns):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def format_metrics(row):
    return "/".join(
        v3.format_metric(row.get(metric))
        for metric in ("mae", "rmse", "wape")
    )


def write_comparison_charts(output_directory, segment_comparison):
    for horizon in v3.HORIZONS:
        rows = [
            row for row in segment_comparison
            if row["horizon_days"] == horizon
        ]
        segments = [
            f"{row['segment']}\n(n={row['n_product_origins']})" for row in rows
        ]
        positions = np.arange(len(segments))
        width = 0.24
        figure, axes = v3.plt.subplots(1, 2, figsize=(10, 4.5))
        for offset, (source, label) in enumerate((
            ("v3", "v3"),
            ("v4", "v4"),
            ("v5", "v5 especializado"),
        )):
            axes[0].bar(
                positions + (offset - 1) * width,
                [row[f"{source}_mae"] for row in rows],
                width,
                label=label,
            )
            axes[1].bar(
                positions + (offset - 1) * width,
                [
                    row[f"{source}_wape"]
                    if row[f"{source}_wape"] is not None else np.nan
                    for row in rows
                ],
                width,
                label=label,
            )
        for axis, metric, title in (
            (axes[0], "MAE (unidades)", "MAE por producto-origen"),
            (axes[1], "WAPE (razón)", "WAPE por segmento"),
        ):
            axis.set_xticks(positions)
            axis.set_xticklabels(segments)
            axis.set_ylabel(metric)
            axis.set_title(title)
            axis.grid(axis="y", alpha=0.25)
        axes[1].legend()
        figure.suptitle(f"Fase 3 — comparación holdout, horizonte {horizon} días")
        figure.tight_layout()
        figure.savefig(
            output_directory / f"comparacion_segmentos_h{horizon}.png",
            dpi=150,
        )
        v3.plt.close(figure)


def write_report(
    path,
    summary,
    development_rankings,
    segment_comparison,
    product_win_counts,
):
    lines = [
        "# Fase 3: segmentación y modelos especializados",
        "",
        f"- Extracto heredado: `{summary['source_run_id']}`.",
        "- Fuentes comparativas: resultados guardados de v3 y v4; no se modificaron ni se reextrajeron.",
        f"- Observabilidad: {summary['availability']['observed_available_product_days']} / "
        f"{summary['availability']['product_day_count']} producto-días; "
        f"{summary['availability']['censored_or_unavailable_product_days']} censurados.",
        "",
        "## Segmentación dinámica, calculada al origen",
        "",
        f"- Se utilizan los {SEGMENT_WINDOW_DAYS} días observables terminados en cada origen; ventana completa con ventas, unidades y días entre ocurrencias.",
        f"- **Frecuente:** al menos {FREQUENT_MIN_SALE_DAYS} días positivos y promedio de intervalos entre ventas ≤ {FREQUENT_MAX_MEAN_INTERVAL_DAYS:.0f} días.",
        f"- Además, venta más reciente dentro de {FREQUENT_MAX_DAYS_SINCE_SALE} días para evitar mantener en frecuente un historial antiguo seguido de silencio.",
        f"- **Baja:** no califica como frecuente y registra ≤ {LOW_MAX_UNITS_PER_56_DAYS:g} unidades en 56 días (≤ 1 unidad/semana).",
        "- **Intermitente:** restante; demanda superior al umbral bajo, pero frecuencia inferior a frecuente.",
        "- Umbrales fijados antes de mirar el holdout. Los conteos de productos son producto-orígenes: un producto puede cambiar de segmento entre orígenes.",
        "- Sin historial plenamente observable no se asigna segmento ni se imputa cero. Los criterios se basan solo en valores hasta el origen.",
        "",
        "## Modelos y evaluación",
        "",
        "- Frecuente: promedios móviles, Ridge con grupos de variables de v4 y tendencia lineal ponderada; ambas estrategias de ventanas de v4.",
        "- Intermitente: Croston-SBA, TSB y ADIDA con ventanas/estrategias e hiperparámetros de v4.",
        "- Baja: baseline cero y promedios móviles simples de v4.",
        "- La selección por segmento usa el promedio de rangos MAE/RMSE/WAPE en desarrollo. Holdout se reserva para evaluación. Las familias se restringen por pertinencia definida antes de ver las métricas.",
        "- WAPE se expresa como razón (por ejemplo, 1.0 equivale a 100%).",
        "- Ridge segmentado usa todos los ejemplos disponibles en su segmento, incluso cuando son escasos al inicio; las columnas `minimum_training_examples` y `median_training_examples` documentan el riesgo de inestabilidad.",
        "- V3 y v4 globales se comparan sobre el mismo conjunto de producto-orígenes clasificado con esta regla; el híbrido combina los ganadores de desarrollo por segmento.",
        "",
        "| Horizonte | Segmento | n desarrollo | Ganador (modelo / estrategia / ventana) | Dev MAE/RMSE/WAPE | Holdout n | Holdout MAE/RMSE/WAPE |",
        "|---:|---|---:|---|---|---:|---|",
    ]
    for horizon in v3.HORIZONS:
        for segment in ("frequent", "intermittent", "low"):
            winner = development_rankings[(horizon, segment)][0]
            hold = next(
                row for row in summary["selected_holdout_metrics"]
                if row["horizon_days"] == horizon
                and row["segment"] == segment
                and row["candidate_id"] == winner["candidate_id"]
            )
            lines.append(
                f"| {horizon} | {segment} | {winner['n_product_origins']} | "
                f"`{winner['model']}` / `{winner['strategy']}` / "
                f"{winner['window_days']}d"
                f"{' / ' + winner['feature_group'] if winner['feature_group'] else ''} | "
                f"{format_metrics(winner)} | {hold['n_product_origins']} | "
                f"{format_metrics(hold)} |"
            )
    lines += [
        "",
        "## Comparación global del híbrido",
        "",
        "| Horizonte | v3 dev | v5 dev | Cambio dev MAE/RMSE/WAPE | v3 holdout | v4 holdout | v5 holdout |",
        "|---:|---|---|---|---|---|---|",
    ]
    for horizon in v3.HORIZONS:
        values = {
            (row["phase"], row["horizon_days"], row["candidate_id"]): row
            for row in summary["hybrid_comparison"]
        }
        v3_dev = values[("desarrollo", horizon, "v3_selected_global")]
        v5_dev = values[("desarrollo", horizon, "v5_segment_specialist_hybrid")]
        v3_hold = values[("holdout", horizon, "v3_selected_global")]
        v4_hold = values[("holdout", horizon, "v4_selected_global")]
        v5_hold = values[("holdout", horizon, "v5_segment_specialist_hybrid")]
        changes = [
            (v5_dev[metric] - v3_dev[metric]) / v3_dev[metric] * 100
            if v3_dev[metric] else math.nan
            for metric in ("mae", "rmse", "wape")
        ]
        lines.append(
            f"| {horizon} | {format_metrics(v3_dev)} | {format_metrics(v5_dev)} | "
            f"{changes[0]:+.1f}%/{changes[1]:+.1f}%/{changes[2]:+.1f}% | "
            f"{format_metrics(v3_hold)} | {format_metrics(v4_hold)} | "
            f"{format_metrics(v5_hold)} |"
        )
    lines += [
        "",
        "Los cambios negativos indican menos error. El resultado global no debe sustituir la lectura por segmento: los promedios agregados pueden ocultar regresiones en un grupo.",
        "",
        "## Segmentos y productos pronosticables",
        "",
        "| Horizonte | Segmento | v3 MAE/WAPE | v4 MAE/WAPE | v5 especializado MAE/WAPE |",
        "|---:|---|---|---|---|",
    ]
    for row in segment_comparison:
        lines.append(
            f"| {row['horizon_days']} | {row['segment']} | "
            f"{v3.format_metric(row.get('v3_mae'))}/{v3.format_metric(row.get('v3_wape'))} | "
            f"{v3.format_metric(row.get('v4_mae'))}/{v3.format_metric(row.get('v4_wape'))} | "
            f"{v3.format_metric(row.get('v5_mae'))}/{v3.format_metric(row.get('v5_wape'))} |"
        )
    lines += [
        "",
        "| Horizonte | Segmento | Productos con menor MAE vs v3 | vs v4 |",
        "|---:|---|---:|---:|",
    ]
    for row in product_win_counts:
        lines.append(
            f"| {row['horizon_days']} | {row['segment']} | "
            f"{row['better_vs_v3']}/{row['products']} | "
            f"{row['better_vs_v4']}/{row['products']} |"
        )
    lines += [
        "",
        "Los productos con pocos eventos tienen métricas discretas y WAPE puede ser indefinido cuando la demanda real agregada es cero; están incluidos en MAE/RMSE y no se excluyen por su resultado. Consulte `metricas_por_producto.csv` para el detalle de cada producto-origen/segmento.",
        "",
        "## Limitaciones",
        "",
        "- El holdout consta de cinco orígenes semanales y horizontes solapados; los resultados son evidencia exploratoria, no una garantía de estabilidad futura.",
        "- La segmentación depende del umbral de 56 días y de los límites de frecuencia/volumen fijados. Productos cercanos a un umbral pueden cambiar de segmento entre orígenes.",
        "- La clasificación usa ventas observadas con disponibilidad reconstruida; no mide demanda perdida por quiebres ni calidad de movimientos no registrados.",
        "- Ridge y tendencias se evalúan solo para el segmento frecuente; no se extrapola su ventaja a demanda intermitente o baja.",
        "",
        "## Archivos",
        "",
        "- `segmentacion_por_origen.csv`: atributos usados y segmento asignado por producto/origen.",
        "- `configuraciones.csv`, `metricas_candidatos.csv`, `predicciones_modelos_seleccionados.csv`.",
        "- `metricas_por_segmento.csv`, `metricas_por_producto.csv`, `comparacion_v3_v4_v5.csv`, `resumen.json` y gráficos de comparación por horizonte.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def run(extract_directory, v3_directory, v4_directory, output_directory):
    repository_root = Path(__file__).resolve().parent.parent
    try:
        output_directory.resolve().relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise v3.ExperimentError("La salida v5 debe quedar fuera del repositorio.")
    if output_directory.exists():
        raise v3.ExperimentError(f"La salida ya existe; no se sobrescribe: {output_directory}")

    v3_summary = json.loads((v3_directory / "resumen.json").read_text(encoding="utf-8"))
    v4_summary = json.loads((v4_directory / "resumen.json").read_text(encoding="utf-8"))
    metadata, sources, product_ids = v3.load_inputs(extract_directory)
    if metadata["run_id"] != v3_summary["source_run_id"]:
        raise v3.ExperimentError("El extracto no corresponde al usado por v3.")
    if metadata["run_id"] != v4_summary["source_run_id"]:
        raise v3.ExperimentError("El extracto no corresponde al usado por v4.")
    dates, panel, purchase_lines, receipt_units, receipts_by_product_day = (
        v3.build_panel(sources, product_ids)
    )
    availability = v3.availability_summary(dates, panel)
    if availability != v3_summary["availability"] or availability != v4_summary["availability"]:
        raise v3.ExperimentError("La observabilidad no coincide entre el panel y v3/v4.")
    development_origins, holdout_origins = v3.make_origin_sets(dates)
    if [day.isoformat() for day in development_origins] != v3_summary["development_origins"]:
        raise v3.ExperimentError("Los orígenes de desarrollo no coinciden con v3.")
    if [day.isoformat() for day in holdout_origins] != v3_summary["holdout_origins"]:
        raise v3.ExperimentError("Los orígenes de holdout no coinciden con v3.")

    common = {}
    v3_selected = {}
    v4_selected = {}
    for phase in ("desarrollo", "holdout"):
        all_v3_rows = phase2.input_v3_predictions(v3_directory, phase)
        for horizon in v3.HORIZONS:
            keys = phase2.v3_common_keys(all_v3_rows, horizon)
            if phase == "desarrollo":
                expected = int(
                    v3_summary["common_development_product_origins_by_horizon"][
                        str(horizon)
                    ]
                )
                if len(keys) != expected:
                    raise v3.ExperimentError(
                        f"Cohorte v3 H{horizon} incompatible con resumen."
                    )
            common[(phase, horizon)] = keys
        selected_v3_rows = load_v3_selected_predictions(
            v3_directory,
            v3_summary,
            phase,
        )
        v3_selected[phase] = [
            row for row in selected_v3_rows
            if (row["product_id"], row["origin"])
            in common[(phase, row["horizon_days"])]
        ]
        v4_selected[phase] = load_v4_selected_predictions(
            v4_directory,
            v4_summary,
            phase,
        )
        v4_selected[phase] = [
            row for row in v4_selected[phase]
            if (row["product_id"], row["origin"])
            in common[(phase, row["horizon_days"])]
        ]
    for phase, rows in (
        ("desarrollo", v4_selected["desarrollo"]),
        ("holdout", v4_selected["holdout"]),
    ):
        for horizon in v3.HORIZONS:
            keys = {
                (row["product_id"], row["origin"])
                for row in rows if row["horizon_days"] == horizon
            }
            if keys != common[(phase, horizon)]:
                raise v3.ExperimentError(
                    f"La cohorte del mejor modelo v4 no coincide con v3 ({phase}, H{horizon})."
                )
            assert_same_actuals(
                {
                    "v3": [
                        row for row in v3_selected[phase]
                        if row["horizon_days"] == horizon
                    ],
                    "v4": [
                        row for row in v4_selected[phase]
                        if row["horizon_days"] == horizon
                    ],
                },
                phase,
                horizon,
                common[(phase, horizon)],
                dates,
                panel,
            )

    segment_by_phase_horizon = {}
    labels_by_phase_horizon = {}
    segment_diagnostics = []
    for phase, origins in (
        ("desarrollo", development_origins),
        ("holdout", holdout_origins),
    ):
        for horizon in v3.HORIZONS:
            segments, labels, diagnostics = segment_keys(
                dates, panel, common[(phase, horizon)]
            )
            segment_by_phase_horizon[(phase, horizon)] = segments
            labels_by_phase_horizon[(phase, horizon)] = labels
            segment_diagnostics.extend([
                {"phase": phase, "horizon_days": horizon, **row}
                for row in diagnostics
            ])
            if set(segments) != {"frequent", "intermittent", "low"}:
                raise v3.ExperimentError(
                    f"Falta un segmento en {phase}, H{horizon}: {sorted(segments)}"
                )

    indexes = phase2.prepare_indexes(
        purchase_lines,
        receipt_units,
        receipts_by_product_day,
    )
    output_directory.mkdir(parents=True, exist_ok=False)
    all_metrics = []
    all_configs = []
    development_rankings = {}
    selected_holdout_metrics = []
    feature_cache = {}
    train_cache = {}
    selected_specs = {}

    for phase, origins, training_origins in (
        ("desarrollo", development_origins, development_origins),
        ("holdout", holdout_origins, development_origins + holdout_origins),
    ):
        for horizon in v3.HORIZONS:
            for segment in ("frequent", "intermittent", "low"):
                allowed_keys = segment_by_phase_horizon[(phase, horizon)][segment]
                if phase == "desarrollo":
                    specs = candidate_specs(horizon, segment)
                    all_configs.extend({
                        "horizon_days": horizon,
                        "segment": segment,
                        "candidate_id": candidate_id(segment, spec),
                        **spec,
                    } for spec in specs)
                else:
                    specs = [selected_specs[(horizon, segment)]]
                phase_rows = []
                for index, spec in enumerate(specs, start=1):
                    predictions = predict_segment_spec(
                        spec,
                        segment,
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
                    )
                    if len(predictions) != len(allowed_keys):
                        raise v3.ExperimentError(
                            f"{candidate_id(segment, spec)}: {len(predictions)} de "
                            f"{len(allowed_keys)} producto-orígenes ({phase}, H{horizon})."
                        )
                    row = metric_row(predictions, segment, spec, phase, horizon)
                    if row is not None:
                        all_metrics.append(row)
                        if phase == "desarrollo":
                            phase_rows.append(row)
                        else:
                            selected_holdout_metrics.append(row)
                    del predictions
                    if phase == "desarrollo" and index % 20 == 0:
                        print(
                            f"desarrollo H{horizon}/{segment}: {index}/{len(specs)}",
                            file=sys.stderr,
                        )
                if phase == "desarrollo":
                    ranked = rank_candidates(phase_rows)
                    if not ranked:
                        raise v3.ExperimentError(
                            f"No hay candidatos para desarrollo H{horizon}/{segment}."
                        )
                    development_rankings[(horizon, segment)] = ranked
                    selected_specs[(horizon, segment)] = next(
                        spec for spec in specs
                        if candidate_id(segment, spec) == ranked[0]["candidate_id"]
                    )

    selected_predictions = []
    hybrid_comparison = []
    for phase in ("desarrollo", "holdout"):
        rows = v3_selected[phase]
        labels_lookup = {
            horizon: labels_by_phase_horizon[(phase, horizon)]
            for horizon in v3.HORIZONS
        }
        selected_v3_rows = []
        for row in rows:
            output = dict(row)
            output["segment"] = labels_lookup[row["horizon_days"]][
                (row["product_id"], row["origin"])
            ]
            selected_v3_rows.append(output)
        v3_by_horizon = defaultdict(list)
        for row in selected_v3_rows:
            v3_by_horizon[row["horizon_days"]].append(row)
        for horizon, values in v3_by_horizon.items():
            hybrid_comparison.append({
                "phase": phase,
                "horizon_days": horizon,
                "candidate_id": "v3_selected_global",
                **v3.metric_values(values),
            })
        selected_v4_rows = v4_selected[phase]
        v4_by_horizon = defaultdict(list)
        for row in selected_v4_rows:
            output = dict(row)
            output["segment"] = labels_lookup[row["horizon_days"]][
                (row["product_id"], row["origin"])
            ]
            v4_by_horizon[row["horizon_days"]].append(output)
        for horizon, values in v4_by_horizon.items():
            hybrid_comparison.append({
                "phase": phase,
                "horizon_days": horizon,
                "candidate_id": "v4_selected_global",
                **v3.metric_values(values),
            })
        hybrid_rows = []
        for horizon in v3.HORIZONS:
            for segment in ("frequent", "intermittent", "low"):
                spec = selected_specs[(horizon, segment)]
                predictions = predict_segment_spec(
                    spec,
                    segment,
                    horizon,
                    phase,
                    development_origins if phase == "desarrollo" else holdout_origins,
                    dates,
                    panel,
                    product_ids,
                    indexes,
                    development_origins if phase == "desarrollo"
                    else development_origins + holdout_origins,
                    segment_by_phase_horizon[(phase, horizon)][segment],
                    feature_cache,
                    train_cache,
                )
                hybrid_rows.extend(predictions)
        hybrid_by_horizon = defaultdict(list)
        for row in hybrid_rows:
            hybrid_by_horizon[row["horizon_days"]].append(row)
        for horizon, values in hybrid_by_horizon.items():
            hybrid_comparison.append({
                "phase": phase,
                "horizon_days": horizon,
                "candidate_id": "v5_segment_specialist_hybrid",
                **v3.metric_values(values),
            })
        selected_predictions.extend(hybrid_rows)

    for phase, base_rows in (
        ("desarrollo", v3_selected["desarrollo"]),
        ("holdout", v3_selected["holdout"]),
    ):
        for horizon in v3.HORIZONS:
            segment_labels = labels_by_phase_horizon[(phase, horizon)]
            v3_segment_rows = [
                {**row, "segment": segment_labels[(row["product_id"], row["origin"])],
                 "candidate_id": "v3|" + row["model"]}
                for row in base_rows if row["horizon_days"] == horizon
            ]
            v4_rows = v4_selected[phase]
            v4_segment_rows = [
                {**row, "segment": segment_labels[(row["product_id"], row["origin"])]}
                for row in v4_rows if row["horizon_days"] == horizon
            ]
            selected_predictions.extend(v3_segment_rows)
            selected_predictions.extend(v4_segment_rows)

    segment_comparison = []
    for phase in ("holdout",):
        for horizon in v3.HORIZONS:
            labels = labels_by_phase_horizon[(phase, horizon)]
            candidates = {}
            for segment in ("frequent", "intermittent", "low"):
                winner = development_rankings[(horizon, segment)][0]
                candidates[("v5", segment)] = next(
                    row for row in selected_holdout_metrics
                    if row["horizon_days"] == horizon
                    and row["segment"] == segment
                    and row["candidate_id"] == winner["candidate_id"]
                )
                for model_name, source_rows in (
                    ("v3", v3_selected["holdout"]),
                    ("v4", v4_selected["holdout"]),
                ):
                    segment_rows = [
                        row for row in source_rows
                        if row["horizon_days"] == horizon
                        and labels.get((row["product_id"], row["origin"])) == segment
                    ]
                    candidates[(model_name, segment)] = v3.metric_values(segment_rows)
                segment_comparison.append({
                    "horizon_days": horizon,
                    "segment": segment,
                    "n_product_origins": candidates[("v5", segment)]["n_product_origins"],
                    "v3_mae": candidates[("v3", segment)]["mae"],
                    "v3_rmse": candidates[("v3", segment)]["rmse"],
                    "v3_wape": candidates[("v3", segment)]["wape"],
                    "v4_mae": candidates[("v4", segment)]["mae"],
                    "v4_rmse": candidates[("v4", segment)]["rmse"],
                    "v4_wape": candidates[("v4", segment)]["wape"],
                    "v5_mae": candidates[("v5", segment)]["mae"],
                    "v5_rmse": candidates[("v5", segment)]["rmse"],
                    "v5_wape": candidates[("v5", segment)]["wape"],
                })

    product_metrics = metrics_by_product(
        selected_predictions,
        {
            key: value
            for mapping in labels_by_phase_horizon.values()
            for key, value in mapping.items()
        },
    )
    selected_segment_metrics = metrics_by_segment(selected_predictions)
    product_win_counts = []
    for horizon in v3.HORIZONS:
        for segment in ("frequent", "intermittent", "low"):
            selected_v5 = development_rankings[(horizon, segment)][0]["candidate_id"]
            v5_products = {
                row["product_id"]: row
                for row in product_metrics
                if row["phase"] == "holdout"
                and row["horizon_days"] == horizon
                and row["segment"] == segment
                and row["candidate_id"] == selected_v5
            }
            counts = {}
            for baseline_name, prefix in (
                ("v3", "v3|"),
                ("v4", ""),
            ):
                if baseline_name == "v3":
                    baseline_id = next(
                        row["candidate_id"] for row in selected_predictions
                        if row["phase"] == "holdout"
                        and row["horizon_days"] == horizon
                        and row["candidate_id"].startswith(prefix)
                    )
                else:
                    baseline_id = next(
                        item["candidate_id"] for item in v4_selected["holdout"]
                        if item["horizon_days"] == horizon
                    )
                baseline_products = {
                    row["product_id"]: row
                    for row in product_metrics
                    if row["phase"] == "holdout"
                    and row["horizon_days"] == horizon
                    and row["segment"] == segment
                    and row["candidate_id"] == baseline_id
                }
                paired = set(v5_products) & set(baseline_products)
                counts[baseline_name] = sum(
                    v5_products[product_id]["mae"] < baseline_products[product_id]["mae"]
                    for product_id in paired
                )
                counts[f"{baseline_name}_n"] = len(paired)
            product_win_counts.append({
                "horizon_days": horizon,
                "segment": segment,
                "better_vs_v3": counts["v3"],
                "better_vs_v4": counts["v4"],
                "products": counts["v3_n"],
            })

    selected_holdout = [
        row for row in selected_holdout_metrics
        if row["candidate_id"]
        == development_rankings[(row["horizon_days"], row["segment"])][0]["candidate_id"]
    ]
    summary = {
        "experiment": "minimarket-demand-phase3-v5",
        "source_run_id": metadata["run_id"],
        "v3_results_directory": str(v3_directory.resolve()),
        "v4_results_directory": str(v4_directory.resolve()),
        "availability": availability,
        "development_origins": [day.isoformat() for day in development_origins],
        "holdout_origins": [day.isoformat() for day in holdout_origins],
        "cohort_counts": {
            f"{phase}_h{horizon}": len(keys)
            for (phase, horizon), keys in common.items()
        },
        "segment_thresholds": {
            "window_days": SEGMENT_WINDOW_DAYS,
            "frequent_min_sale_days": FREQUENT_MIN_SALE_DAYS,
            "frequent_max_mean_inter_sale_interval_days":
                FREQUENT_MAX_MEAN_INTERVAL_DAYS,
            "frequent_max_days_since_sale": FREQUENT_MAX_DAYS_SINCE_SALE,
            "low_max_units_per_window": LOW_MAX_UNITS_PER_56_DAYS,
        },
        "segment_origin_counts": {
            f"{phase}_h{horizon}": {
                segment: len(keys) for segment, keys in
                segment_by_phase_horizon[(phase, horizon)].items()
            }
            for phase in ("desarrollo", "holdout")
            for horizon in v3.HORIZONS
        },
        "selected_development": {
            f"h{horizon}_{segment}": development_rankings[(horizon, segment)][:10]
            for horizon in v3.HORIZONS
            for segment in ("frequent", "intermittent", "low")
        },
        "selected_holdout_metrics": selected_holdout,
        "hybrid_comparison": hybrid_comparison,
        "configuration_count": len(all_configs),
        "source_v3_files": v3_summary["source_files_sha256"],
    }
    write_csv(
        output_directory / "segmentacion_por_origen.csv",
        segment_diagnostics,
        [
            "phase", "horizon_days", "product_id", "origin", "segment",
            "window_days", "sale_days", "units", "mean_inter_sale_interval_days",
            "days_since_sale",
        ],
    )
    write_csv(
        output_directory / "configuraciones.csv",
        all_configs,
        [
            "horizon_days", "segment", "candidate_id", "model", "family",
            "strategy", "window_days", "kind", "group", "alpha", "beta",
        ],
    )
    metric_fields = [
        "phase", "horizon_days", "segment", "candidate_id", "model", "family",
        "strategy", "window_days", "feature_group", "alpha", "beta",
        "minimum_training_examples", "median_training_examples",
        "n_product_origins", "products", "origins", "actual_units",
        "mae", "rmse", "wape", "origin_mae_std",
    ]
    write_csv(output_directory / "metricas_candidatos.csv", all_metrics, metric_fields)
    product_fields = [
        "phase", "horizon_days", "segment", "candidate_id", "product_id",
        "n_product_origins", "products", "origins", "actual_units",
        "mae", "rmse", "wape", "origin_mae_std",
    ]
    write_csv(
        output_directory / "metricas_por_producto.csv",
        product_metrics,
        product_fields,
    )
    write_csv(
        output_directory / "metricas_por_segmento.csv",
        selected_segment_metrics,
        [
            "phase", "horizon_days", "segment", "candidate_id",
            "n_product_origins", "products", "origins", "actual_units",
            "mae", "rmse", "wape", "origin_mae_std",
        ],
    )
    write_csv(
        output_directory / "comparacion_v3_v4_v5.csv",
        hybrid_comparison,
        [
            "phase", "horizon_days", "candidate_id", "n_product_origins",
            "products", "origins", "actual_units", "mae", "rmse", "wape",
            "origin_mae_std",
        ],
    )
    write_csv(
        output_directory / "comparacion_por_segmento.csv",
        segment_comparison,
        [
            "horizon_days", "segment", "v3_mae", "v3_rmse", "v3_wape",
            "v4_mae", "v4_rmse", "v4_wape", "v5_mae", "v5_rmse", "v5_wape",
        ],
    )
    write_csv(
        output_directory / "productos_ganadores.csv",
        product_win_counts,
        [
            "horizon_days", "segment", "better_vs_v3", "better_vs_v4", "products",
        ],
    )
    write_comparison_charts(output_directory, segment_comparison)
    write_csv(
        output_directory / "predicciones_modelos_seleccionados.csv",
        selected_predictions,
        [
            "phase", "horizon_days", "segment", "candidate_id", "model", "family",
            "strategy", "window_days", "feature_group", "product_id", "origin",
            "actual_units", "predicted_units", "frequency_segment",
        ],
    )
    summary["selected_holdout_metrics"] = [
        row for row in selected_holdout_metrics
        if row["candidate_id"]
        == development_rankings[(row["horizon_days"], row["segment"])][0]["candidate_id"]
    ]
    summary["segment_comparison"] = segment_comparison
    summary["product_win_counts"] = product_win_counts
    with (output_directory / "resumen.json").open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
    write_report(
        output_directory / "INFORME_FASE3.md",
        summary,
        development_rankings,
        segment_comparison,
        product_win_counts,
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Segmenta productos dinámicamente y evalúa modelos especializados."
    )
    parser.add_argument("extract_directory", type=Path)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("v4_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    try:
        result = run(
            args.extract_directory,
            args.v3_directory,
            args.v4_directory,
            args.output_directory,
        )
        print(json.dumps({
            "output_directory": str(args.output_directory.resolve()),
            "cohort_counts": result["cohort_counts"],
            "configuration_count": result["configuration_count"],
            "segment_origin_counts": result["segment_origin_counts"],
        }, ensure_ascii=False, indent=2))
    except (v3.ExperimentError, OSError, KeyError, ValueError, StopIteration) as error:
        print(f"Fase 3 detenida: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
