import csv
import hashlib
import json
import random
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from evaluacion_temporal import (
    METHODS,
    OPERATIONAL_POLICY_COLUMNS,
    PREDICTION_COLUMNS,
    _compare_operational_policy,
    _compare_on_common_pairs,
    evaluate_validated_inputs,
    validate_experiment_inputs,
    write_results,
)
from modelo_ridge import fit_ridge, forecast_ridge
from modelos_referencia import (
    CrostonInsufficientHistory,
    croston_sba_state,
    forecast_croston_sba,
    forecast_croston_sba_with_moving_average_fallback,
    forecast_for_horizon,
    forecast_last_week,
    forecast_moving_average_4,
    forecast_zero,
)
from planificar_evaluacion import create_plan
from validar_series_python import (
    SERIES_COLUMNS,
    SOURCE_COLUMNS,
    ValidationError,
    expected_weeks,
)


def _write_csv(path, columns, records):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(records)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _synthetic_run(root):
    run = root / "synthetic-run"
    run.mkdir()
    product_records = [
        {
            "id_producto": str(product_id),
            "categoria_id": "1",
            "codigo_sku": f"S{product_id:03d}",
            "nombre": f"Producto {product_id}",
            "estado": "activo",
        }
        for product_id in range(1, 56)
    ]
    sales = []
    details = []
    weekly_by_product = {
        product_id: [0] * 24
        for product_id in range(1, 56)
    }
    sale_id = 1
    detail_id = 1
    for week_index in range(24):
        if week_index % 2 == 0:
            sale_date = date(2026, 4, 6) + timedelta(days=week_index * 7)
            quantity = 2 + week_index % 3
            sales.append(
                {
                    "id_venta": str(sale_id),
                    "fecha_venta": sale_date.isoformat(),
                    "estado": "pagada",
                }
            )
            details.append(
                {
                    "id_detalle_venta": str(detail_id),
                    "venta_id": str(sale_id),
                    "producto_id": "1",
                    "cantidad": str(quantity),
                }
            )
            weekly_by_product[1][week_index] = quantity
            sale_id += 1
            detail_id += 1

    series_rows = []
    weeks = expected_weeks()
    for product_id, values in weekly_by_product.items():
        for week_index, week in enumerate(weeks):
            series_rows.append(
                {
                    "producto_id": str(product_id),
                    "semana_iso": week["semana_iso"],
                    "inicio_semana": week["inicio_semana"],
                    "fin_semana": week["fin_semana"],
                    "unidades": str(values[week_index]),
                }
            )

    source_hashes = {}
    source_hashes["ventas.csv"] = _write_csv(
        run / "ventas.csv", SOURCE_COLUMNS["ventas.csv"], sales
    )
    source_hashes["detalles.csv"] = _write_csv(
        run / "detalles.csv", SOURCE_COLUMNS["detalles.csv"], details
    )
    source_hashes["productos.csv"] = _write_csv(
        run / "productos.csv", SOURCE_COLUMNS["productos.csv"], product_records
    )
    series_hash = _write_csv(
        run / "series_semanales.csv", SERIES_COLUMNS, series_rows
    )
    source_metadata = {
        "run_id": run.name,
        "files": {
            filename: {
                "sha256": digest,
                "rows": len(records),
            }
            for filename, digest, records in (
                ("ventas.csv", source_hashes["ventas.csv"], sales),
                ("detalles.csv", source_hashes["detalles.csv"], details),
                ("productos.csv", source_hashes["productos.csv"], product_records),
            )
        },
    }
    (run / "metadata.json").write_text(
        json.dumps(source_metadata, ensure_ascii=False),
        encoding="utf-8",
    )
    weekly_totals = [
        {
            "semana_iso": week["semana_iso"],
            "unidades": str(
                sum(weekly_by_product[product_id][index] for product_id in weekly_by_product)
            ),
        }
        for index, week in enumerate(weeks)
    ]
    series_metadata = {
        "inputs": source_hashes,
        "outputs": {
            "series_semanales.csv": {
                "sha256": series_hash,
                "rows": len(series_rows),
            }
        },
        "validation": {"weeks": weekly_totals},
    }
    (run / "validacion_series_semanales.json").write_text(
        json.dumps(series_metadata),
        encoding="utf-8",
    )
    plan = create_plan(run)
    plan_path = root / "plan_evaluacion_temporal.json"
    plan_path.write_text(
        json.dumps(plan, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return run, plan_path


class ReferenceForecastTests(unittest.TestCase):
    def test_baselines_differ_and_repeat_their_defined_weekly_values(self):
        history = [2, 0, 4, 0]
        self.assertEqual(forecast_zero(history, 3), [0.0, 0.0, 0.0])
        self.assertEqual(forecast_last_week(history, 2), [0.0, 0.0])
        self.assertEqual(forecast_moving_average_4(history, 2), [1.5, 1.5])

    def test_croston_sba_counts_zero_weeks_between_demand_events(self):
        history = [4, 0, 0] * 8
        state = croston_sba_state(history)
        self.assertEqual(state.positive_weeks, 8)
        self.assertGreater(state.interval, 1)
        self.assertGreater(state.forecast_per_week, 0)
        self.assertLess(state.forecast_per_week, 4)
        with self.assertRaises(CrostonInsufficientHistory):
            forecast_croston_sba([2, 0, 2, 0], 1)

    def test_calendar_horizons_sum_exact_weeks_or_two_sevenths_of_week_five(self):
        five_week_forecast = [7, 14, 21, 28, 35]
        self.assertEqual(forecast_for_horizon(five_week_forecast, 7), 7)
        self.assertEqual(forecast_for_horizon(five_week_forecast, 14), 21)
        self.assertEqual(forecast_for_horizon(five_week_forecast, 30), 80)

    def test_negative_weekly_forecasts_are_rejected(self):
        with self.assertRaises(ValueError):
            forecast_for_horizon([1, 2, 3, 4, -5], 30)

    def test_operational_policy_uses_zero_for_product_without_sales(self):
        result = forecast_croston_sba_with_moving_average_fallback([0] * 12, 7)
        self.assertEqual(result["selected_method"], "promedio_movil_4")
        self.assertEqual(result["positive_training_weeks"], 0)
        self.assertEqual(result["forecast"], 0)

    def test_operational_policy_falls_back_with_insufficient_positive_history(self):
        result = forecast_croston_sba_with_moving_average_fallback(
            [2, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0],
            7,
        )
        self.assertEqual(result["selected_method"], "promedio_movil_4")
        self.assertEqual(result["positive_training_weeks"], 3)
        self.assertEqual(result["forecast"], 0)

    def test_operational_policy_fallback_averages_available_short_histories(self):
        for history, expected in (
            ([4], 4),
            ([4, 8], 6),
            ([3, 6, 9], 6),
            ([], 0),
        ):
            with self.subTest(history=history):
                result = forecast_croston_sba_with_moving_average_fallback(
                    history,
                    7,
                )
                self.assertEqual(result["selected_method"], "promedio_movil_4")
                self.assertEqual(result["forecast"], expected)

    def test_operational_policy_selects_croston_at_exactly_eight_positive_weeks(self):
        result = forecast_croston_sba_with_moving_average_fallback(
            [2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 9, 0],
            14,
        )
        self.assertEqual(result["selected_method"], "croston_sba")
        self.assertEqual(result["positive_training_weeks"], 8)
        self.assertGreater(result["forecast"], 0)

    def test_operational_policy_selects_croston_above_eight_positive_weeks(self):
        result = forecast_croston_sba_with_moving_average_fallback(
            [1, 2, 0, 3, 4, 0, 5, 6, 0, 7, 8, 9],
            30,
        )
        self.assertEqual(result["selected_method"], "croston_sba")
        self.assertEqual(result["positive_training_weeks"], 9)
        self.assertGreater(result["forecast"], 0)

    def test_operational_policy_only_uses_history_passed_as_training(self):
        training = [2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0]
        held_out_weeks = [1000] * 8
        result = forecast_croston_sba_with_moving_average_fallback(training, 14)
        result_after_future_changes = forecast_croston_sba_with_moving_average_fallback(
            (training + held_out_weeks)[:len(training)],
            14,
        )
        self.assertEqual(result, result_after_future_changes)
        self.assertEqual(result["positive_training_weeks"], 6)
        self.assertEqual(
            forecast_croston_sba_with_moving_average_fallback(
                training + held_out_weeks,
                14,
            )["selected_method"],
            "croston_sba",
        )


class RidgeTemporalSafetyTests(unittest.TestCase):
    def test_future_actuals_do_not_change_ridge_forecast_at_fixed_origin(self):
        panel = {
            1: [2, 0, 4, 1, 3, 0, 5, 2, 1, 4, 3, 0] + [0] * 12,
            2: [1, 2, 1, 3, 2, 4, 0, 2, 3, 1, 5, 2] + [0] * 12,
        }
        mutated = {
            product_id: values[:12] + [10_000 + index for index in range(12)]
            for product_id, values in panel.items()
        }
        model = fit_ridge(panel, training_weeks=12)
        mutated_model = fit_ridge(mutated, training_weeks=12)
        expected = forecast_ridge(model, panel[1][:12], 12, 5)
        actual = forecast_ridge(mutated_model, mutated[1][:12], 12, 5)
        np.testing.assert_allclose(expected, actual)
        self.assertTrue(all(value >= 0 for value in actual))

    def test_negative_ridge_outputs_are_clipped_to_zero(self):
        class NegativeModel:
            def predict(self, features):
                return np.full(len(features), -20.0)

        predictions = forecast_ridge(NegativeModel(), [1, 2, 3, 4], 4, 5)
        self.assertEqual(predictions, [0.0] * 5)


class TemporalEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.run, self.plan_path = _synthetic_run(self.root)

    def tearDown(self):
        self.temporary.cleanup()

    def test_inputs_validate_hashes_and_approved_calendar(self):
        data = validate_experiment_inputs(self.run, self.plan_path)
        self.assertEqual(data["plan"]["origin_counts"], {"7": 12, "14": 11, "30": 8})
        self.assertEqual(len(data["product_ids"]), 55)
        self.assertEqual(len(data["daily_units"]), 12)

    def test_altered_temporal_window_is_rejected_before_evaluation(self):
        altered_path = self.root / "altered-plan.json"
        plan = json.loads(self.plan_path.read_text(encoding="utf-8"))
        plan["temporal_design"]["origins_by_horizon"]["7"][0][
            "target_end_exclusive"
        ] = "2026-07-07"
        altered_path.write_text(json.dumps(plan), encoding="utf-8")
        with self.assertRaisesRegex(ValidationError, "calendario no coincide"):
            validate_experiment_inputs(self.run, altered_path)

    def test_modified_series_hash_is_rejected(self):
        series_path = self.run / "series_semanales.csv"
        with series_path.open("a", encoding="utf-8", newline="") as stream:
            stream.write("1,2026-W15,2026-04-06,2026-04-12,0\n")
        with self.assertRaisesRegex(ValidationError, "hash"):
            validate_experiment_inputs(self.run, self.plan_path)

    def test_predictions_and_mae_use_identical_common_pairs(self):
        data = validate_experiment_inputs(self.run, self.plan_path)
        result = evaluate_validated_inputs(data)
        for horizon, comparison in result["comparison"].items():
            common_count = comparison["common_pair_count"]
            self.assertGreater(common_count, 0)
            for method in METHODS:
                self.assertEqual(
                    comparison["method_mae"][method]["pair_count"],
                    common_count,
                )
                self.assertGreaterEqual(
                    comparison["method_mae"][method]["mae_por_par_producto_origen"],
                    0,
                )
                self.assertGreaterEqual(
                    comparison["method_mae"][method]["mae_macro_productos"],
                    0,
                )
        horizon_7 = [
            row for row in result["predictions"]
            if row["horizonte_dias"] == 7
            and row["producto_id"] == 1
            and row["origen"] == "2026-09-13"
        ]
        self.assertEqual({row["unidades_reales"] for row in horizon_7}, {0})
        self.assertEqual({row["incluido_comparacion"] for row in horizon_7}, {True})
        self.assertEqual(
            {row["metodo"] for row in horizon_7},
            set(METHODS),
        )
        first_origin_croston = next(
            row for row in result["predictions"]
            if row["metodo"] == "croston_sba"
            and row["horizonte_dias"] == 7
            and row["producto_id"] == 1
            and row["origen"] == "2026-06-28"
        )
        self.assertIsNone(first_origin_croston["unidades_pronosticadas"])
        self.assertFalse(first_origin_croston["incluido_comparacion"])

    def test_operational_policy_covers_all_planned_pairs_and_matches_moving_average_actuals(self):
        data = validate_experiment_inputs(self.run, self.plan_path)
        result = evaluate_validated_inputs(data)
        policy_by_key = {
            (row["horizon_days"], row["product_id"], row["origin"]): row
            for row in result["operational_policy_predictions"]
        }
        moving_average_by_key = {
            (row["horizonte_dias"], row["producto_id"], row["origen"]): row
            for row in result["predictions"]
            if row["metodo"] == "promedio_movil_4"
        }
        self.assertEqual(policy_by_key.keys(), moving_average_by_key.keys())
        self.assertEqual(
            len(policy_by_key),
            55 * sum(data["plan"]["origin_counts"].values()),
        )
        origins = {
            (int(horizon), origin["origin_date"]): origin
            for horizon, records in data["plan"]["temporal_design"][
                "origins_by_horizon"
            ].items()
            for origin in records
        }
        for key, policy_row in policy_by_key.items():
            moving_average_row = moving_average_by_key[key]
            origin_info = origins[(key[0], key[2])]
            training_history = data["panel"][key[1]][
                :origin_info["training_weeks"]
            ]
            positive_weeks = sum(value > 0 for value in training_history)
            self.assertEqual(
                policy_row["actual_units"],
                moving_average_row["unidades_reales"],
                msg=f"El valor real difiere para el par {key}.",
            )
            self.assertEqual(policy_row["positive_training_weeks"], positive_weeks)
            self.assertEqual(
                policy_row["selected_method"],
                "croston_sba" if positive_weeks >= 8 else "promedio_movil_4",
            )
        for horizon, comparison in result["operational_policy_comparison"].items():
            self.assertEqual(
                comparison["possible_product_origin_pair_count"],
                55 * data["plan"]["origin_counts"][horizon],
            )
            self.assertEqual(comparison["product_count"], 55)

    def test_30_day_actual_is_summed_from_daily_source_records(self):
        data = validate_experiment_inputs(self.run, self.plan_path)
        result = evaluate_validated_inputs(data)
        rows = [
            row for row in result["predictions"]
            if row["horizonte_dias"] == 30
            and row["producto_id"] == 1
            and row["origen"] == "2026-06-28"
        ]
        self.assertEqual({row["unidades_reales"] for row in rows}, {9})
        self.assertEqual({row["inicio_objetivo"] for row in rows}, {"2026-06-29"})
        self.assertEqual({row["fin_objetivo_exclusivo"] for row in rows}, {"2026-07-29"})

    def test_individual_prediction_log_contains_required_fields(self):
        data = validate_experiment_inputs(self.run, self.plan_path)
        result = evaluate_validated_inputs(data)
        output = self.root / "results"
        predictions_path, summary_path = write_results(result, output, data)
        with predictions_path.open("r", encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            self.assertEqual(reader.fieldnames, PREDICTION_COLUMNS)
            row = next(reader)
            self.assertTrue(row["metodo"])
            self.assertTrue(row["horizonte_dias"])
            self.assertTrue(row["producto_id"])
            self.assertTrue(row["origen"])
            self.assertTrue(row["unidades_reales"])
            self.assertTrue(row["unidades_pronosticadas"])
            self.assertTrue(row["error_absoluto"])
        policy_path = output / "politica_operativa.csv"
        with policy_path.open("r", encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            self.assertEqual(reader.fieldnames, OPERATIONAL_POLICY_COLUMNS)
            row = next(reader)
            self.assertTrue(row["product_id"])
            self.assertTrue(row["origin"])
            self.assertTrue(row["horizon_days"])
            self.assertTrue(row["selected_method"])
            self.assertIn("positive_training_weeks", row)
            self.assertTrue(row["predicted_units"])
            self.assertTrue(row["actual_units"])
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        self.assertEqual(summary["input_hashes"]["plan_evaluacion_temporal.json"], data["plan_sha256"])
        self.assertEqual(
            summary["operational_policy_rows"],
            55 * sum(data["plan"]["origin_counts"].values()),
        )
        self.assertEqual(
            summary["operational_policy_sha256"],
            hashlib.sha256(policy_path.read_bytes()).hexdigest(),
        )

    def test_common_pair_comparison_drops_pair_when_any_method_is_unavailable(self):
        rows = [
            {
                "metodo": method,
                "horizonte_dias": 7,
                "producto_id": 1,
                "origen": "2026-06-28",
                "unidades_reales": 2,
                "unidades_pronosticadas": None if method == "croston_sba" else 2,
                "incluido_comparacion": method != "croston_sba",
            }
            for method in METHODS
        ]
        comparison = _compare_on_common_pairs(rows)["7"]
        self.assertEqual(comparison["common_pair_count"], 0)
        self.assertEqual(
            {
                value["pair_count"]
                for value in comparison["method_mae"].values()
            },
            {0},
        )

    @staticmethod
    def _operational_policy_comparison_fixture():
        policy_rows = []
        baseline_rows = []
        for horizon in (7, 14, 30):
            origin = f"2026-06-{horizon:02d}"
            policy_rows.append(
                {
                    "horizon_days": horizon,
                    "product_id": 1,
                    "origin": origin,
                    "selected_method": "promedio_movil_4",
                    "positive_training_weeks": 0,
                    "predicted_units": 0,
                    "actual_units": 3,
                    "absolute_error": 3,
                }
            )
            baseline_rows.append(
                {
                    "metodo": "promedio_movil_4",
                    "horizonte_dias": horizon,
                    "producto_id": 1,
                    "origen": origin,
                    "unidades_reales": 3,
                    "unidades_pronosticadas": 0,
                    "error_absoluto": 3,
                }
            )
        return policy_rows, baseline_rows

    def test_operational_comparison_rejects_duplicate_moving_average_keys(self):
        policy_rows, baseline_rows = self._operational_policy_comparison_fixture()
        baseline_rows.append(dict(baseline_rows[0]))
        with self.assertRaisesRegex(ValidationError, "promedio móvil.*duplicadas"):
            _compare_operational_policy(policy_rows, baseline_rows)

    def test_operational_comparison_rejects_missing_or_additional_keys(self):
        policy_rows, baseline_rows = self._operational_policy_comparison_fixture()
        with self.subTest("missing baseline pair"):
            with self.assertRaisesRegex(ValidationError, "no cubren los mismos pares"):
                _compare_operational_policy(policy_rows, baseline_rows[:-1])
        with self.subTest("additional policy pair"):
            additional = dict(policy_rows[0])
            additional["product_id"] = 2
            with self.assertRaisesRegex(ValidationError, "no cubren los mismos pares"):
                _compare_operational_policy(policy_rows + [additional], baseline_rows)

    def test_operational_comparison_rejects_different_actual_units(self):
        policy_rows, baseline_rows = self._operational_policy_comparison_fixture()
        baseline_rows[0]["unidades_reales"] = 99
        with self.assertRaisesRegex(ValidationError, "valores reales distintos"):
            _compare_operational_policy(policy_rows, baseline_rows)


if __name__ == "__main__":
    unittest.main()
