import csv
import hashlib
import json
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sklearn.metrics import mean_absolute_error

from modelo_ridge import fit_ridge, forecast_ridge
from modelos_referencia import (
    CROSTON_ALPHA,
    CROSTON_MINIMUM_POSITIVE_WEEKS,
    CrostonInsufficientHistory,
    forecast_croston_sba,
    forecast_croston_sba_with_moving_average_fallback,
    forecast_for_horizon,
    forecast_last_week,
    forecast_moving_average_4,
    forecast_zero,
)
from planificar_evaluacion import HORIZONS_DAYS, create_plan
from validar_series_python import (
    EXPECTED_PRODUCTS,
    SERIES_COLUMNS,
    SOURCE_COLUMNS,
    ValidationError,
    expected_weeks,
    parse_positive_id,
    read_csv,
    sha256,
    validate as validate_weekly_data,
)


METHODS = (
    "cero",
    "ultima_semana",
    "promedio_movil_4",
    "croston_sba",
    "ridge",
)
PREDICTION_COLUMNS = [
    "metodo",
    "horizonte_dias",
    "producto_id",
    "origen",
    "inicio_objetivo",
    "fin_objetivo_exclusivo",
    "unidades_reales",
    "unidades_pronosticadas",
    "error_absoluto",
    "incluido_comparacion",
    "motivo_exclusion",
]
OPERATIONAL_POLICY_COLUMNS = [
    "product_id",
    "origin",
    "horizon_days",
    "selected_method",
    "positive_training_weeks",
    "predicted_units",
    "actual_units",
    "absolute_error",
]


def sha256_bytes(content):
    return hashlib.sha256(content).hexdigest()


def _load_source_manifest(run_directory):
    metadata_path = run_directory / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    sources = {}
    for filename, columns in SOURCE_COLUMNS.items():
        file_path = run_directory / filename
        expected_hash = metadata.get("files", {}).get(filename, {}).get("sha256")
        if not expected_hash or sha256(file_path) != expected_hash:
            raise ValidationError(f"Hash de fuente inválido o ausente: {filename}.")
        sources[filename] = read_csv(file_path, columns)
    return metadata, sources


def _validate_calendar_plan(run_directory, plan_path):
    plan_bytes = plan_path.read_bytes()
    supplied_plan = json.loads(plan_bytes.decode("utf-8"))
    expected_plan = create_plan(run_directory)
    fields = (
        "format_version",
        "source_run_id",
        "series_file",
        "temporal_design",
        "horizon_30_days",
        "coverage_warning",
        "origin_counts",
    )
    for field in fields:
        if supplied_plan.get(field) != expected_plan.get(field):
            raise ValidationError(
                f"El calendario no coincide con el protocolo vigente en '{field}'."
            )
    if supplied_plan.get("format_version") != 1:
        raise ValidationError("Versión de calendario no reconocida.")
    return supplied_plan, sha256_bytes(plan_bytes)


def _load_daily_units(sales, details):
    sale_dates = {}
    for sale in sales:
        sale_id = parse_positive_id(sale["id_venta"], "ventas.csv")
        if sale["estado"] != "pagada":
            raise ValidationError("La fuente contiene ventas no pagadas.")
        try:
            sale_date = date.fromisoformat(sale["fecha_venta"])
        except ValueError as error:
            raise ValidationError("La fuente contiene una fecha de venta inválida.") from error
        if sale_date.isoformat() != sale["fecha_venta"]:
            raise ValidationError("La fuente contiene fechas no ISO.")
        sale_dates[sale_id] = sale_date

    daily = {}
    for detail in details:
        sale_id = parse_positive_id(detail["venta_id"], "detalles.csv")
        product_id = parse_positive_id(detail["producto_id"], "detalles.csv")
        if sale_id not in sale_dates:
            raise ValidationError("Detalle sin venta pagada fuente.")
        try:
            quantity = int(detail["cantidad"])
        except ValueError as error:
            raise ValidationError("Cantidad fuente inválida.") from error
        if quantity <= 0 or str(quantity) != detail["cantidad"]:
            raise ValidationError("Cantidad fuente no positiva o no entera.")
        key = (product_id, sale_dates[sale_id])
        daily[key] = daily.get(key, 0) + quantity
    return daily


