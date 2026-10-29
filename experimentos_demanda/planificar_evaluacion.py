import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from validar_series_python import ValidationError, expected_weeks, read_csv, SERIES_COLUMNS


WARMUP_WEEKS = 12
HORIZONS_DAYS = (7, 14, 30)


def create_plan(run_directory):
    series = read_csv(run_directory / "series_semanales.csv", SERIES_COLUMNS)
    weeks = expected_weeks()
    if len(series) != 55 * len(weeks):
        raise ValidationError("La serie no contiene 55 × 24 filas.")
    week_by_id = {week["semana_iso"]: week for week in weeks}
    products = set()
    pairs = set()
    for row in series:
        if not re.fullmatch(r"\d+", row["producto_id"]) or int(row["producto_id"]) <= 0:
            raise ValidationError("La serie contiene un ID de producto inválido.")
        week = week_by_id.get(row["semana_iso"])
        if not week:
            raise ValidationError("La serie no contiene exactamente W15–W38.")
        if (
            row["inicio_semana"] != week["inicio_semana"]
            or row["fin_semana"] != week["fin_semana"]
        ):
            raise ValidationError(f"Fechas de semana inválidas: {row['semana_iso']}.")
        if not re.fullmatch(r"\d+", row["unidades"]):
            raise ValidationError("La serie contiene unidades no enteras o negativas.")
        pair = (row["producto_id"], row["semana_iso"])
        if pair in pairs:
            raise ValidationError("La serie contiene parejas producto-semana duplicadas.")
        pairs.add(pair)
        products.add(row["producto_id"])
    if len(products) != 55 or len(pairs) != 55 * len(weeks):
        raise ValidationError("La serie no contiene las 55 × 24 parejas completas.")

    coverage_start = date.fromisoformat(weeks[0]["inicio_semana"])
    coverage_end_exclusive = date.fromisoformat(weeks[-1]["fin_semana"]) + timedelta(days=1)
    origins_by_horizon = {}

    for horizon in HORIZONS_DAYS:
        origins = []
        for week_index in range(WARMUP_WEEKS, len(weeks)):
            target_start = date.fromisoformat(weeks[week_index]["inicio_semana"])
            origin = date.fromisoformat(weeks[week_index - 1]["fin_semana"])
            target_end = target_start + timedelta(days=horizon)
            if target_end > coverage_end_exclusive:
                continue
            origins.append(
                {
                    "origin_date": origin.isoformat(),
                    "origin_definition": "Cierre del domingo",
                    "training_first_week": weeks[0]["semana_iso"],
                    "training_last_week": weeks[week_index - 1]["semana_iso"],
                    "training_weeks": week_index,
                    "target_start_inclusive": target_start.isoformat(),
                    "target_end_exclusive": target_end.isoformat(),
                    "target_days": horizon,
                    "weekly_bins_touched": (horizon + 6) // 7,
                    "partial_final_week_days": horizon % 7,
                }
            )
        origins_by_horizon[str(horizon)] = origins

    expected_counts = {"7": 12, "14": 11, "30": 8}
    actual_counts = {key: len(origins) for key, origins in origins_by_horizon.items()}
    if actual_counts != expected_counts:
        raise ValidationError(
            f"Conteos de orígenes inesperados: {actual_counts}; esperados={expected_counts}."
        )

    return {
        "format_version": 1,
        "planned_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_run_id": run_directory.name,
        "series_file": "series_semanales.csv",
        "temporal_design": {
            "origin_rule": (
                "Origen al cierre de cada domingo; el objetivo empieza el lunes siguiente. "
                "El entrenamiento inicial contiene las 12 semanas completas W15–W26, y "
                "cada origen posterior usa únicamente semanas completas anteriores."
            ),
            "warmup_weeks": WARMUP_WEEKS,
            "initial_training_weeks": {
                "first": "2026-W15",
                "last": "2026-W26",
                "start_inclusive": "2026-04-06",
                "end_inclusive": "2026-06-28",
            },
            "target_interval": "[target_start_inclusive, target_end_exclusive)",
            "available_interval": {
                "start_inclusive": coverage_start.isoformat(),
                "end_exclusive": coverage_end_exclusive.isoformat(),
            },
            "origins_by_horizon": origins_by_horizon,
            "candidate_comparison": (
                "Para cada horizonte, comparar candidatos en los mismos pares producto-origen. "
                "Determinar elegibilidad por producto solo con el tramo de entrenamiento."
            ),
            "overlap_note": (
                "Los orígenes avanzan una semana; por ello, las ventanas de 14 y 30 días "
                "se solapan entre orígenes y no son observaciones independientes."
            ),
        },
        "horizon_30_days": {
            "weekly_bins_touched": 5,
            "complete_weeks": 4,
            "partial_week_days": 2,
            "weekly_training_target": (
                "El valor real exacto de 30 días requiere sumar ventas por fecha en los CSV "
                "transaccionales. Cada ventana de 30 días que comienza el lunes incluye "
                "cuatro semanas completas y dos días de una quinta semana. Convertir "
                "pronósticos semanales mediante cuatro semanas más 2/7 de la quinta supone "
                "demanda uniforme dentro de esa semana; es una aproximación, no un resultado "
                "observado."
            ),
            "limitation": (
                "La serie semanal por sí sola no permite evaluar exactamente una ventana "
                "de 30 días calendario."
            ),
        },
        "coverage_warning": (
            "Las semanas disponibles son intervalos completos, pero las ventas registradas "
            "no prueban que la captura diaria esté completa. Los orígenes son una planificación "
            "temporal, no una autorización para tratar días sin ventas como demanda cero "
            "observada ni una validación predictiva."
        ),
        "origin_counts": actual_counts,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Calcula el calendario de orígenes sin entrenar ni predecir."
    )
    parser.add_argument("run_directory", type=Path)
    parser.add_argument(
        "--report-root",
        type=Path,
        default=Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
        / "Tesis"
        / "experimentos_demanda"
        / "etapa3_python",
    )
    args = parser.parse_args()
    run_directory = args.run_directory.resolve()
    repository_root = Path(__file__).resolve().parent.parent
    try:
        run_directory.relative_to(repository_root)
        raise ValidationError("El extracto debe estar fuera del repositorio.")
    except ValueError:
        pass

    plan = create_plan(run_directory)
    report_directory = args.report_root.resolve() / run_directory.name
    try:
        report_directory.relative_to(repository_root)
        raise ValidationError("El directorio del informe debe estar fuera del repositorio.")
    except ValueError:
        pass
    report_directory.mkdir(parents=True, exist_ok=True)
    report_path = report_directory / "plan_evaluacion_temporal.json"
    with report_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(plan, stream, ensure_ascii=False, indent=2)
        stream.write("\n")

    print(f"Orígenes planificados: {plan['origin_counts']}")
    print("7 días: 12; 14 días: 11; 30 días: 8, con W15–W26 como entrenamiento inicial.")
    print(plan["coverage_warning"])
    print(f"Plan temporal: {report_path}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValidationError) as error:
        print(f"No se pudo planificar la evaluación: {error}", file=sys.stderr)
        sys.exit(1)
