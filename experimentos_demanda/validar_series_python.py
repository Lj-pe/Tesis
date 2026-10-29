import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path


EXPECTED_PRODUCTS = 55
FIRST_MONDAY = date(2026, 4, 6)
WEEK_COUNT = 24
SERIES_COLUMNS = [
    "producto_id",
    "semana_iso",
    "inicio_semana",
    "fin_semana",
    "unidades",
]
SOURCE_COLUMNS = {
    "ventas.csv": ["id_venta", "fecha_venta", "estado"],
    "detalles.csv": ["id_detalle_venta", "venta_id", "producto_id", "cantidad"],
    "productos.csv": ["id_producto", "categoria_id", "codigo_sku", "nombre", "estado"],
}


class ValidationError(Exception):
    pass


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_csv(path, expected_columns):
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != expected_columns:
            raise ValidationError(
                f"{path.name}: columnas inesperadas: {reader.fieldnames!r}"
            )
        return list(reader)


def expected_weeks():
    weeks = []
    for offset in range(WEEK_COUNT):
        monday = date.fromordinal(FIRST_MONDAY.toordinal() + offset * 7)
        sunday = date.fromordinal(monday.toordinal() + 6)
        iso_year, iso_week, _ = monday.isocalendar()
        weeks.append(
            {
                "semana_iso": f"{iso_year}-W{iso_week:02d}",
                "inicio_semana": monday.isoformat(),
                "fin_semana": sunday.isoformat(),
            }
        )
    return weeks


def parse_positive_id(value, label):
    if not re.fullmatch(r"\d+", value):
        raise ValidationError(f"{label}: ID no entero positivo: {value!r}")
    parsed = int(value)
    if parsed <= 0:
        raise ValidationError(f"{label}: ID no entero positivo: {value!r}")
    return parsed


def source_weekly_totals(run_directory, summary):
    source_records = {}
    for filename, columns in SOURCE_COLUMNS.items():
        path = run_directory / filename
        expected_hash = summary.get("inputs", {}).get(filename)
        if not expected_hash or sha256(path) != expected_hash:
            raise ValidationError(f"Hash de entrada ausente o distinto: {filename}")
        source_records[filename] = read_csv(path, columns)

    product_ids = [
        parse_positive_id(row["id_producto"], "productos.csv")
        for row in source_records["productos.csv"]
    ]
    if len(product_ids) != len(set(product_ids)):
        raise ValidationError("productos.csv contiene IDs duplicados.")
    if len(product_ids) != EXPECTED_PRODUCTS:
        raise ValidationError(
            f"Catálogo fuente: esperados {EXPECTED_PRODUCTS}; observados {len(product_ids)}."
        )
    valid_product_ids = set(product_ids)

    sales_by_id = {}
    for row in source_records["ventas.csv"]:
        sale_id = parse_positive_id(row["id_venta"], "ventas.csv")
        if sale_id in sales_by_id:
            raise ValidationError("ventas.csv contiene IDs duplicados.")
        if row["estado"] != "pagada":
            raise ValidationError("ventas.csv incluye una venta no pagada.")
        try:
            sale_date = date.fromisoformat(row["fecha_venta"])
        except ValueError as error:
            raise ValidationError("ventas.csv contiene una fecha inválida.") from error
        if sale_date.isoformat() != row["fecha_venta"]:
            raise ValidationError("ventas.csv contiene una fecha no ISO.")
        sales_by_id[sale_id] = sale_date

    totals = {week["semana_iso"]: 0 for week in expected_weeks()}
    detail_ids = set()
    for row in source_records["detalles.csv"]:
        detail_id = parse_positive_id(row["id_detalle_venta"], "detalles.csv")
        sale_id = parse_positive_id(row["venta_id"], "detalles.csv")
        product_id = parse_positive_id(row["producto_id"], "detalles.csv")
        if detail_id in detail_ids:
            raise ValidationError("detalles.csv contiene IDs duplicados.")
        detail_ids.add(detail_id)
        if sale_id not in sales_by_id or product_id not in valid_product_ids:
            raise ValidationError("detalles.csv contiene referencias inexistentes.")
        if not re.fullmatch(r"\d+", row["cantidad"]) or int(row["cantidad"]) <= 0:
            raise ValidationError("detalles.csv contiene cantidades inválidas.")
        sale_date = sales_by_id[sale_id]
        iso_year, iso_week, _ = sale_date.isocalendar()
        week = f"{iso_year}-W{iso_week:02d}"
        if week in totals:
            totals[week] += int(row["cantidad"])
    return totals, valid_product_ids


