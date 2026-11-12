import unittest
from datetime import date, datetime, timedelta

from experimento_minimarket import (
    build_panel,
    common_cohort_metric_rows,
    eligible_sample,
    forecast_croston,
    forecast_tsb,
    metric_values,
    prepare_feature_indexes,
    rank_candidates,
    rolling_features,
    training_examples,
)


def movement(product_id, movement_id, kind, delta, day, time="12:00:00"):
    return {
        "producto_id": str(product_id),
        "movimiento_id": str(movement_id),
        "tipo": kind,
        "variacion_unidades": str(delta),
        "ocurrido_en": f"{day} {time}",
        "fecha_comercial": day,
    }


class DailyPanelTests(unittest.TestCase):
    def test_unknown_and_censored_days_are_not_encoded_as_zero(self):
        sources = {
            "movimientos": [
                movement(1, 1, "ajuste", 10, "2025-10-01", "08:00:00"),
                movement(1, 2, "venta", -10, "2025-10-03", "10:00:00"),
                movement(1, 3, "recepcion", 2, "2025-10-04", "12:00:00"),
                movement(2, 4, "ajuste", 5, "2025-10-01", "08:00:00"),
            ],
            "ventas_diarias": [{
                "producto_id": "1",
                "fecha_comercial": "2025-10-03",
                "unidades": "10",
                "precio_unitario_ponderado": "2.50",
            }],
            "compras": [],
            "recepciones": [],
        }

        dates, panel, _, _, _ = build_panel(sources, [1, 2])
        first = dates.index(date(2025, 10, 2))
        stockout = dates.index(date(2025, 10, 3))
        restock = dates.index(date(2025, 10, 4))
        resumed = dates.index(date(2025, 10, 5))

        self.assertEqual(panel[1]["values"][first], 0.0)
        self.assertEqual(panel[2]["values"][first], 0.0)
        self.assertIsNone(panel[1]["values"][stockout])
        self.assertEqual(panel[1]["statuses"][stockout], "censored_with_recorded_sales")
        self.assertIsNone(panel[1]["values"][restock])
        self.assertEqual(panel[1]["statuses"][restock], "censored_or_unavailable")
        self.assertEqual(panel[1]["values"][resumed], 0.0)

    def test_target_is_ineligible_if_any_day_is_unknown(self):
        dates, panel, _, _, _ = build_panel(
            {
                "movimientos": [movement(1, 1, "ajuste", 20, "2025-10-01")],
                "ventas_diarias": [],
                "compras": [],
                "recepciones": [],
            },
            [1],
        )
        origin_index = dates.index(date(2025, 10, 2))
        panel[1]["values"][origin_index + 2] = None

        self.assertIsNone(eligible_sample(dates, panel, 1, origin_index, 7))

    def test_croston_and_tsb_return_nonnegative_daily_rates(self):
        history = [0, 0, 2, 0, 0, 3, 0, 0]
        self.assertGreaterEqual(forecast_croston(history, 0.1), 0)
        self.assertGreaterEqual(forecast_tsb(history, 0.1, 0.1), 0)
        self.assertEqual(forecast_tsb([0, 0, 0], 0.1, 0.1), 0)
        self.assertAlmostEqual(forecast_tsb([0, 0, 2, 0], 0.1, 0.1), 0.6)

    def test_metrics_use_only_observed_actuals_and_expected_wape(self):
        rows = [
            {"product_id": 1, "origin": "2026-01-05", "actual_units": 10, "predicted_units": 8},
            {"product_id": 2, "origin": "2026-01-05", "actual_units": 5, "predicted_units": 7},
        ]
        result = metric_values(rows)
        self.assertEqual(result["mae"], 2)
        self.assertEqual(result["rmse"], 2)
        self.assertAlmostEqual(result["wape"], 4 / 15)

    def test_supply_features_do_not_subtract_future_receipts(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(70)]
        origin_index = 55
        panel = {
            1: {
                "values": [1.0] * len(dates),
                "prices": [None] * len(dates),
                "stock": [10] * len(dates),
            }
        }
        origin = dates[origin_index]
        origin_time = datetime.combine(origin, datetime.min.time())
        purchases_by_product, receipts_by_product_day = prepare_feature_indexes(
            [
                {"purchase_id": 1, "product_id": 1, "created": origin_time, "ordered_units": 10},
                {
                    "purchase_id": 2,
                    "product_id": 1,
                    "created": origin_time + timedelta(days=1),
                    "ordered_units": 100,
                },
            ],
            {},
        )
        features = rolling_features(
            dates, panel, 1, origin_index, 7, "supply",
            purchases_by_product,
            {
                (1, 1): [
                    (origin_time - timedelta(days=1), 3),
                    (origin_time + timedelta(days=1), 5),
                ]
            },
            receipts_by_product_day,
            {},
        )

        self.assertEqual(features["pending_order_units_asof_origin"], 7)

    def test_ridge_training_examples_end_before_prediction_origin(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(140)]
        panel = {
            1: {
                "values": [float(index) for index in range(len(dates))],
                "prices": [None] * len(dates),
                "stock": [1000] * len(dates),
            }
        }
        history_origins = [dates[index] for index in (70, 80, 90, 100)]
        features, targets = training_examples(
            dates, panel, [1], 7, 110, "history", history_origins, {}, {}, {}, {},
        )

        self.assertEqual(len(features), len(targets))
        self.assertEqual(max(targets), sum(float(index) for index in range(101, 108)))

    def test_ranking_handles_undefined_wape_on_common_cohort(self):
        rows = []
        for model, family, predictions in (
            ("naive_7", "naive_7", [1, 1]),
            ("moving_average_7", "moving_average", [0, 0]),
            ("croston_sba_alpha_0.1", "croston_sba", [2, 0]),
        ):
            for product_id, prediction in enumerate(predictions, start=1):
                rows.append({
                    "horizon_days": 7,
                    "model": model,
                    "family": family,
                    "product_id": product_id,
                    "origin": "2026-01-05",
                    "actual_units": 0.0,
                    "predicted_units": prediction,
                })

        ranking, common_count = rank_candidates(rows, 7)
        cohort_rows = common_cohort_metric_rows(rows, "desarrollo")

        self.assertEqual(common_count, 2)
        self.assertEqual(ranking[0]["family"], "moving_average")
        self.assertEqual({row["n_product_origins"] for row in cohort_rows}, {2})


if __name__ == "__main__":
    unittest.main()
