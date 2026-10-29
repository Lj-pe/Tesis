import unittest
from datetime import date

from planificar_evaluacion import create_plan
from validar_series_python import expected_weeks


class TemporalPlanTests(unittest.TestCase):
    def test_week_definitions_are_complete_iso_weeks(self):
        weeks = expected_weeks()
        self.assertEqual(len(weeks), 24)
        self.assertEqual(weeks[0]["semana_iso"], "2026-W15")
        self.assertEqual(weeks[-1]["semana_iso"], "2026-W38")
        for week in weeks:
            monday = date.fromisoformat(week["inicio_semana"])
            sunday = date.fromisoformat(week["fin_semana"])
            self.assertEqual(monday.weekday(), 0)
            self.assertEqual((sunday - monday).days, 6)

    def test_origin_windows_fit_available_complete_weeks(self):
        plan = create_plan_from_synthetic_series()
        self.assertEqual(plan["origin_counts"], {"7": 12, "14": 11, "30": 8})
        expected_ranges = {
            "7": ("2026-06-28", "2026-09-13"),
            "14": ("2026-06-28", "2026-09-06"),
            "30": ("2026-06-28", "2026-08-16"),
        }
        for horizon, origins in plan["temporal_design"]["origins_by_horizon"].items():
            self.assertEqual(
                (origins[0]["origin_date"], origins[-1]["origin_date"]),
                expected_ranges[horizon],
            )
            for origin in origins:
                sunday = date.fromisoformat(origin["origin_date"])
                start = date.fromisoformat(origin["target_start_inclusive"])
                end = date.fromisoformat(origin["target_end_exclusive"])
                self.assertEqual(sunday.weekday(), 6)
                self.assertEqual((start - sunday).days, 1)
                self.assertEqual((end - start).days, int(horizon))
                self.assertLessEqual(end.isoformat(), "2026-09-21")
                self.assertEqual(origin["training_weeks"], 12 + (
                    date.fromisoformat(origin["target_start_inclusive"])
                    - date(2026, 6, 29)
                ).days // 7)
                self.assertEqual(origin["training_first_week"], "2026-W15")
                self.assertGreaterEqual(origin["training_weeks"], 12)
        self.assertEqual(
            plan["temporal_design"]["initial_training_weeks"]["last"],
            "2026-W26",
        )

    def test_30_day_window_is_not_mistaken_for_full_week_observations(self):
        plan = create_plan_from_synthetic_series()
        horizon = plan["horizon_30_days"]
        self.assertEqual(horizon["complete_weeks"], 4)
        self.assertEqual(horizon["partial_week_days"], 2)
        self.assertIn("uniforme", horizon["weekly_training_target"])
        self.assertIn("no prueba", plan["coverage_warning"])


def create_plan_from_synthetic_series():
    from tempfile import TemporaryDirectory
    from pathlib import Path
    import csv

    from validar_series_python import SERIES_COLUMNS

    temporary_directory = TemporaryDirectory()
    root = Path(temporary_directory.name)
    try:
        with (root / "series_semanales.csv").open(
            "w", encoding="utf-8", newline=""
        ) as stream:
            writer = csv.DictWriter(stream, fieldnames=SERIES_COLUMNS)
            writer.writeheader()
            for product_id in range(1, 56):
                for week in expected_weeks():
                    writer.writerow(
                        {
                            "producto_id": product_id,
                            "semana_iso": week["semana_iso"],
                            "inicio_semana": week["inicio_semana"],
                            "fin_semana": week["fin_semana"],
                            "unidades": 0,
                        }
                    )
        return create_plan(root)
    finally:
        temporary_directory.cleanup()


if __name__ == "__main__":
    unittest.main()