def validate(run_directory):
    summary_path = run_directory / "validacion_series_semanales.json"
    series_path = run_directory / "series_semanales.csv"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))

    output_metadata = summary.get("outputs", {}).get(series_path.name, {})
    if sha256(series_path) != output_metadata.get("sha256"):
        raise ValidationError("El hash de series_semanales.csv no coincide con el resumen JS.")
    rows = read_csv(series_path, SERIES_COLUMNS)
    if len(rows) != output_metadata.get("rows"):
        raise ValidationError("El conteo no coincide con el resumen JS.")

    expected = expected_weeks()
    week_map = {week["semana_iso"]: week for week in expected}
    pair_counts = {}
    series_totals = {week["semana_iso"]: 0 for week in expected}
    product_ids = set()

    for row in rows:
        product_id = parse_positive_id(row["producto_id"], "series_semanales.csv")
        product_ids.add(product_id)
        week = week_map.get(row["semana_iso"])
        if not week:
            raise ValidationError(f"Semana fuera de W15–W38: {row['semana_iso']}")
        if (
            row["inicio_semana"] != week["inicio_semana"]
            or row["fin_semana"] != week["fin_semana"]
        ):
            raise ValidationError(f"Fechas de semana inválidas: {row['semana_iso']}")
        if not re.fullmatch(r"\d+", row["unidades"]):
            raise ValidationError(f"Unidades no enteras/no negativas: {row['unidades']!r}")
        units = int(row["unidades"])
        pair = (product_id, row["semana_iso"])
        pair_counts[pair] = pair_counts.get(pair, 0) + 1
        series_totals[row["semana_iso"]] += units

    source_totals, source_product_ids = source_weekly_totals(run_directory, summary)
    if product_ids != source_product_ids:
        raise ValidationError("Los IDs de producto de la serie no coinciden con el catálogo fuente.")

    expected_pairs = {
        (product_id, week["semana_iso"])
        for product_id in source_product_ids
        for week in expected
    }
    duplicate_pairs = [pair for pair, count in pair_counts.items() if count != 1]
    if duplicate_pairs:
        raise ValidationError(f"Hay parejas producto-semana duplicadas: {len(duplicate_pairs)}.")
    if set(pair_counts) != expected_pairs:
        raise ValidationError("La serie no contiene todas las combinaciones producto-semana.")
    if len(rows) != EXPECTED_PRODUCTS * WEEK_COUNT:
        raise ValidationError(
            f"Filas esperadas={EXPECTED_PRODUCTS * WEEK_COUNT}; observadas={len(rows)}."
        )
    if series_totals != source_totals:
        raise ValidationError("Los totales semanales difieren de ventas.csv y detalles.csv.")

    try:
        summary_weeks = {
            week["semana_iso"]: int(week["unidades"])
            for week in summary["validation"]["weeks"]
        }
    except (KeyError, TypeError, ValueError) as error:
        raise ValidationError("El resumen JS no incluye totales semanales válidos.") from error
    if series_totals != summary_weeks:
        raise ValidationError("Los totales semanales difieren del resumen JS.")

    return {
        "passed": True,
        "series_file": series_path.name,
        "series_sha256": sha256(series_path),
        "products": len(product_ids),
        "weeks": len(expected),
        "rows": len(rows),
        "duplicate_product_weeks": len(duplicate_pairs),
        "total_units": sum(series_totals.values()),
        "weekly_totals": [
            {"semana_iso": week["semana_iso"], "unidades": series_totals[week["semana_iso"]]}
            for week in expected
        ],
        "checks": [
            "hashes de serie y CSV fuente",
            "columnas y tipos",
            "55 productos del catálogo",
            "1.320 combinaciones producto-semana únicas y completas",
            "semanas ISO W15–W38 de lunes a domingo",
            "unidades enteras no negativas",
            "totales semanales contra CSV fuente y resumen JavaScript",
        ],
        "coverage_note": (
            "Los ceros semanales representan ausencia de ventas registradas; "
            "no demuestran cobertura diaria completa."
        ),
    }


def default_report_root():
    root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    return root / "Tesis" / "experimentos_demanda" / "etapa3_python"


def main():
    parser = argparse.ArgumentParser(
        description="Valida la serie semanal y compara totales con los CSV fuente."
    )
    parser.add_argument("run_directory", type=Path)
    parser.add_argument(
        "--report-root",
        type=Path,
        default=default_report_root(),
        help="Directorio temporal fuera del repositorio para guardar el informe.",
    )
    args = parser.parse_args()
    run_directory = args.run_directory.resolve()
    repository_root = Path(__file__).resolve().parent.parent
    try:
        run_directory.relative_to(repository_root)
        raise ValidationError("El extracto debe estar fuera del repositorio.")
    except ValueError:
        pass

    report = validate(run_directory)
    report["validated_at_utc"] = datetime.now(timezone.utc).isoformat()
    report_directory = args.report_root.resolve() / run_directory.name
    try:
        report_directory.relative_to(repository_root)
        raise ValidationError("El directorio del informe debe estar fuera del repositorio.")
    except ValueError:
        pass
    report_directory.mkdir(parents=True, exist_ok=True)
    report_path = report_directory / "validacion_python.json"
    with report_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")

    print(
        f"OK: {report['rows']} filas, {report['products']} productos, "
        f"{report['weeks']} semanas; {report['total_units']} unidades."
    )
    print("OK: tipos, claves, semanas y totales semanales contra los CSV fuente.")
    print(report["coverage_note"])
    print(f"Informe temporal: {report_path}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, ValidationError) as error:
        print(f"Validación Python fallida: {error}", file=sys.stderr)
        sys.exit(1)
