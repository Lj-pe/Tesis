import argparse
import csv
import json
import sys
from pathlib import Path

import experimento_fase6 as phase6
import experimento_minimarket as v3


ORIGINAL_CANDIDATE_SPECS = phase6.candidate_specs


def candidate_specs_without_pooling(horizon):
    return [
        spec for spec in ORIGINAL_CANDIDATE_SPECS(horizon)
        if spec["kind"] != "hurdle"
        and (
            spec["kind"] != "weekday"
            or spec.get("pool_days", 0) == 0
        )
    ]


def read_summary(directory):
    return json.loads((directory / "resumen.json").read_text(encoding="utf-8"))


def old_v6_holdout(v6_directory, summary):
    selected = {
        (int(key.split("_")[0][1:]), key.split("_", 1)[1]): value
        for key, value in summary["selected_by_horizon_segment"].items()
    }
    rows = phase6.read_csv(v6_directory / "predicciones_seleccionadas.csv")
    selected_rows = [
        row for row in rows
        if row["phase"] == "holdout"
        and (int(row["horizon_days"]), row["segment"]) in selected
        and row["candidate_id"] == selected[(int(row["horizon_days"]), row["segment"])]
    ]
    return selected_rows


def assert_same_holdout_cohort(output_directory, summary, old_v6_rows):
    new_rows = phase6.read_csv(output_directory / "predicciones_seleccionadas.csv")
    selected = summary["selected_by_horizon_segment"]
    for horizon in v3.HORIZONS:
        new_selected = [
            row for row in new_rows
            if row["phase"] == "holdout"
            and row["candidate_id"] == selected[
                f"h{horizon}_{row['segment']}"
            ]
            and int(row["horizon_days"]) == horizon
        ]
        old_selected = [
            row for row in old_v6_rows
            if int(row["horizon_days"]) == horizon
        ]
        new_actuals = {
            (int(row["product_id"]), row["origin"]): float(row["actual_units"])
            for row in new_selected
        }
        old_actuals = {
            (int(row["product_id"]), row["origin"]): float(row["actual_units"])
            for row in old_selected
        }
        if not new_actuals or new_actuals != old_actuals:
            raise v3.ExperimentError(
                f"La cohorte/etiquetas holdout no coincide con v6 en H{horizon}."
            )


