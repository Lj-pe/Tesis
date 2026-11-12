import argparse
import csv
import hashlib
import json
import sys
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

import experimento_fase2 as phase2
import experimento_minimarket as v3


ROLLING_WINDOWS = {
    7: (14, 28, 30, 45, 56, 60, 90),
    14: (14, 28, 30, 45, 56, 60, 90, 120, 150),
    30: (14, 28, 30, 45, 56, 60, 90, 120, 150, 180, 210),
}
WEIGHTED_WINDOWS = {
    7: (30, 56, 90),
    14: (30, 56, 90, 150),
    30: (30, 56, 90, 150, 210),
}
HURDLE_WINDOWS = {
    7: (14, 28, 56, 90),
    14: (28, 56, 90, 150),
    30: (56, 90, 150, 210),
}
POOL_STRENGTHS = (0, 14, 28)
WEEKDAY_WINDOWS = {
    7: (28, 56, 90),
    14: (56, 90, 150),
    30: (56, 90, 180),
}
WEEKDAY_POOL_STRENGTHS = (0, 14)


def candidate_specs(horizon):
    specs = [{"model": "zero_baseline", "kind": "zero", "window_days": 0}]
    for window in ROLLING_WINDOWS[horizon]:
        specs.append({
            "model": "moving_average",
            "kind": "rolling",
            "window_days": window,
        })
    for half_life in WEIGHTED_WINDOWS[horizon]:
        specs.append({
            "model": "weighted_mean",
            "kind": "weighted",
            "window_days": half_life,
        })
    for window in HURDLE_WINDOWS[horizon]:
        for strength in POOL_STRENGTHS:
            specs.append({
                "model": "category_hurdle",
                "kind": "hurdle",
                "window_days": window,
                "pool_days": strength,
            })
    for window in WEEKDAY_WINDOWS[horizon]:
        for strength in WEEKDAY_POOL_STRENGTHS:
            specs.append({
                "model": "weekday_profile",
                "kind": "weekday",
                "window_days": window,
                "pool_days": strength,
            })
    adaptive_windows = {
        7: ((14, 56), (28, 90)),
        14: ((14, 56), (28, 90), (56, 150)),
        30: ((28, 90), (56, 150), (90, 210)),
    }
    for short_window, long_window in adaptive_windows[horizon]:
        specs.append({
            "model": "adaptive_level_blend",
            "kind": "adaptive",
            "window_days": long_window,
            "short_window_days": short_window,
        })
    return specs


def candidate_id(spec):
    return "|".join(
        f"{key}={spec[key]}"
        for key in ("model", "window_days", "pool_days", "short_window_days")
        if key in spec
    )


def full_history_origins(origins, first_date, minimum_history_days):
    return [
        day for day in origins
        if (day - first_date).days + 1 >= minimum_history_days
    ]


def history_values(panel, product_id, origin_index, window):
    start = max(0, origin_index - window + 1)
    return [
        (index, float(value))
        for index, value in enumerate(
            panel[product_id]["values"][start:origin_index + 1],
            start=start,
        )
        if value is not None
    ]


def category_statistics(
    category_id,
    product_id,
    origin_index,
    window,
    panel,
    categories,
    cache,
):
    key = (category_id, product_id, origin_index, window)
    if key not in cache:
        total_days = 0
        positive_days = 0
        total_units = 0.0
        positive_units = 0.0
        for peer_id, peer_category in categories.items():
            if peer_id == product_id or peer_category != category_id:
                continue
            values = history_values(panel, peer_id, origin_index, window)
            total_days += len(values)
            positive = [value for _, value in values if value > 0]
            positive_days += len(positive)
            total_units += sum(value for _, value in values)
            positive_units += sum(positive)
        cache[key] = (
            positive_days / total_days if total_days else 0.0,
            positive_units / positive_days if positive_days else 0.0,
        )
    return cache[key]


