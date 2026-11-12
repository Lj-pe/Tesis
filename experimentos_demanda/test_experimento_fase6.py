import unittest
from datetime import date, timedelta

from experimento_fase6 import (
    candidate_specs,
    candidate_id,
    full_history_origins,
    forecast_one,
)


class PhaseSixForecastTests(unittest.TestCase):
    def setUp(self):
        self.dates = [
            date(2026, 1, 1) + timedelta(days=index)
            for index in range(120)
        ]
        self.panel = {
            1: {"values": [0.0] * 120},
            2: {"values": [1.0] * 120},
        }
        self.panel[1]["values"][70] = 2.0
        self.panel[1]["values"][90] = 2.0
        self.categories = {1: 1, 2: 1}
        self.origin_index = 99

    def test_candidate_grid_covers_short_long_and_specialist_strategies(self):
        specs = [
            spec for horizon in (7, 14, 30)
            for spec in candidate_specs(horizon)
        ]
        windows = {spec["window_days"] for spec in specs}
        self.assertTrue({14, 28, 30, 45, 56, 60, 90, 120, 150, 180, 210} <= windows)
        self.assertTrue(any(spec["kind"] == "hurdle" for spec in specs))
        self.assertTrue(any(spec["kind"] == "weekday" for spec in specs))
        self.assertTrue(any(spec["kind"] == "adaptive" for spec in specs))
        self.assertTrue(all(
            len({candidate_id(spec) for spec in candidate_specs(horizon)})
            == len(candidate_specs(horizon))
            for horizon in (7, 14, 30)
        ))
        self.assertIn(
            210,
            {spec["window_days"] for spec in candidate_specs(30)},
        )
        self.assertNotIn(
            210,
            {spec["window_days"] for spec in candidate_specs(7)},
        )

    def test_development_origins_require_full_calendar_history(self):
        origins = [
            date(2026, 1, 1) + timedelta(days=index)
            for index in range(4)
        ]
        self.assertEqual(
            full_history_origins(origins, origins[0], 3),
            origins[2:],
        )

    def test_forecasts_do_not_use_values_after_origin(self):
        spec = {
            "model": "category_hurdle",
            "kind": "hurdle",
            "window_days": 56,
            "pool_days": 14,
        }
        before = forecast_one(
            spec, 1, self.origin_index, 7, self.dates, self.panel,
            self.categories, {},
        )
        self.panel[1]["values"][100:] = [1000.0] * 20
        self.panel[2]["values"][100:] = [500.0] * 20
        after = forecast_one(
            spec, 1, self.origin_index, 7, self.dates, self.panel,
            self.categories, {},
        )
        self.assertEqual(before, after)

    def test_weekday_profile_repeats_known_weekday_pattern(self):
        for index, day in enumerate(self.dates):
            self.panel[1]["values"][index] = (
                4.0 if day.weekday() == 0 else 0.0
            )
        forecast = forecast_one(
            {
                "model": "weekday_profile",
                "kind": "weekday",
                "window_days": 56,
                "pool_days": 0,
            },
            1,
            self.origin_index,
            7,
            self.dates,
            self.panel,
            self.categories,
            {},
        )
        self.assertAlmostEqual(forecast, 4.0)

    def test_category_hurdle_is_finite_nonnegative_and_uses_peer_prior(self):
        forecast = forecast_one(
            {
                "model": "category_hurdle",
                "kind": "hurdle",
                "window_days": 56,
                "pool_days": 28,
            },
            1,
            self.origin_index,
            14,
            self.dates,
            self.panel,
            self.categories,
            {},
        )
        self.assertGreater(forecast, 0.0)
        self.assertLess(forecast, 14.0)

    def test_adaptive_blend_returns_nonnegative_horizon_total(self):
        forecast = forecast_one(
            {
                "model": "adaptive_level_blend",
                "kind": "adaptive",
                "window_days": 90,
                "short_window_days": 28,
            },
            2,
            self.origin_index,
            30,
            self.dates,
            self.panel,
            self.categories,
            {},
        )
        self.assertGreaterEqual(forecast, 0.0)
        self.assertAlmostEqual(forecast, 30.0)


if __name__ == "__main__":
    unittest.main()