def write_report(path, summary):
    lines = [
        "# Revisión de Fase 6 sin pooling por categoría",
        "",
        f"- Extracto: `{summary['source_run_id']}`.",
        "- Reutiliza el extracto y las cohortes comparables de v3–v6.",
        "- Las configuraciones se seleccionaron solo con desarrollo; el holdout no participó.",
        "- Se excluyeron los candidatos que ponderan por categoría. El hurdle sin prior de categoría se omitió porque es algebraicamente equivalente a una media móvil; los perfiles semanales se retuvieron únicamente con `pool_days=0`.",
        "- El holdout ya fue consultado en v3–v6; esta evaluación es una comparación temporal reutilizada, no un holdout virgen.",
        "",
        "## Selección por horizonte y segmento",
        "",
        "| H | Segmento | Candidato | Desarrollo MAE/RMSE/WAPE | Holdout n | Holdout MAE/RMSE/WAPE |",
        "|---:|---|---|---|---:|---|",
    ]
    for row in summary["selected_segment_metrics"]:
        dev = row["development"]
        hold = row["holdout"]
        lines.append(
            f"| {row['horizon_days']} | {row['segment']} | "
            f"`{row['candidate_id']}` | "
            f"{dev['mae']:.3f}/{dev['rmse']:.3f}/{dev['wape']:.3f} | "
            f"{hold['n_product_origins']} | "
            f"{hold['mae']:.3f}/{hold['rmse']:.3f}/{hold['wape']:.3f} |"
        )
    lines += [
        "",
        "## Comparación global de holdout",
        "",
        "| H | Modelo | MAE | RMSE | WAPE |",
        "|---:|---|---:|---:|---:|",
    ]
    for horizon in v3.HORIZONS:
        for name in ("v3", "v4", "v5", "v6_original", "v6_sin_categoria"):
            metrics = summary["comparison_global_holdout"][f"h{horizon}_{name}"]
            lines.append(
                f"| {horizon} | {name} | {metrics['mae']:.3f} | "
                f"{metrics['rmse']:.3f} | {metrics['wape']:.3f} |"
            )
    lines += [
        "",
        "## Salvaguardas y límites",
        "",
        "- Las métricas se calculan sobre producto-orígenes y etiquetas comparables; los días desconocidos no se imputan.",
        "- La segmentación usa únicamente la ventana observable anterior al origen.",
        "- Las categorías actuales no se usan para agrupar productos ni para aportar información a las predicciones.",
        "- Los cinco orígenes de holdout tienen ventanas objetivo solapadas y ya fueron vistos en las fases previas.",
        "- Esta re-selección no resuelve la autorización de la API, el corte comercial futuro ni la paridad de Ridge para producción.",
        "",
        "## Artefactos",
        "",
        "- `metricas_candidatos_desarrollo.csv`, `configuraciones.csv` y `ranking_desarrollo.csv`.",
        "- `metricas_por_segmento.csv`, `metricas_por_producto.csv` y `predicciones_seleccionadas.csv`.",
        "- `comparacion_global.csv`, `comparacion_segmentos.csv`, `resumen.json` y este informe.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def run(extract_directory, v3_directory, v4_directory, v5_directory, v6_directory, output_directory):
    if output_directory.exists():
        raise v3.ExperimentError(f"La salida ya existe; no se sobrescribe: {output_directory}")

    v6_summary = read_summary(v6_directory)
    if v6_summary.get("source_run_id") != read_summary(v5_directory).get("source_run_id"):
        raise v3.ExperimentError("v5 y v6 no comparten source_run_id.")

    original_candidate_specs = phase6.candidate_specs
    original_write_report = phase6.write_report
    phase6.candidate_specs = candidate_specs_without_pooling
    phase6.write_report = lambda *_args, **_kwargs: None
    try:
        summary = phase6.run(
            extract_directory,
            v3_directory,
            v4_directory,
            v5_directory,
            output_directory,
        )
    finally:
        phase6.candidate_specs = original_candidate_specs
        phase6.write_report = original_write_report

    old_v6_rows = old_v6_holdout(v6_directory, v6_summary)
    assert_same_holdout_cohort(output_directory, summary, old_v6_rows)
    comparison = {}
    for horizon in v3.HORIZONS:
        current = summary["global_holdout"][f"h{horizon}_v6_hibrido"]
        comparison[f"h{horizon}_v6_sin_categoria"] = current
        previous_rows = [
            row for row in old_v6_rows
            if int(row["horizon_days"]) == horizon
        ]
        if not previous_rows:
            raise v3.ExperimentError(f"v6 no tiene holdout seleccionado para H{horizon}.")
        comparison[f"h{horizon}_v6_original"] = phase6.metrics(previous_rows)
        for name in ("v3", "v4", "v5"):
            comparison[f"h{horizon}_{name}"] = summary["global_holdout"][f"h{horizon}_{name}"]

    summary["experiment"] = "minimarket-demand-phase6-no-category-pooling"
    summary["category_pooling_used"] = False
    summary["comparison_global_holdout"] = comparison
    summary["original_v6_selected_by_horizon_segment"] = (
        v6_summary["selected_by_horizon_segment"]
    )
    summary["original_v6_input_sha256"] = {
        str(path): phase6.file_hash(path)
        for path in (
            v6_directory / "resumen.json",
            v6_directory / "predicciones_seleccionadas.csv",
        )
    }
    with (output_directory / "resumen.json").open(
        "w", encoding="utf-8", newline="\n"
    ) as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")

    comparison_path = output_directory / "comparacion_global.csv"
    with comparison_path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
        fields = list(rows[0]) if rows else []
    for row in rows:
        if row["model"] == "v6_hibrido":
            row["model"] = "v6_sin_categoria"
    with comparison_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    segment_comparison_path = output_directory / "comparacion_segmentos.csv"
    with segment_comparison_path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
        fields = list(rows[0]) if rows else []
    for row in rows:
        if row["model"] == "v6":
            row["model"] = "v6_sin_categoria"
    with segment_comparison_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    write_report(output_directory / "INFORME_FASE6_SIN_CATEGORIA.md", summary)
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Re-selecciona candidatos de Fase 6 sin pooling por categoría."
    )
    parser.add_argument("extract_directory", type=Path)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("v4_directory", type=Path)
    parser.add_argument("v5_directory", type=Path)
    parser.add_argument("v6_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    try:
        summary = run(
            args.extract_directory,
            args.v3_directory,
            args.v4_directory,
            args.v5_directory,
            args.v6_directory,
            args.output_directory,
        )
        print(json.dumps({
            "output_directory": str(args.output_directory.resolve()),
            "selected_by_horizon_segment": summary["selected_by_horizon_segment"],
            "comparison_global_holdout": summary["comparison_global_holdout"],
        }, ensure_ascii=False, indent=2))
    except (v3.ExperimentError, OSError, KeyError, ValueError) as error:
        print(f"Experimento sin pooling detenido: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
