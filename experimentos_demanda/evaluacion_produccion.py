import argparse
import calendar
import csv
import json
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy
import sklearn
from sklearn.metrics import mean_absolute_error, mean_squared_error

from evaluacion_temporal import _actual_units, validate_experiment_inputs
from modelos_referencia import (
    CROSTON_ALPHA,
    CROSTON_MINIMUM_POSITIVE_WEEKS,
    forecast_croston_sba_with_moving_average_fallback,
    forecast_for_horizon,
    forecast_moving_average_4,
)
from planificar_evaluacion import HORIZONS_DAYS
from validar_series_python import expected_weeks, sha256


HISTORY_MONTHS_BY_HORIZON = {7: 2, 14: 3, 30: 6}
PREDICTION_COLUMNS = [
    "horizon_days",
    "product_id",
    "origin",
    "target_start",
    "target_end_exclusive",
    "lookback_start",
    "history_start",
    "history_end",
    "training_weeks",
    "positive_training_weeks",
    "selected_method",
    "actual_units",
    "production_forecast",
    "moving_average_4_forecast",
    "candidate_method",
    "candidate_forecast",
    "production_absolute_error",
    "moving_average_4_absolute_error",
    "candidate_absolute_error",
]


def production_history_window(horizon_days, origin_date, training_weeks):
    month_count = HISTORY_MONTHS_BY_HORIZON.get(horizon_days)
    if month_count is None:
        raise ValueError("Horizonte permitido: 7, 14 o 30 días.")
    if training_weeks < 1:
        return None, None

    origin = date.fromisoformat(origin_date)
    last_week_start = origin - timedelta(days=6)
    month_index = origin.year * 12 + origin.month - 1 - month_count
    first_month_year, first_month_index = divmod(month_index, 12)
    first_month = first_month_index + 1
    last_day = calendar.monthrange(first_month_year, first_month)[1]
    first_date = date(first_month_year, first_month, min(origin.day, last_day))
    return first_date, last_week_start


def select_production_history(panel_values, week_starts, horizon_days, origin_date, training_weeks):
    first_date, last_week_start = production_history_window(
        horizon_days,
        origin_date,
        training_weeks,
    )
    if first_date is None:
        return []

    return [
        units
        for week_start, units in zip(week_starts[:training_weeks], panel_values[:training_weeks])
        if first_date <= week_start <= last_week_start
    ]


def _actual_for_origin(data, product_id, origin_info, horizon_days):
    target_start = date.fromisoformat(origin_info["target_start_inclusive"])
    target_end = date.fromisoformat(origin_info["target_end_exclusive"])
    return _actual_units(
        data,
        product_id,
        origin_info["origin_date"],
        horizon_days,
        target_start,
        target_end,
    )


def evaluate_production_policy(data):
    week_starts = [
        date.fromisoformat(week["inicio_semana"])
        for week in expected_weeks()
    ]
    records = []

    for horizon_days in HORIZONS_DAYS:
        origins = data["plan"]["temporal_design"]["origins_by_horizon"][str(horizon_days)]
        for origin_info in origins:
            training_weeks = origin_info["training_weeks"]
            origin_date = origin_info["origin_date"]
            target_start = origin_info["target_start_inclusive"]
            target_end = origin_info["target_end_exclusive"]
            first_date, last_week_start = production_history_window(
                horizon_days,
                origin_date,
                training_weeks,
            )
            complete_training_week_starts = week_starts[:training_weeks]
            selected_week_starts = [
                week_start
                for week_start in complete_training_week_starts
                if first_date <= week_start <= last_week_start
            ] if first_date is not None else []

            for product_id in data["product_ids"]:
                history = select_production_history(
                    data["panel"][product_id],
                    week_starts,
                    horizon_days,
                    origin_date,
                    training_weeks,
                )
                policy = forecast_croston_sba_with_moving_average_fallback(
                    history,
                    horizon_days,
                )
                baseline_weeks = forecast_moving_average_4(
                    history,
                    math.ceil(horizon_days / 7),
                )
                baseline_forecast = forecast_for_horizon(
                    baseline_weeks,
                    horizon_days,
                )
                candidate_method = (
                    "promedio_movil_4"
                    if horizon_days in (7, 14)
                    else policy["selected_method"]
                )
                candidate_forecast = (
                    baseline_forecast
                    if horizon_days in (7, 14)
                    else policy["forecast"]
                )
                actual = _actual_for_origin(
                    data,
                    product_id,
                    origin_info,
                    horizon_days,
                )

                records.append({
                    "horizon_days": horizon_days,
                    "product_id": product_id,
                    "origin": origin_date,
                    "target_start": target_start,
                    "target_end_exclusive": target_end,
                    "lookback_start": first_date.isoformat() if first_date else "",
                    "history_start": (
                        selected_week_starts[0].isoformat()
                        if selected_week_starts
                        else ""
                    ),
                    "history_end": (
                        last_week_start.isoformat()
                        if last_week_start is not None
                        else ""
                    ),
                    "training_weeks": len(history),
                    "positive_training_weeks": policy["positive_training_weeks"],
                    "selected_method": policy["selected_method"],
                    "actual_units": actual,
                    "production_forecast": policy["forecast"],
                    "moving_average_4_forecast": baseline_forecast,
                    "candidate_method": candidate_method,
                    "candidate_forecast": candidate_forecast,
                    "production_absolute_error": abs(actual - policy["forecast"]),
                    "moving_average_4_absolute_error": abs(actual - baseline_forecast),
                    "candidate_absolute_error": abs(actual - candidate_forecast),
                })

    return records


