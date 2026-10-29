import unittest
from datetime import date, timedelta

from evaluacion_produccion import (
    evaluate_production_policy,
    production_history_window,
    select_production_history,
    summarize_metrics,
)


class ProductionWindowTests(unittest.TestCase):
    def test_horizon_lookbacks_are_calendar_months_and_cut_at_origin(self):
        cases = (
            (7, date(2026, 4, 28)),
            (14, date(2026, 3, 28)),
            (30, date(2025, 12, 28)),
        )
        for horizon, first_date in cases:
            with self.subTest(horizon=horizon):
                start, last_week = production_history_window(
                    horizon,
                    "2026-06-28",
                    12,
                )
                self.assertEqual(start, first_date)
                self.assertEqual(last_week, date(2026, 6, 22))

    def test_lookback_uses_exact_cutoff_when_origin_falls_between_week_starts(self):
        cases = (
            (7, "2026-07-12", date(2026, 5, 12), date(2026, 7, 6)),
            (14, "2026-07-12", date(2026, 4, 12), date(2026, 7, 6)),
            (7, "2026-03-01", date(2026, 1, 1), date(2026, 2, 23)),
        )
        for horizon, origin, first_date, last_week_start in cases:
            with self.subTest(horizon=horizon, origin=origin):
                self.assertEqual(
                    production_history_window(horizon, origin, 24),
                    (first_date, last_week_start),
                )

    def test_exact_month_subtraction_clamps_at_the_target_month_end(self):
        self.assertEqual(
            production_history_window(30, "2026-08-30", 24),
            (date(2026, 2, 28), date(2026, 8, 24)),
        )

    def test_selects_only_available_complete_weeks_inside_window(self):
        first_week = date(2026, 4, 6)
        weeks = [first_week + timedelta(days=7 * index) for index in range(24)]
        values = list(range(1, 25))
        history = select_production_history(
            values,
            weeks,
            7,
            "2026-06-28",
            12,
        )
        self.assertEqual(history, [5, 6, 7, 8, 9, 10, 11, 12])

    def test_all_horizons_use_exact_backend_lookback_without_future_weeks(self):
        first_week = date(2026, 4, 6)
        weeks = [first_week + timedelta(days=7 * index) for index in range(25)]
        values = list(range(1, 26))
        expectations = (
            (7, "2026-07-20", 9),
            (14, "2026-06-22", 13),
            (30, "2026-04-06", 24),
        )
        for horizon, first_start, expected_length in expectations:
            with self.subTest(horizon=horizon):
                history = select_production_history(
                    values,
                    weeks,
                    horizon,
                    "2026-09-20",
                    24,
                )
                self.assertEqual(len(history), expected_length)
                self.assertEqual(history[0], values[weeks.index(date.fromisoformat(first_start))])
                self.assertNotIn(values[-1], history)

    def test_future_observations_do_not_change_training_history_or_forecast(self):
        first_week = date(2026, 4, 6)
        week_starts = [first_week + timedelta(days=7 * index) for index in range(25)]
        available = [1, 0, 2, 0, 3, 0, 4, 0, 1, 0, 2, 0, 3, 0, 4, 0, 1, 0, 2, 0, 3, 0, 4, 0]
        with_future = [*available, 10000]
        training = select_production_history(
            available, week_starts, 7, "2026-09-20", len(available)
        )
        training_with_future = select_production_history(
            with_future, week_starts, 7, "2026-09-20", len(available)
        )
        self.assertEqual(training_with_future, training)
        self.assertNotIn(10000, training_with_future)


class ProductionEvaluationTests(unittest.TestCase):
    def test_evaluates_all_product_periods_with_both_methods_and_metrics(self):
        week_starts = [date(2026, 4, 6) + timedelta(days=7 * index) for index in range(24)]
        origins = {}
        for horizon in (7, 14, 30):
            origins[str(horizon)] = [{
                "origin_date": "2026-06-28",
                "training_weeks": 12,
                "target_start_inclusive": "2026-06-29",
                "target_end_exclusive": (
                    date(2026, 6, 29) + timedelta(days=horizon)
                ).isoformat(),
            }]
        data = {
            "plan": {"temporal_design": {"origins_by_horizon": origins}},
            "panel": {1: [1] * 24},
            "product_ids": [1],
            "daily_units": {},
        }

        records = evaluate_production_policy(data)
        metrics = summarize_metrics(records)

        self.assertEqual(len(records), 3)
        for index, horizon in enumerate(("7", "14", "30")):
            self.assertEqual(metrics[horizon]["product_count"], 1)
            self.assertEqual(metrics[horizon]["origin_count"], 1)
            self.assertEqual(metrics[horizon]["product_period_count"], 1)
            self.assertIn("mae", metrics[horizon]["methods"]["promedio_movil_4"])
            self.assertIn("rmse", metrics[horizon]["methods"]["promedio_movil_4"])
            self.assertEqual(records[index]["selected_method"], "croston_sba")
            self.assertNotEqual(
                records[index]["production_forecast"],
                records[index]["moving_average_4_forecast"],
            )
            expected_candidate = (
                records[index]["moving_average_4_forecast"]
                if horizon in ("7", "14")
                else records[index]["production_forecast"]
            )
            self.assertEqual(records[index]["candidate_forecast"], expected_candidate)
            self.assertEqual(
                records[index]["candidate_method"],
                "promedio_movil_4" if horizon in ("7", "14") else "croston_sba",
            )
            self.assertEqual(
                records[index]["candidate_absolute_error"],
                abs(records[index]["actual_units"] - expected_candidate),
            )

        future_changed_data = {
            **data,
            "panel": {1: [1] * 12 + [10000] * 12},
        }
        future_changed_records = evaluate_production_policy(future_changed_data)
        self.assertEqual(
            [
                (
                    row["horizon_days"],
                    row["selected_method"],
                    row["production_forecast"],
                    row["moving_average_4_forecast"],
                    row["candidate_forecast"],
                )
                for row in future_changed_records
            ],
            [
                (
                    row["horizon_days"],
                    row["selected_method"],
                    row["production_forecast"],
                    row["moving_average_4_forecast"],
                    row["candidate_forecast"],
                )
                for row in records
            ],
        )


if __name__ == "__main__":
    unittest.main()