def pooled_hurdle_forecast(
    spec,
    product_id,
    origin_index,
    horizon,
    panel,
    categories,
    category_cache,
):
    values = history_values(
        panel, product_id, origin_index, spec["window_days"]
    )
    if not values:
        return 0.0
    positive = [value for _, value in values if value > 0]
    strength = float(spec["pool_days"])
    category_probability, category_size = category_statistics(
        categories[product_id],
        product_id,
        origin_index,
        spec["window_days"],
        panel,
        categories,
        category_cache,
    )
    probability = (
        len(positive) + strength * category_probability
    ) / (len(values) + strength)
    size_denominator = len(positive) + strength
    mean_size = (
        (sum(positive) + strength * category_size) / size_denominator
        if size_denominator
        else 0.0
    )
    return max(0.0, probability * mean_size * horizon)


def weekday_forecast(
    spec,
    product_id,
    origin_index,
    horizon,
    dates,
    panel,
    categories,
    category_cache,
):
    values = history_values(
        panel, product_id, origin_index, spec["window_days"]
    )
    if not values:
        return 0.0
    origin = dates[origin_index]
    start = max(0, origin_index - spec["window_days"] + 1)
    category_id = categories[product_id]
    strength = float(spec["pool_days"])
    predicted = 0.0
    for weekday in range(7):
        matching = [
            value for index, value in values
            if dates[index].weekday() == weekday
        ]
        exposure = sum(
            dates[index].weekday() == weekday
            for index in range(start, origin_index + 1)
        )
        category_probability, category_size = category_statistics(
            category_id,
            product_id,
            origin_index,
            spec["window_days"],
            panel,
            categories,
            category_cache,
        )
        category_rate = category_probability * category_size
        product_rate = sum(matching) / exposure if exposure else 0.0
        pooled_rate = (
            sum(matching) + strength * category_rate
        ) / (exposure + strength) if exposure + strength else product_rate
        target_count = sum(
            (origin + timedelta(days=offset)).weekday() == weekday
            for offset in range(1, horizon + 1)
        )
        predicted += pooled_rate * target_count
    return max(0.0, predicted)


def forecast_one(
    spec,
    product_id,
    origin_index,
    horizon,
    dates,
    panel,
    categories,
    category_cache,
):
    kind = spec["kind"]
    if kind == "zero":
        return 0.0
    if kind == "hurdle":
        return pooled_hurdle_forecast(
            spec, product_id, origin_index, horizon, panel,
            categories, category_cache,
        )
    if kind == "weekday":
        return weekday_forecast(
            spec, product_id, origin_index, horizon, dates, panel,
            categories, category_cache,
        )
    if kind == "adaptive":
        short = history_values(
            panel, product_id, origin_index, spec["short_window_days"]
        )
        long = history_values(panel, product_id, origin_index, spec["window_days"])
        if not short or not long:
            return 0.0
        short_rate = sum(value for _, value in short) / len(short)
        long_rate = sum(value for _, value in long) / len(long)
        divergence = abs(short_rate - long_rate)
        short_weight = divergence / (divergence + long_rate + 1e-9)
        rate = short_weight * short_rate + (1 - short_weight) * long_rate
        return max(0.0, rate * horizon)

    history = history_values(
        panel, product_id, origin_index, spec["window_days"]
    )
    if not history:
        return 0.0
    if kind == "rolling":
        rate = sum(value for _, value in history) / len(history)
    elif kind == "weighted":
        ages = [
            origin_index - index for index, _ in history
        ]
        weights = phase2.decay_weights(ages, spec["window_days"])
        rate = phase2.weighted_mean(
            [value for _, value in history],
            weights,
        )
    else:
        raise v3.ExperimentError(f"Modelo Fase 6 desconocido: {kind}.")
    return max(0.0, rate * horizon)


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def write_csv(path, rows, fields):
    with path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def metrics(rows):
    result = v3.metric_values(rows)
    if not result:
        return None
    actual = sum(float(row["actual_units"]) for row in rows)
    predicted = sum(float(row["predicted_units"]) for row in rows)
    result.update({
        "forecast_units": predicted,
        "bias_units": predicted - actual,
        "bias_pct_actual": (predicted - actual) / actual if actual else None,
        "underforecast_rows": sum(
            float(row["predicted_units"]) < float(row["actual_units"])
            for row in rows
        ),
        "overforecast_rows": sum(
            float(row["predicted_units"]) > float(row["actual_units"])
            for row in rows
        ),
        "zero_actual_rows": sum(
            float(row["actual_units"]) == 0 for row in rows
        ),
    })
    return result