def summarize_metrics(records):
    summary = {}
    for horizon in HORIZONS_DAYS:
        selected = [row for row in records if row["horizon_days"] == horizon]
        actual = [row["actual_units"] for row in selected]
        summary[str(horizon)] = {
            "product_count": len({row["product_id"] for row in selected}),
            "origin_count": len({row["origin"] for row in selected}),
            "product_period_count": len(selected),
            "methods": {},
        }
        for method, prediction_field, error_field in (
            ("produccion_croston_sba_fallback", "production_forecast", "production_absolute_error"),
            ("promedio_movil_4", "moving_average_4_forecast", "moving_average_4_absolute_error"),
            ("politica_candidata_por_horizonte", "candidate_forecast", "candidate_absolute_error"),
        ):
            predictions = [row[prediction_field] for row in selected]
            errors = [row[error_field] for row in selected]
            total_actual = sum(actual)
            total_error = sum(errors)
            total_bias = sum(predictions) - total_actual
            method_field = (
                "candidate_method"
                if method == "politica_candidata_por_horizonte"
                else "selected_method"
            )
            summary[str(horizon)]["methods"][method] = {
                "mae": float(mean_absolute_error(actual, predictions)),
                "rmse": float(math.sqrt(mean_squared_error(actual, predictions))),
                "wape": total_error / total_actual if total_actual else None,
                "bias_units": total_bias,
                "bias_pct": total_bias / total_actual if total_actual else None,
                "product_count": summary[str(horizon)]["product_count"],
                "origin_count": summary[str(horizon)]["origin_count"],
                "product_period_count": len(selected),
                "selected_croston_sba_count": sum(
                    row[method_field] == "croston_sba" for row in selected
                ) if method in (
                    "produccion_croston_sba_fallback",
                    "politica_candidata_por_horizonte",
                ) else None,
                "selected_fallback_count": sum(
                    row[method_field] == "promedio_movil_4" for row in selected
                ) if method in (
                    "produccion_croston_sba_fallback",
                    "politica_candidata_por_horizonte",
                ) else None,
            }
    return summary


def _plot_actual_vs_predicted(records, output_path):
    figure, axes = plt.subplots(1, 3, figsize=(16, 5), sharey=False)
    colors = {
        "actual": "#15999c",
        "production": "#39745a",
        "baseline": "#d28a35",
    }
    for axis, horizon in zip(axes, HORIZONS_DAYS):
        selected = [row for row in records if row["horizon_days"] == horizon]
        origins = sorted({row["origin"] for row in selected})
        actual_by_origin = []
        production_by_origin = []
        baseline_by_origin = []
        for origin in origins:
            group = [row for row in selected if row["origin"] == origin]
            actual_by_origin.append(numpy.mean([row["actual_units"] for row in group]))
            production_by_origin.append(
                numpy.mean([row["production_forecast"] for row in group])
            )
            baseline_by_origin.append(
                numpy.mean([row["moving_average_4_forecast"] for row in group])
            )

        axis.plot(origins, actual_by_origin, marker="o", color=colors["actual"], label="Ventas reales")
        axis.plot(origins, production_by_origin, marker="o", color=colors["production"], label="Pronóstico producción")
        axis.plot(origins, baseline_by_origin, marker="o", color=colors["baseline"], label="Promedio móvil-4")
        axis.set_title(f"Horizonte de {horizon} días")
        axis.set_xlabel("Origen temporal")
        axis.set_ylabel("Unidades medias por producto")
        axis.tick_params(axis="x", labelrotation=45)
        axis.grid(True, alpha=0.25)
        axis.legend(fontsize=8)

    figure.suptitle("Ventas reales y predicciones medias por origen")
    figure.tight_layout()
    figure.savefig(output_path, dpi=160, bbox_inches="tight")
    plt.close(figure)


def _plot_error_comparison(metrics, output_path):
    figure, axes = plt.subplots(1, 3, figsize=(14, 5))
    methods = (
        ("produccion_croston_sba_fallback", "Producción"),
        ("promedio_movil_4", "Promedio móvil-4"),
    )
    for axis, horizon in zip(axes, HORIZONS_DAYS):
        data = metrics[str(horizon)]["methods"]
        labels = [label for _, label in methods]
        mae = [data[key]["mae"] for key, _ in methods]
        rmse = [data[key]["rmse"] for key, _ in methods]
        positions = numpy.arange(len(labels))
        width = 0.36
        axis.bar(positions - width / 2, mae, width, label="MAE", color="#15999c")
        axis.bar(positions + width / 2, rmse, width, label="RMSE", color="#39745a")
        axis.set_xticks(positions, labels, rotation=15)
        axis.set_title(f"{horizon} días")
        axis.set_ylabel("Error absoluto (unidades)")
        axis.grid(axis="y", alpha=0.25)
        axis.legend()

    figure.suptitle("Comparación de errores por horizonte")
    figure.tight_layout()
    figure.savefig(output_path, dpi=160, bbox_inches="tight")
    plt.close(figure)


