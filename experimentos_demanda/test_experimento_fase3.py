import unittest
from datetime import date, timedelta

from experimento_fase3 import (
    FREQUENT_MAX_MEAN_INTERVAL_DAYS,
    FREQUENT_MIN_SALE_DAYS,
    LOW_MAX_UNITS_PER_56_DAYS,
    SEGMENT_WINDOW_DAYS,
    candidate_specs,
    classify_product_history,
    segment_training_examples,
    segment_at_origin,
)


class PhaseThreeSegmentationTests(unittest.TestCase):
    def test_frequency_volume_and_intervals_assign_expected_segments(self):
        frequent = [0.0] * SEGMENT_WINDOW_DAYS
        for index in range(0, 56, 7):
            frequent[index] = 2.0
        result = classify_product_history(frequent)
        self.assertEqual(result["segment"], "frequent")
        self.assertEqual(result["sale_days"], FREQUENT_MIN_SALE_DAYS)
        self.assertEqual(result["units"], 16)
        self.assertEqual(
            result["mean_inter_sale_interval_days"],
            FREQUENT_MAX_MEAN_INTERVAL_DAYS,
        )

        low = [0.0] * SEGMENT_WINDOW_DAYS
        low[10] = LOW_MAX_UNITS_PER_56_DAYS
        self.assertEqual(classify_product_history(low)["segment"], "low")

        intermittent = [0.0] * SEGMENT_WINDOW_DAYS
        intermittent[2] = 5
        intermittent[22] = 5
        intermittent[42] = 5
        self.assertEqual(classify_product_history(intermittent)["segment"], "intermittent")

    def test_missing_or_short_history_is_not_classified_as_zero_demand(self):
        result = classify_product_history([None] * SEGMENT_WINDOW_DAYS)
        self.assertEqual(result["segment"], "unknown")
        self.assertIsNone(result["units"])
        self.assertEqual(classify_product_history([])["segment"], "unknown")

    def test_segmentation_at_origin_ignores_future_values(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(70)]
        origin = dates[55]
        values = [0.0] * len(dates)
        for index in range(0, 56, 7):
            values[index] = 2.0
        values[56:] = [100.0] * 14
        panel = {1: {"values": values}}

        before = segment_at_origin(dates, panel, 1, origin)
        panel[1]["values"][56:] = [0.0] * 14
        after = segment_at_origin(dates, panel, 1, origin)

        self.assertEqual(before, after)
        self.assertEqual(before["segment"], "frequent")

    def test_ridge_training_examples_are_restricted_to_historical_segment(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(130)]
        frequent_values = [0.0] * len(dates)
        for index in range(0, len(dates), 7):
            frequent_values[index] = 2.0
        low_values = [0.0] * len(dates)
        low_values[10] = 1.0
        low_values[68] = 1.0
        panel = {
            1: {
                "values": frequent_values,
                "prices": [None] * len(dates),
                "stock": [10] * len(dates),
            },
            2: {
                "values": low_values,
                "prices": [None] * len(dates),
                "stock": [10] * len(dates),
            },
        }
        spec = {
            "strategy": "rolling",
            "window_days": 60,
            "group": "history",
        }
        features, targets = segment_training_examples(
            "frequent",
            spec,
            7,
            100,
            dates,
            panel,
            [1, 2],
            [dates[60], dates[70], dates[80]],
            ({}, {}, {}),
            {},
        )

        self.assertTrue(targets)
        self.assertTrue(all("product_id=1" in row for row in features))
        self.assertFalse(any("product_id=2" in row for row in features))

    def test_specialized_candidate_families_follow_segment_rules(self):
        frequent = candidate_specs(7, "frequent")
        intermittent = candidate_specs(7, "intermittent")
        low = candidate_specs(7, "low")
        self.assertTrue(all(
            spec["kind"] in {"moving", "ridge", "trend"}
            for spec in frequent
        ))
        self.assertTrue(all(
            spec["kind"] in {"croston", "tsb", "adida"}
            for spec in intermittent
        ))
        self.assertEqual(
            {spec["kind"] for spec in low},
            {"zero", "moving"},
        )


if __name__ == "__main__":
    unittest.main()