def grouped_metrics(rows, keys):
    grouped = defaultdict(list)
    for row in rows:
        if "horizon_days" in row:
            row["horizon_days"] = int(row["horizon_days"])
        if "product_id" in row:
            row["product_id"] = int(row["product_id"])
        grouped[tuple(row[key] for key in keys)].append(row)
    output = []
    for group_key, group_rows in sorted(grouped.items()):
        output.append({
            **dict(zip(keys, group_key)),
            **metrics(group_rows),
        })
    return output


def rank_candidates(rows):
    ranks = defaultdict(list)
    for metric in ("mae", "rmse", "wape"):
        ordered = sorted(
            (float(row[metric]), row["candidate_id"])
            for row in rows if row[metric] is not None
        )
        for rank, (_, candidate) in enumerate(ordered, start=1):
            ranks[candidate].append(rank)
    ranked = []
    for row in rows:
        if ranks[row["candidate_id"]]:
            ranked.append({
                **row,
                "mean_metric_rank": sum(ranks[row["candidate_id"]])
                / len(ranks[row["candidate_id"]]),
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


def v5_candidate_rows(rows):
    result = []
    for row in rows:
        if row["candidate_id"].split("|")[0] not in (
            "frequent", "intermittent", "low",
        ):
            continue
        result.append({
            **row,
            "horizon_days": int(row["horizon_days"]),
            "product_id": int(row["product_id"]),
            "actual_units": float(row["actual_units"]),
            "predicted_units": float(row["predicted_units"]),
            "candidate_id": f"v5_reference|{row['segment']}",
            "model": "v5_segment_specialist",
            "family": "v5_reference",
            "configuration": row["candidate_id"],
        })
    return result


def build_candidate_predictions(
    specs,
    phase,
    origins,
    horizon,
    allowed_keys,
    dates,
    panel,
    product_ids,
    categories,
    segment_labels,
):
    date_index = {day: index for index, day in enumerate(dates)}
    category_cache = {}
    predictions = []
    for spec in specs:
        candidate = candidate_id(spec)
        for origin in origins:
            origin_index = date_index[origin]
            origin_text = origin.isoformat()
            for product_id in product_ids:
                key = (product_id, origin_text)
                if key not in allowed_keys:
                    continue
                actual = v3.eligible_sample(
                    dates, panel, product_id, origin_index, horizon
                )
                if actual is None:
                    raise v3.ExperimentError(
                        f"Etiqueta no válida dentro de cohorte: {key}, H{horizon}."
                    )
                predicted = forecast_one(
                    spec, product_id, origin_index, horizon, dates, panel,
                    categories, category_cache,
                )
                predictions.append({
                    "phase": phase,
                    "horizon_days": horizon,
                    "segment": segment_labels[key],
                    "candidate_id": candidate,
                    "model": spec["model"],
                    "configuration": candidate,
                    "product_id": product_id,
                    "origin": origin_text,
                    "actual_units": actual,
                    "predicted_units": predicted,
                })
    return predictions


def prediction_metrics(rows, phase):
    return [
        {"phase": phase, **row}
        for row in grouped_metrics(
            rows, ("horizon_days", "segment", "candidate_id", "model", "configuration")
        )
    ]


def read_v5_comparators(v5_directory, phase, horizon, common_keys):
    rows = read_csv(v5_directory / "predicciones_modelos_seleccionados.csv")
    selected = []
    for row in rows:
        if row["phase"] != phase or int(row["horizon_days"]) != horizon:
            continue
        key = (int(row["product_id"]), row["origin"])
        if key not in common_keys:
            continue
        selected.append({
            **row,
            "horizon_days": horizon,
            "product_id": key[0],
            "actual_units": float(row["actual_units"]),
            "predicted_units": float(row["predicted_units"]),
        })
    return selected


def select_development(metrics_rows, horizons=v3.HORIZONS):
    selected = {}
    rankings = []
    for horizon in horizons:
        for segment in ("frequent", "intermittent", "low"):
            rows = [
                row for row in metrics_rows
                if row["phase"] == "desarrollo"
                and row["horizon_days"] == horizon
                and row["segment"] == segment
            ]
            ranking = rank_candidates(rows)
            if not ranking:
                raise v3.ExperimentError(
                    f"Sin candidatos de desarrollo para H{horizon}/{segment}."
                )
            selected[(horizon, segment)] = ranking[0]["candidate_id"]
            rankings.extend(
                {"horizon_days": horizon, "segment": segment, **row}
                for row in ranking
            )
    return selected, rankings


def write_report(path, summary):
    lines = [
        "# Fase 6: optimización final de demanda",
        "",
        f"- Extracto: `{summary['source_run_id']}`.",
        "- Las predicciones v3/v4/v5 y la cohorte se reutilizan sin modificar sus artefactos.",
        "- Modelos y configuraciones seleccionados únicamente con desarrollo; holdout reservado.",
        "- WAPE se expresa como razón (1,00 = 100%).",
        "",
        "## Comparación global de holdout",
        "",
        "| H | Sistema | MAE | RMSE | WAPE | Sesgo unidades | Sesgo % |",
        "|---:|---|---:|---:|---:|---:|---:|",
    ]
    for horizon in v3.HORIZONS:
        for name in ("v3", "v4", "v5", "v6_hibrido"):
            row = summary["global_holdout"][f"h{horizon}_{name}"]
            lines.append(
                f"| {horizon} | {name} | {row['mae']:.3f} | {row['rmse']:.3f} | "
                f"{row['wape']:.3f} | {row['bias_units']:+.1f} | "
                f"{row['bias_pct_actual']:+.1%} |"
            )
    lines += [
        "",
        "## Recomendación por horizonte",
        "",
    ]
    for horizon in v3.HORIZONS:
        v4_row = summary["global_holdout"][f"h{horizon}_v4"]
        v5_row = summary["global_holdout"][f"h{horizon}_v5"]
        v6_row = summary["global_holdout"][f"h{horizon}_v6_hibrido"]
        if horizon == 14:
            recommendation = (
                "No hay dominancia: frente a v4, v6 mejora MAE/WAPE, pero "
                "empeora RMSE; frente a v5, mejora RMSE y sesgo, pero no "
                "MAE/WAPE. No seleccionar un único ganador sin ponderación "
                "de negocio."
            )
        elif horizon == 30:
            recommendation = (
                "No hay dominancia: v6 mejora las tres métricas frente a v5, "
                "pero frente a v4 solo mejora RMSE y empeora MAE/WAPE. V4 "
                "sigue siendo preferible si se priorizan MAE/WAPE; v6 reduce "
                "más el sesgo negativo."
            )
        else:
            recommendation = (
                "No hay ganador consistente: v6 reduce el sesgo negativo de "
                "v5, pero queda detrás de v4 en MAE/RMSE/WAPE y detrás de v5 "
                "en MAE/WAPE. La decisión depende del costo de subestimar "
                "frente al error absoluto."
            )
        lines.append(
            f"- **H{horizon}:** {recommendation} "
            f"V6 vs v4: MAE {v6_row['mae'] - v4_row['mae']:+.3f}, "
            f"RMSE {v6_row['rmse'] - v4_row['rmse']:+.3f}, "
            f"WAPE {v6_row['wape'] - v4_row['wape']:+.3f}; "
            f"vs v5: MAE {v6_row['mae'] - v5_row['mae']:+.3f}, "
            f"RMSE {v6_row['rmse'] - v5_row['rmse']:+.3f}, "
            f"WAPE {v6_row['wape'] - v5_row['wape']:+.3f}; "
            f"sesgo v5 → v6 {v5_row['bias_pct_actual']:+.1%} → "
            f"{v6_row['bias_pct_actual']:+.1%}."
        )
    lines += [
        "",
        "## Comparabilidad y soporte de ventanas",
        "",
        "- Las ventanas se configuran por horizonte. La selección de desarrollo excluye orígenes anteriores a la primera fecha con historial suficiente para la ventana máxima candidata de ese horizonte; los comparadores v3/v4/v5 se filtran a exactamente los mismos orígenes y productos.",
        "- El desarrollo comparable contiene "
        f"{summary['cohort_counts']['desarrollo_h7']}, "
        f"{summary['cohort_counts']['desarrollo_h14']} y "
        f"{summary['cohort_counts']['desarrollo_h30']} producto-orígenes "
        "para H7/H14/H30. El holdout conserva 500 producto-orígenes por horizonte.",
        "- El filtro garantiza la extensión calendario nominal de la ventana, no que cada producto tenga datos conocidos en todos esos días; los desconocidos se mantienen fuera del cálculo, no se imputan como cero.",
        "- Se evaluaron "
        f"{summary['candidate_count']} combinaciones en total, con grillas "
        "específicas por horizonte. Las métricas de configuración se comparan dentro de cada cohorte de desarrollo.",
        "",
    ]
    lines += [
        "",
        "## Especialistas seleccionados por segmento",
        "",
        "| H | Segmento | Modelo/configuración elegida en desarrollo | Dev MAE/RMSE/WAPE | "
        "Holdout n | Holdout MAE/RMSE/WAPE | Sesgo % |",
        "|---:|---|---|---|---:|---|---:|",
    ]
    for row in summary["selected_segment_metrics"]:
        dev = row["development"]
        hold = row["holdout"]
        lines.append(
            f"| {row['horizon_days']} | {row['segment']} | `{row['candidate_id']}` | "
            f"{dev['mae']:.3f}/{dev['rmse']:.3f}/{dev['wape']:.3f} | "
            f"{hold['n_product_origins']} | "
            f"{hold['mae']:.3f}/{hold['rmse']:.3f}/{hold['wape']:.3f} | "
            f"{hold['bias_pct_actual']:+.1%} |"
        )
    lines += [
        "",
        "## Lectura y decisión",
        "",
        "- El modelo por horizonte recomendado debe compararse con v4/v5 en el mismo holdout y considerar conjuntamente WAPE, RMSE y sesgo.",
        "- La selección por segmento utiliza el promedio de rangos MAE/RMSE/WAPE en desarrollo; el holdout no participa en la elección.",
        "- Las estrategias adaptativas fueron evaluadas, pero no ganaron ningún segmento/horizonte en desarrollo; no se recomienda conservarlas solo por ser más complejas.",
        "- Sesgo negativo significa subestimación. Las métricas orientan el error de pronóstico, pero no son una evaluación monetaria de inventario.",
        "- No se calculó costo de quiebre/exceso ni una orden recomendada: faltan costos, política de servicio y regla comercial aprobados.",
        "- Los cinco orígenes semanales de holdout producen ventanas objetivo solapadas, sobre todo H14/H30; resultados exploratorios, no independientes.",
        "- Con un solo ciclo anual, no se puede estimar ni validar estacionalidad anual.",
        "",
        "## Artefactos",
        "",
        "- `metricas_candidatos_desarrollo.csv`: configuraciones evaluadas y ordenadas por desarrollo.",
        "- `metricas_por_segmento.csv` y `metricas_por_producto.csv`: detalle de v6 y comparadores.",
        "- `comparacion_global.csv`, `comparacion_segmentos.csv` y `predicciones_seleccionadas.csv`.",
        "- `resumen.json`: cohortes, hashes de entrada, selección y métricas.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def run(extract_directory, v3_directory, v4_directory, v5_directory, output_directory):
    repository_root = Path(__file__).resolve().parent.parent
    try:
        output_directory.resolve().relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise v3.ExperimentError("La salida v6 debe guardarse fuera del repositorio.")
    if output_directory.exists():
        raise v3.ExperimentError(
            f"La salida ya existe; no se sobrescribe: {output_directory}"
        )

    input_paths = [
        extract_directory / "metadata.json",
        v3_directory / "resumen.json",
        v4_directory / "resumen.json",
        v5_directory / "resumen.json",
        v5_directory / "segmentacion_por_origen.csv",
        v5_directory / "predicciones_modelos_seleccionados.csv",
    ]
    input_hashes = {str(path): file_hash(path) for path in input_paths}
    v3_summary = json.loads(input_paths[1].read_text(encoding="utf-8"))
    v4_summary = json.loads(input_paths[2].read_text(encoding="utf-8"))
    v5_summary = json.loads(input_paths[3].read_text(encoding="utf-8"))
    metadata, sources, product_ids = v3.load_inputs(extract_directory)
    if not (
        metadata["run_id"] == v3_summary["source_run_id"]
        == v4_summary["source_run_id"] == v5_summary["source_run_id"]
    ):
        raise v3.ExperimentError("v3/v4/v5 y extracto no comparten source_run_id.")
    dates, panel, *_ = v3.build_panel(sources, product_ids)
    availability = v3.availability_summary(dates, panel)
    if any(
        availability != summary["availability"]
        for summary in (v3_summary, v4_summary, v5_summary)
    ):
        raise v3.ExperimentError("La disponibilidad no coincide con v3/v4/v5.")
    development_origins, holdout_origins = v3.make_origin_sets(dates)
    if (
        [day.isoformat() for day in development_origins] != v5_summary["development_origins"]
        or [day.isoformat() for day in holdout_origins] != v5_summary["holdout_origins"]
    ):
        raise v3.ExperimentError("Los orígenes v6 no coinciden con v5.")
    categories = {
        int(row["producto_id"]): int(row["categoria_id"])
        for row in sources["productos"]
    }

    v5_predictions = read_csv(
        v5_directory / "predicciones_modelos_seleccionados.csv"
    )
    v5_segments = read_csv(v5_directory / "segmentacion_por_origen.csv")
    all_candidate_metrics = []
    all_rankings = []
    all_configs = []
    selected_predictions = []
    selected_segment_metrics = []
    global_holdout = {}
    segment_holdout_rows = []
    product_rows = []
    cohort_counts = {}
    selected_by_horizon = {}
    selection_origins_by_horizon = {}
    candidate_count = 0

    for horizon in v3.HORIZONS:
        specs = candidate_specs(horizon)
        candidate_count += len(specs)
        all_configs.extend(
            {"horizon_days": horizon, "candidate_id": candidate_id(spec), **spec}
            for spec in specs
        )
        maximum_history = max(
            max(spec["window_days"], spec.get("short_window_days", 0))
            for spec in specs
        )
        for phase, all_origins in (
            ("desarrollo", development_origins),
            ("holdout", holdout_origins),
        ):
            origins = (
                full_history_origins(all_origins, dates[0], maximum_history)
                if phase == "desarrollo"
                else all_origins
            )
            if phase == "desarrollo":
                selection_origins_by_horizon[horizon] = [
                    day.isoformat() for day in origins
                ]
            reference = [
                row for row in v5_predictions
                if row["phase"] == phase
                and int(row["horizon_days"]) == horizon
                and row["origin"] in {day.isoformat() for day in origins}
                and row["candidate_id"].split("|")[0]
                in ("v3", "frequent", "intermittent", "low")
            ]
            common_keys = {
                (int(row["product_id"]), row["origin"])
                for row in reference
                if row["candidate_id"].split("|")[0] == "v3"
            }
            if not common_keys:
                raise v3.ExperimentError(
                    f"No se encontraron predicciones comparables para {phase}/H{horizon}."
                )
            selected_v3 = [
                row for row in reference
                if row["candidate_id"].split("|")[0] == "v3"
            ]
            selected_v4 = [
                row for row in v5_predictions
                if row["phase"] == phase
                and int(row["horizon_days"]) == horizon
                and (int(row["product_id"]), row["origin"]) in common_keys
                and row["candidate_id"].split("|")[0]
                not in ("v3", "frequent", "intermittent", "low")
            ]
            selected_v5 = [
                row for row in reference
                if row["candidate_id"].split("|")[0]
                in ("frequent", "intermittent", "low")
            ]
            comparator_groups = {
                "v3": selected_v3,
                "v4": selected_v4,
                "v5": selected_v5,
            }
            if any(
                len(rows) != len(common_keys)
                for rows in comparator_groups.values()
            ):
                raise v3.ExperimentError(
                    f"Cohorte incompleta entre v3/v4/v5 ({phase}, H{horizon})."
                )
            expected_actuals = {
                (int(row["product_id"]), row["origin"]): float(row["actual_units"])
                for row in selected_v3
            }
            for name, rows in comparator_groups.items():
                actuals = {
                    (int(row["product_id"]), row["origin"]): float(row["actual_units"])
                    for row in rows
                }
                if actuals != expected_actuals:
                    raise v3.ExperimentError(
                        f"Etiquetas diferentes en comparador {name} ({phase}, H{horizon})."
                    )
            cohort_counts[f"{phase}_h{horizon}"] = len(common_keys)
            v5_labels = {
                (int(row["product_id"]), row["origin"]): row["segment"]
                for row in v5_segments
                if row["phase"] == phase and int(row["horizon_days"]) == horizon
            }
            segment_labels = {
                key: value for key, value in v5_labels.items()
                if key in common_keys
            }
            if set(segment_labels) != common_keys:
                raise v3.ExperimentError(
                    f"Etiquetas de segmento incompletas ({phase}, H{horizon})."
                )
            phase_predictions = build_candidate_predictions(
                specs,
                phase,
                origins,
                horizon,
                common_keys,
                dates,
                panel,
                product_ids,
                categories,
                segment_labels,
            )
            phase_predictions.extend(v5_candidate_rows(selected_v5))
            phase_metrics = prediction_metrics(phase_predictions, phase)
            all_candidate_metrics.extend(phase_metrics)
            if phase == "desarrollo":
                selected, rankings = select_development(
                    phase_metrics,
                    horizons=(horizon,),
                )
                selected_by_horizon[horizon] = {
                    segment: selected[(horizon, segment)]
                    for segment in ("frequent", "intermittent", "low")
                }
                all_rankings.extend(rankings)
            else:
                for segment in ("frequent", "intermittent", "low"):
                    candidate = selected_by_horizon[horizon][segment]
                    rows = [
                        row for row in phase_predictions
                        if row["segment"] == segment
                        and row["candidate_id"] == candidate
                    ]
                    if not rows:
                        raise v3.ExperimentError(
                            f"Sin pronósticos elegidos para H{horizon}/{segment}."
                        )
                    selected_predictions.extend(rows)
                    hold = metrics(rows)
                    dev = next(
                        row for row in all_candidate_metrics
                        if row["phase"] == "desarrollo"
                        and row["horizon_days"] == horizon
                        and row["segment"] == segment
                        and row["candidate_id"] == candidate
                    )
                    selected_segment_metrics.append({
                        "horizon_days": horizon,
                        "segment": segment,
                        "candidate_id": candidate,
                        "development": dev,
                        "holdout": hold,
                    })
                    segment_holdout_rows.extend(rows)
                # Preserve all v3/v4/v5 comparator rows on the common cohort.
                for name, rows in comparator_groups.items():
                    global_holdout[(str(horizon), name)] = metrics(rows)
                hybrid = [
                    row for row in selected_predictions
                    if row["horizon_days"] == horizon
                ]
                global_holdout[(str(horizon), "v6_hibrido")] = metrics(hybrid)
                for name, rows in comparator_groups.items():
                    for row in rows:
                        row["product_id"] = int(row["product_id"])
                        row["actual_units"] = float(row["actual_units"])
                        row["predicted_units"] = float(row["predicted_units"])
                        row["segment"] = segment_labels[
                            (row["product_id"], row["origin"])
                        ]
                        row["model"] = name
                        row["candidate_id"] = f"{name}_selected"
                    selected_predictions.extend(rows)

    product_rows = grouped_metrics(
        selected_predictions,
        ("phase", "horizon_days", "segment", "candidate_id", "product_id"),
    )
    segment_rows = grouped_metrics(
        selected_predictions,
        ("phase", "horizon_days", "segment", "candidate_id"),
    )
    comparison_rows = [
        {
            "horizon_days": horizon,
            "model": name,
            **global_holdout[(str(horizon), name)],
        }
        for horizon in v3.HORIZONS
        for name in ("v3", "v4", "v5", "v6_hibrido")
    ]
    comparison_by_segment = []
    for horizon in v3.HORIZONS:
        for segment in ("frequent", "intermittent", "low"):
            for name in ("v3", "v4", "v5", "v6"):
                rows = [
                    row for row in selected_predictions
                    if row["phase"] == "holdout"
                    and row["horizon_days"] == horizon
                    and row["segment"] == segment
                    and (
                        row["candidate_id"] == f"{name}_selected"
                        if name != "v6"
                        else row["candidate_id"]
                        == selected_by_horizon[horizon][segment]
                    )
                ]
                comparison_by_segment.append({
                    "horizon_days": horizon,
                    "segment": segment,
                    "model": name,
                    **metrics(rows),
                })

    output_directory.mkdir(parents=True, exist_ok=False)
    metric_fields = [
        "phase", "horizon_days", "segment", "candidate_id", "model",
        "configuration", "n_product_origins", "products", "origins",
        "actual_units", "forecast_units", "bias_units", "bias_pct_actual",
        "underforecast_rows", "overforecast_rows", "zero_actual_rows",
        "mae", "rmse", "wape", "origin_mae_std",
    ]
    write_csv(
        output_directory / "metricas_candidatos_desarrollo.csv",
        [row for row in all_candidate_metrics if row["phase"] == "desarrollo"],
        metric_fields,
    )
    write_csv(
        output_directory / "configuraciones.csv",
        [
            config for config in all_configs
        ],
        [
            "horizon_days", "candidate_id", "model", "kind", "window_days",
            "pool_days", "short_window_days",
        ],
    )
    write_csv(
        output_directory / "ranking_desarrollo.csv",
        all_rankings,
        [
            *metric_fields, "mean_metric_rank",
        ],
    )
    write_csv(
        output_directory / "metricas_por_segmento.csv",
        segment_rows,
        [*metric_fields],
    )
    write_csv(
        output_directory / "metricas_por_producto.csv",
        product_rows,
        [*metric_fields],
    )
    write_csv(
        output_directory / "comparacion_global.csv",
        comparison_rows,
        ["horizon_days", "model", *metric_fields[6:]],
    )
    write_csv(
        output_directory / "comparacion_segmentos.csv",
        comparison_by_segment,
        ["horizon_days", "segment", "model", *metric_fields[6:]],
    )
    write_csv(
        output_directory / "predicciones_seleccionadas.csv",
        selected_predictions,
        [
            "phase", "horizon_days", "segment", "candidate_id", "model",
            "configuration", "product_id", "origin", "actual_units",
            "predicted_units",
        ],
    )
    summary = {
        "experiment": "minimarket-demand-phase6-v6",
        "source_run_id": metadata["run_id"],
        "availability": availability,
        "development_origins": [day.isoformat() for day in development_origins],
        "selection_development_origins": {
            str(horizon): origins
            for horizon, origins in selection_origins_by_horizon.items()
        },
        "holdout_origins": [day.isoformat() for day in holdout_origins],
        "cohort_counts": cohort_counts,
        "candidate_count": candidate_count,
        "selected_by_horizon_segment": {
            f"h{horizon}_{segment}": candidate
            for horizon, segments in selected_by_horizon.items()
            for segment, candidate in segments.items()
        },
        "selected_segment_metrics": selected_segment_metrics,
        "global_holdout": {
            f"h{horizon}_{model}": value
            for (horizon, model), value in global_holdout.items()
        },
        "input_sha256": input_hashes,
        "v3_source_sha256": v3_summary.get("source_files_sha256", {}),
        "v4_configuration_count": v4_summary.get("configuration_rows"),
        "v5_configuration_count": v5_summary.get("configuration_count"),
        "selection_rule": "mean development rank of MAE, RMSE and WAPE, by horizon and v5 segment",
        "holdout_used_for_selection": False,
    }
    with (output_directory / "resumen.json").open(
        "x", encoding="utf-8", newline="\n"
    ) as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
    write_report(
        output_directory / "INFORME_FASE6.md",
        summary,
    )
    if any(file_hash(Path(path)) != digest for path, digest in input_hashes.items()):
        raise v3.ExperimentError("Un artefacto de entrada cambió durante Fase 6.")
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Compara ventanas, modelos de dos etapas y pooling para Fase 6."
    )
    parser.add_argument("extract_directory", type=Path)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("v4_directory", type=Path)
    parser.add_argument("v5_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    arguments = parser.parse_args()
    try:
        summary = run(
            arguments.extract_directory,
            arguments.v3_directory,
            arguments.v4_directory,
            arguments.v5_directory,
            arguments.output_directory,
        )
        print(json.dumps({
            "output_directory": str(arguments.output_directory.resolve()),
            "cohort_counts": summary["cohort_counts"],
            "candidate_count": summary["candidate_count"],
            "selected_by_horizon_segment":
                summary["selected_by_horizon_segment"],
        }, ensure_ascii=False, indent=2))
    except (v3.ExperimentError, OSError, KeyError, ValueError) as error:
        print(f"Fase 6 detenida: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