def validate_experiment_inputs(run_directory, plan_path):
    run_directory = Path(run_directory).resolve()
    plan_path = Path(plan_path).resolve()
    validation = validate_weekly_data(run_directory)
    if not validation["passed"]:
        raise ValidationError("La validación de las series semanales no pasó.")
    plan, plan_sha256 = _validate_calendar_plan(run_directory, plan_path)
    metadata, sources = _load_source_manifest(run_directory)
    daily_units = _load_daily_units(
        sources["ventas.csv"],
        sources["detalles.csv"],
    )

    rows = read_csv(run_directory / "series_semanales.csv", SERIES_COLUMNS)
    week_positions = {
        week["semana_iso"]: index
        for index, week in enumerate(expected_weeks())
    }
    panel = {}
    for row in rows:
        product_id = parse_positive_id(row["producto_id"], "series_semanales.csv")
        values = panel.setdefault(product_id, [None] * len(week_positions))
        values[week_positions[row["semana_iso"]]] = int(row["unidades"])

    product_ids = sorted(panel)
    for product_id, values in panel.items():
        if len(values) != len(week_positions) or any(value is None for value in values):
            raise ValidationError(f"Producto {product_id}: serie semanal incompleta.")

    daily_units = _load_daily_units(
        sources["ventas.csv"],
        sources["detalles.csv"],
    )
    weekly_from_daily = {}
    week_start = date(2026, 4, 6)
    for (product_id, sale_date), units in daily_units.items():
        offset = (sale_date - week_start).days
        if 0 <= offset < 24 * 7:
            week_index = offset // 7
            weekly_from_daily[(product_id, week_index)] = (
                weekly_from_daily.get((product_id, week_index), 0) + units
            )
    for product_id, values in panel.items():
        for week_index, weekly_units in enumerate(values):
            if weekly_units != weekly_from_daily.get((product_id, week_index), 0):
                raise ValidationError(
                    f"Serie y ventas fuente difieren para producto {product_id}, "
                    f"semana {week_index + 15}."
                )
    if len(product_ids) != EXPECTED_PRODUCTS:
        raise ValidationError(
            f"Se esperaban {EXPECTED_PRODUCTS} productos; observados={len(product_ids)}."
        )

    return {
        "run_directory": run_directory,
        "plan_path": plan_path,
        "plan": plan,
        "plan_sha256": plan_sha256,
        "source_run_id": metadata["run_id"],
        "series_sha256": validation["series_sha256"],
        "source_hashes": {
            filename: metadata["files"][filename]["sha256"]
            for filename in SOURCE_COLUMNS
        },
        "panel": panel,
        "product_ids": product_ids,
        "daily_units": daily_units,
        "coverage_note": (
            "Los ceros son ausencia de ventas registradas; la integridad de cobertura diaria "
            "no está demostrada. Las etiquetas describen ventas registradas, no demanda "
            "censurada ni demanda latente."
        ),
    }