def write_evaluation_output(output_directory, data, records, metrics):
    output_directory.mkdir(parents=False, exist_ok=False)
    predictions_path = output_directory / "predicciones_retrospectivas.csv"
    with predictions_path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=PREDICTION_COLUMNS)
        writer.writeheader()
        writer.writerows(records)

    root = data["run_directory"]
    plan_path = data["plan_path"]
    validation_path = root / "validacion_series_semanales.json"
    metadata_path = root / "metadata.json"
    input_hashes = {
        filename: sha256(root / filename)
        for filename in (
            "ventas.csv",
            "detalles.csv",
            "productos.csv",
            "series_semanales.csv",
            "validacion_series_semanales.json",
            "metadata.json",
        )
    }
    input_hashes["plan_evaluacion_temporal.json"] = sha256(plan_path)
    configuration = {
        "source_run_id": data["source_run_id"],
        "evaluation": "ventana retrospectiva compatible con lookback actual de producción",
        "history_months_by_horizon": HISTORY_MONTHS_BY_HORIZON,
        "selection_rule": (
            "En cada origen se entrena solo con semanas completas anteriores al objetivo "
            "cuyo inicio de semana sea igual o posterior al primer día del mes de lookback "
            "y no posterior a la última semana completa."
        ),
        "production_policy": (
            "Croston-SBA alpha=0.1 si hay al menos 8 semanas positivas; en caso contrario "
            "promedio móvil de hasta cuatro semanas."
        ),
        "candidate_policy": (
            "Promedio móvil-4 para 7 y 14 días; política de producción actual "
            "(Croston-SBA desde 8 semanas positivas, con fallback móvil-4) para 30 días."
        ),
        "baseline": "Promedio móvil de hasta cuatro semanas, sobre el mismo historial.",
        "horizon_conversion": (
            "Total semanalizado como semanas completas más la fracción de la siguiente "
            "semana (días restantes/7), igual a producción."
        ),
        "horizons_days": list(HORIZONS_DAYS),
        "actuals": (
            "7/14 días desde serie semanal validada; 30 días desde transacciones pagadas "
            "por fecha, según el evaluador existente."
        ),
        "coverage_note": data["coverage_note"],
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": sys.version.split()[0],
            "numpy": numpy.__version__,
            "scikit_learn": sklearn.__version__,
            "matplotlib": matplotlib.__version__,
        },
        "input_hashes_sha256": input_hashes,
        "validation_source": str(validation_path),
        "metadata_source": str(metadata_path),
    }
    configuration_path = output_directory / "configuracion_evaluacion.json"
    with configuration_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(configuration, stream, ensure_ascii=False, indent=2)
        stream.write("\n")

    metrics_path = output_directory / "metricas.json"
    with metrics_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(metrics, stream, ensure_ascii=False, indent=2)
        stream.write("\n")

    actual_chart = output_directory / "ventas_reales_vs_predichas.png"
    error_chart = output_directory / "comparacion_errores_por_horizonte.png"
    _plot_actual_vs_predicted(records, actual_chart)
    _plot_error_comparison(metrics, error_chart)

    artifact_hashes = {
        path.name: sha256(path)
        for path in (predictions_path, configuration_path, metrics_path, actual_chart, error_chart)
    }
    manifest_path = output_directory / "manifest.json"
    with manifest_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump({
            "input_hashes_sha256": input_hashes,
            "output_hashes_sha256": artifact_hashes,
            "source_run_id": data["source_run_id"],
        }, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    return output_directory


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Evalúa retrospectivamente la política actual con ventanas de producción."
    )
    parser.add_argument("run_directory", type=Path)
    parser.add_argument("plan_path", type=Path)
    parser.add_argument("--output-parent", type=Path)
    args = parser.parse_args(argv)

    data = validate_experiment_inputs(args.run_directory, args.plan_path)
    records = evaluate_production_policy(data)
    metrics = summarize_metrics(records)

    repository_root = Path(__file__).resolve().parent.parent
    local_app_data = Path(
        os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")
    )
    output_parent = (
        args.output_parent.resolve()
        if args.output_parent
        else local_app_data / "Tesis" / "experimentos_demanda"
    )
    try:
        output_parent.relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise ValueError("Los resultados deben guardarse fuera del repositorio.")
    output_parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_directory = output_parent / (
        f"evaluacion_produccion_{timestamp}_{data['source_run_id']}"
    )
    write_evaluation_output(output_directory, data, records, metrics)
    print(f"Directorio de evaluación: {output_directory}")
    for horizon, result in metrics.items():
        print(
            f"{horizon} días: productos={result['product_count']}, "
            f"períodos={result['origin_count']}, pares={result['product_period_count']}, "
            f"métricas={result['methods']}"
        )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Evaluación detenida: {error}", file=sys.stderr)
        raise SystemExit(1)
