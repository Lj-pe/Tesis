import unittest
from datetime import date, datetime, time, timedelta

from experimento_fase2 import (
    WINDOWS_BY_HORIZON,
    adida_forecast,
    candidate_specs,
    decay_weights,
    history_rate,
    phase2_features,
    prepare_indexes,
    selected_history,
    tsb_weighted,
)


class PhaseTwoWindowTests(unittest.TestCase):
    def test_requested_windows_and_strategy_grid(self):
        self.assertEqual(WINDOWS_BY_HORIZON[7], (30, 45, 60, 90))
        self.assertEqual(WINDOWS_BY_HORIZON[14], (60, 90, 120, 150))
        self.assertEqual(WINDOWS_BY_HORIZON[30], (90, 120, 150, 180, 210))
        for horizon, windows in WINDOWS_BY_HORIZON.items():
            specs = candidate_specs(horizon)
            self.assertEqual(
                {spec["window_days"] for spec in specs},
                set(windows),
            )
            self.assertEqual(
                {spec["strategy"] for spec in specs},
                {"rolling", "weighted_full_history"},
            )
            self.assertTrue(any(spec["kind"] == "ridge" for spec in specs))
            self.assertTrue(any(spec["kind"] == "adida" for spec in specs))

    def test_exponential_kernel_uses_requested_half_life(self):
        weights = decay_weights([0, 30, 60], 30)
        self.assertAlmostEqual(weights[0], 1.0)
        self.assertAlmostEqual(weights[1], 0.5)
        self.assertAlmostEqual(weights[2], 0.25)

    def test_rolling_window_is_bounded_and_full_history_is_recency_weighted(self):
        history = [0.0] * 30 + [10.0] * 30
        self.assertEqual(selected_history(history, 59, 20, "rolling"), [10.0] * 20)
        rolling = history_rate(selected_history(history, 59, 30, "rolling"), 30, "rolling")
        weighted = history_rate(history, 30, "weighted_full_history")
        self.assertEqual(rolling, 10.0)
        self.assertGreater(weighted, 5.0)
        self.assertLess(weighted, 10.0)

    def test_tsb_and_adida_weighted_forecasts_are_finite_nonnegative(self):
        history = [0, 0, 2, 0, 0, 3, 0, 0] * 30
        tsb = tsb_weighted(history, 0.1, 0.1, 60)
        adida = adida_forecast(history, 0.2, 14, "weighted_full_history", 60)
        self.assertGreaterEqual(tsb, 0.0)
        self.assertGreaterEqual(adida, 0.0)
        self.assertTrue(tsb < float("inf"))
        self.assertTrue(adida < float("inf"))

    def test_adida_buckets_are_anchored_at_the_origin(self):
        history = [1.0] * 8 + [10.0] * 7
        forecast = adida_forecast(
            history,
            0.1,
            7,
            "weighted_full_history",
            30,
        )
        self.assertGreater(forecast, 5.0)

    def test_supply_features_use_only_information_known_at_origin(self):
        dates = [
            date(2026, 1, 1) + timedelta(days=index)
            for index in range(70)
        ]
        origin_index = 55
        origin = dates[origin_index]
        panel = {
            1: {
                "values": [1.0] * len(dates),
                "prices": [None] * len(dates),
                "stock": [10] * len(dates),
            }
        }
        purchase_lines = [
            {
                "purchase_id": 1,
                "product_id": 1,
                "created": datetime.combine(origin, time(12)),
                "ordered_units": 4,
            },
            {
                "purchase_id": 2,
                "product_id": 1,
                "created": datetime.combine(
                    origin + timedelta(days=1),
                    time(12),
                ),
                "ordered_units": 100,
            },
        ]
        received_at = datetime.combine(origin, time(13))
        future_receipt = datetime.combine(
            origin + timedelta(days=1),
            time(13),
        )
        receipt_units = {(1, 1): [(received_at, 2)], (2, 1): [(future_receipt, 100)]}
        receipts_by_day = {(1, origin): 2, (1, origin + timedelta(days=1)): 100}
        indexes = prepare_indexes(purchase_lines, receipt_units, receipts_by_day)
        spec = {
            "strategy": "rolling",
            "window_days": 30,
            "group": "supply",
        }

        features = phase2_features(
            dates,
            panel,
            1,
            origin_index,
            7,
            spec,
            indexes[0],
            indexes[1],
            indexes[2],
            {},
        )

        self.assertEqual(features["orders_units_configured"], 4)
        self.assertEqual(features["receipts_units_configured"], 2)
        self.assertEqual(features["pending_order_units_asof_origin"], 2)


if __name__ == "__main__":
    unittest.main()
