import unittest
from datetime import date, timedelta

from experimento_fase6 import forecast_one
from experimento_fase6_sin_categoria import candidate_specs_without_pooling


class NoCategoryPoolingTests(unittest.TestCase):
    def setUp(self):
        self.dates = [
            date(2026, 1, 1) + timedelta(days=index)
            for index in range(120)
        ]
        self.panel = {
            1: {"values": [0.0] * 120},
            2: {"values": [0.0] * 120},
        }
        self.panel[1]["values"][50] = 3.0
        self.panel[1]["values"][85] = 4.0
        self.panel[2]["values"][80] = 100.0
        self.categories = {1: 1, 2: 1}
        self.origin_index = 99

    def test_candidate_grid_excludes_all_positive_category_pooling(self):
        for horizon in (7, 14, 30):
            specs = candidate_specs_without_pooling(horizon)
            self.assertTrue(specs)
            self.assertFalse(any(spec["kind"] == "hurdle" for spec in specs))
            self.assertFalse(any(
                spec["kind"] == "weekday" and spec.get("pool_days", 0) > 0
                for spec in specs
            ))
            self.assertEqual(
                len({spec["model"] + str(spec.get("window_days", 0))
                     + str(spec.get("pool_days", 0)) for spec in specs}),
                len(specs),
            )

    def test_unpooled_hurdle_forecast_is_independent_of_category_membership(self):
        spec = {
            "model": "category_hurdle",
            "kind": "hurdle",
            "window_days": 56,
            "pool_days": 0,
        }
        shared = forecast_one(
            spec, 1, self.origin_index, 14, self.dates, self.panel,
            self.categories, {},
        )
        separate = forecast_one(
            spec, 1, self.origin_index, 14, self.dates, self.panel,
            {1: 1, 2: 2}, {},
        )
        self.assertEqual(shared, separate)

    def test_unpooled_weekday_forecast_is_independent_of_category_membership(self):
        for index, day in enumerate(self.dates):
            self.panel[1]["values"][index] = 4.0 if day.weekday() == 0 else 0.0
        spec = {
            "model": "weekday_profile",
            "kind": "weekday",
            "window_days": 56,
            "pool_days": 0,
        }
        shared = forecast_one(
            spec, 1, self.origin_index, 14, self.dates, self.panel,
            self.categories, {},
        )
        separate = forecast_one(
            spec, 1, self.origin_index, 14, self.dates, self.panel,
            {1: 1, 2: 2}, {},
        )
        self.assertEqual(shared, separate)


if __name__ == "__main__":
    unittest.main()