def _actual_units(data, product_id, origin, horizon_days, target_start, target_end):
    if horizon_days in (7, 14):
        panel = data["panel"][product_id]
        training_weeks = next(
            item["training_weeks"]
            for item in data["plan"]["temporal_design"]["origins_by_horizon"][str(horizon_days)]
            if item["origin_date"] == origin
        )
        return int(sum(panel[training_weeks:training_weeks + horizon_days // 7]))

    daily = data["daily_units"]
    return int(
        sum(
            units
            for (daily_product, sale_date), units in daily.items()
            if daily_product == product_id and target_start <= sale_date < target_end
        )
    )


def _forecast_functions(history, model, target_week_index, steps):
    predictions = {
        "cero": forecast_zero(history, steps),
        "ultima_semana": forecast_last_week(history, steps),
        "promedio_movil_4": forecast_moving_average_4(history, steps),
        "ridge": forecast_ridge(model, history, target_week_index, steps),
    }
    try:
        predictions["croston_sba"] = forecast_croston_sba(history, steps)
        exclusions = {}
    except CrostonInsufficientHistory as error:
        predictions["croston_sba"] = None
        exclusions = {"croston_sba": str(error)}
    return predictions, exclusions


def evaluate_validated_inputs(data):
    plan = data["plan"]
    rows = []
    operational_policy_rows = []
    for horizon_days in HORIZONS_DAYS:
        origins = plan["temporal_design"]["origins_by_horizon"][str(horizon_days)]
        for origin_info in origins:
            origin = origin_info["origin_date"]
            target_start = date.fromisoformat(origin_info["target_start_inclusive"])
            target_end = date.fromisoformat(origin_info["target_end_exclusive"])
            training_weeks = origin_info["training_weeks"]
            weekly_steps = math.ceil(horizon_days / 7)

            ridge_model = fit_ridge(data["panel"], training_weeks)
            pair_records = []
            for product_id in data["product_ids"]:
                history = data["panel"][product_id][:training_weeks]
                weekly_predictions, exclusions = _forecast_functions(
                    history,
                    ridge_model,
                    training_weeks,
                    weekly_steps,
                )
                actual = _actual_units(
                    data,
                    product_id,
                    origin,
                    horizon_days,
                    target_start,
                    target_end,
                )
                operational_forecast = (
                    forecast_croston_sba_with_moving_average_fallback(
                        history,
                        horizon_days,
                    )
                )
                operational_policy_rows.append(
                    {
                        "product_id": product_id,
                        "origin": origin,
                        "horizon_days": horizon_days,
                        "selected_method": operational_forecast["selected_method"],
                        "positive_training_weeks": (
                            operational_forecast["positive_training_weeks"]
                        ),
                        "predicted_units": operational_forecast["forecast"],
                        "actual_units": actual,
                        "absolute_error": abs(
                            actual - operational_forecast["forecast"]
                        ),
                    }
                )
                prediction_by_method = {}
                for method in METHODS:
                    weekly_forecast = weekly_predictions[method]
                    if weekly_forecast is None:
                        prediction_by_method[method] = None
                    else:
                        prediction_by_method[method] = forecast_for_horizon(
                            weekly_forecast,
                            horizon_days,
                        )

                comparable = all(
                    prediction_by_method[method] is not None
                    for method in METHODS
                )
                for method in METHODS:
                    predicted = prediction_by_method[method]
                    excluded_reason = exclusions.get(method, "")
                    error = abs(actual - predicted) if predicted is not None else None
                    pair_records.append(
                        {
                            "metodo": method,
                            "horizonte_dias": horizon_days,
                            "producto_id": product_id,
                            "origen": origin,
                            "inicio_objetivo": target_start.isoformat(),
                            "fin_objetivo_exclusivo": target_end.isoformat(),
                            "unidades_reales": actual,
                            "unidades_pronosticadas": predicted,
                            "error_absoluto": error,
                            "incluido_comparacion": comparable,
                            "motivo_exclusion": (
                                excluded_reason
                                if excluded_reason
                                else "" if comparable else "Método no disponible para el par."
                            ),
                        }
                    )
            rows.extend(pair_records)

    comparison = _compare_on_common_pairs(rows)
    operational_policy_comparison = _compare_operational_policy(
        operational_policy_rows,
        rows,
    )
    return {
        "predictions": rows,
        "comparison": comparison,
        "operational_policy_predictions": operational_policy_rows,
        "operational_policy_comparison": operational_policy_comparison,
        "model_configuration": {
            "croston_sba": {
                "alpha": CROSTON_ALPHA,
                "minimum_positive_training_weeks": CROSTON_MINIMUM_POSITIVE_WEEKS,
            },
            "operational_policy": (
                "Croston-SBA cuando el entrenamiento tiene al menos "
                f"{CROSTON_MINIMUM_POSITIVE_WEEKS} semanas positivas; en otro caso, "
                "promedio móvil de las últimas cuatro semanas."
            ),
            "ridge": {
                "alpha": 1.0,
                "features": [
                    "lag_1",
                    "lag_2",
                    "lag_4",
                    "mean_previous_4",
                    "calendar_week_index",
                ],
                "scaler": "StandardScaler ajustado dentro del origen",
                "recursive_nonnegative_clip": True,
            },
            "references": [
                "cero",
                "ultima_semana",
                "promedio_movil_4",
            ],
        },
        "coverage_note": data["coverage_note"],
        "30_day_note": plan["horizon_30_days"]["weekly_training_target"],
    }


def _compare_operational_policy(policy_predictions, predictions):
    baseline_rows = [
        row for row in predictions if row["metodo"] == "promedio_movil_4"
    ]
    baseline_by_pair = {}
    for row in baseline_rows:
        key = (row["horizonte_dias"], row["producto_id"], row["origen"])
        if key in baseline_by_pair:
            raise ValidationError(
                "El promedio móvil contiene claves producto-origen-horizonte "
                f"duplicadas: {key}."
            )
        baseline_by_pair[key] = row
    policy_by_pair = {
        (row["horizon_days"], row["product_id"], row["origin"]): row
        for row in policy_predictions
    }
    if len(policy_by_pair) != len(policy_predictions):
        raise ValidationError("La política contiene pares producto-origen duplicados.")
    if policy_by_pair.keys() != baseline_by_pair.keys():
        raise ValidationError(
            "La política y el promedio móvil no cubren los mismos pares producto-origen."
        )
    for key, policy_row in policy_by_pair.items():
        if policy_row["actual_units"] != baseline_by_pair[key]["unidades_reales"]:
            raise ValidationError(
                "La política y el promedio móvil tienen valores reales distintos "
                f"para el par {key}."
            )

    comparison = {}
    for horizon in HORIZONS_DAYS:
        selected_policy = [
            row for key, row in policy_by_pair.items() if key[0] == horizon
        ]
        selected_baseline = [
            row for key, row in baseline_by_pair.items() if key[0] == horizon
        ]
        if len(selected_policy) != len(selected_baseline):
            raise ValidationError(
                f"Cobertura incompleta de la política para horizonte {horizon}."
            )
        absolute_errors_by_product = {}
        for row in selected_policy:
            absolute_errors_by_product.setdefault(row["product_id"], []).append(
                row["absolute_error"]
            )
        product_maes = [
            sum(errors) / len(errors)
            for errors in absolute_errors_by_product.values()
        ]
        baseline_product_errors = {}
        for row in selected_baseline:
            baseline_product_errors.setdefault(row["producto_id"], []).append(
                row["error_absoluto"]
            )
        baseline_product_maes = [
            sum(errors) / len(errors)
            for errors in baseline_product_errors.values()
        ]
        comparison[str(horizon)] = {
            "possible_product_origin_pair_count": len(selected_policy),
            "product_count": len(absolute_errors_by_product),
            "selected_method_pair_count": {
                method: sum(
                    row["selected_method"] == method for row in selected_policy
                )
                for method in ("croston_sba", "promedio_movil_4")
            },
            "policy_mae_por_par_producto_origen": float(mean_absolute_error(
                [row["actual_units"] for row in selected_policy],
                [row["predicted_units"] for row in selected_policy],
            )),
            "policy_mae_macro_productos": float(sum(product_maes) / len(product_maes)),
            "moving_average_4_mae_por_par_producto_origen": float(mean_absolute_error(
                [row["unidades_reales"] for row in selected_baseline],
                [row["unidades_pronosticadas"] for row in selected_baseline],
            )),
            "moving_average_4_mae_macro_productos": float(
                sum(baseline_product_maes) / len(baseline_product_maes)
            ),
        }
    return comparison


def _compare_on_common_pairs(predictions):
    by_horizon = {}
    for horizon in HORIZONS_DAYS:
        horizon_rows = [
            row for row in predictions if row["horizonte_dias"] == horizon
        ]
        records_by_pair = {}
        for row in horizon_rows:
            key = (row["producto_id"], row["origen"])
            records_by_pair.setdefault(key, {})[row["metodo"]] = row
        comparable_keys = {
            key
            for key, records in records_by_pair.items()
            if all(
                method in records
                and records[method]["incluido_comparacion"]
                and records[method]["unidades_pronosticadas"] is not None
                for method in METHODS
            )
        }
        all_products = {
            row["producto_id"]
            for row in horizon_rows
        }
        included_products = {
            product_id for product_id, _ in comparable_keys
        }
        croston_excluded_keys = {
            (row["producto_id"], row["origen"])
            for row in horizon_rows
            if row["metodo"] == "croston_sba"
            and row["unidades_pronosticadas"] is None
        }
        method_mae = {}
        for method in METHODS:
            selected = [
                row for row in horizon_rows
                if row["metodo"] == method
                and (row["producto_id"], row["origen"]) in comparable_keys
            ]
            if selected:
                absolute_errors_by_product = {}
                for row in selected:
                    absolute_errors_by_product.setdefault(
                        row["producto_id"], []
                    ).append(row["error_absoluto"])
                product_maes = [
                    sum(errors) / len(errors)
                    for errors in absolute_errors_by_product.values()
                ]
                method_mae[method] = {
                    "mae_por_par_producto_origen": float(mean_absolute_error(
                        [row["unidades_reales"] for row in selected],
                        [row["unidades_pronosticadas"] for row in selected],
                    )),
                    "mae_macro_productos": float(sum(product_maes) / len(product_maes)),
                    "pair_count": len(selected),
                    "product_count": len(absolute_errors_by_product),
                }
            else:
                method_mae[method] = {
                    "mae_por_par_producto_origen": None,
                    "mae_macro_productos": None,
                    "pair_count": 0,
                    "product_count": 0,
                }
        by_horizon[str(horizon)] = {
            "possible_product_origin_pair_count": len(records_by_pair),
            "common_pair_count": len(comparable_keys),
            "included_product_count": len(included_products),
            "excluded_product_count": len(all_products - included_products),
            "excluded_product_origin_pair_count": len(
                set(records_by_pair) - comparable_keys
            ),
            "croston_insufficient_history_pair_count": len(croston_excluded_keys),
            "croston_insufficient_history_product_count": len(
                {product_id for product_id, _ in croston_excluded_keys}
            ),
            "method_mae": method_mae,
        }
    return by_horizon


def write_results(result, output_directory, metadata):
    output_directory = Path(output_directory).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    predictions_path = output_directory / "predicciones_individuales.csv"
    operational_policy_path = output_directory / "politica_operativa.csv"
    summary_path = output_directory / "resumen_evaluacion.json"
    if (
        predictions_path.exists()
        or operational_policy_path.exists()
        or summary_path.exists()
    ):
        raise FileExistsError("La carpeta de resultados ya contiene archivos de salida.")

    with predictions_path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=PREDICTION_COLUMNS)
        writer.writeheader()
        writer.writerows(result["predictions"])
    prediction_hash = sha256(predictions_path)
    with operational_policy_path.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=OPERATIONAL_POLICY_COLUMNS)
        writer.writeheader()
        writer.writerows(result["operational_policy_predictions"])
    operational_policy_hash = sha256(operational_policy_path)
    summary = {
        "format_version": 1,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_run_id": metadata["source_run_id"],
        "input_hashes": {
            "series_semanales.csv": metadata["series_sha256"],
            **metadata["source_hashes"],
            "plan_evaluacion_temporal.json": metadata["plan_sha256"],
        },
        "prediction_file": predictions_path.name,
        "prediction_rows": len(result["predictions"]),
        "prediction_sha256": prediction_hash,
        "operational_policy_file": operational_policy_path.name,
        "operational_policy_rows": len(result["operational_policy_predictions"]),
        "operational_policy_sha256": operational_policy_hash,
        "comparison": result["comparison"],
        "operational_policy_comparison": result["operational_policy_comparison"],
        "model_configuration": result["model_configuration"],
        "coverage_note": result["coverage_note"],
        "30_day_note": result["30_day_note"],
    }
    with summary_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    return predictions_path, summary_path


def default_results_root():
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")) / (
        "Tesis/experimentos_demanda/resultados"
    )


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(
        description="Ejecuta evaluación temporal experimental. No modifica los datos fuente."
    )
    parser.add_argument("run_directory", type=Path)
    parser.add_argument("plan_path", type=Path)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Valida hashes y calendario, sin generar pronósticos ni métricas.",
    )
    parser.add_argument("--output-root", type=Path, default=default_results_root())
    args = parser.parse_args(argv)
    repository_root = Path(__file__).resolve().parent.parent
    for input_path in (args.run_directory.resolve(), args.plan_path.resolve()):
        try:
            input_path.relative_to(repository_root)
        except ValueError:
            continue
        raise ValidationError("Los insumos deben estar fuera del repositorio.")

    data = validate_experiment_inputs(args.run_directory, args.plan_path)
    if args.validate_only:
        print(
            "Validación correcta: "
            f"{len(data['product_ids'])} productos; "
            f"{data['plan']['origin_counts']}; "
            f"hash serie={data['series_sha256']}; "
            f"hash calendario={data['plan_sha256']}."
        )
        print(data["coverage_note"])
        return 0

    output_root = args.output_root.resolve()
    try:
        output_root.relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise ValidationError("Los resultados deben guardarse fuera del repositorio.")

    result = evaluate_validated_inputs(data)
    run_output = output_root / data["source_run_id"]
    predictions_path, summary_path = write_results(result, run_output, data)
    print(f"Predicciones: {predictions_path}")
    print(f"Resumen comparativo: {summary_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, ValidationError) as error:
        print(f"Evaluación detenida: {error}", file=sys.stderr)
        raise SystemExit(1)
