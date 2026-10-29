from dataclasses import dataclass
from math import ceil


CROSTON_ALPHA = 0.1
CROSTON_MINIMUM_POSITIVE_WEEKS = 8


class CrostonInsufficientHistory(ValueError):
    """Raised when Croston-SBA lacks its required positive-demand history."""


@dataclass(frozen=True)
class CrostonState:
    demand_size: float
    interval: float
    positive_weeks: int
    forecast_per_week: float


def forecast_zero(history, steps):
    _validate_forecast_inputs(history, steps)
    return [0.0] * steps


def forecast_last_week(history, steps):
    _validate_forecast_inputs(history, steps)
    value = float(history[-1]) if history else 0.0
    return [value] * steps


def forecast_moving_average_4(history, steps):
    _validate_forecast_inputs(history, steps)
    value = sum(history[-4:]) / min(len(history), 4) if history else 0.0
    return [float(value)] * steps


def croston_sba_state(
    history,
    alpha=CROSTON_ALPHA,
    minimum_positive_weeks=CROSTON_MINIMUM_POSITIVE_WEEKS,
):
    if not 0 < alpha <= 1:
        raise ValueError("alpha debe estar en (0, 1].")
    if minimum_positive_weeks < 1:
        raise ValueError("minimum_positive_weeks debe ser positivo.")
    if any(value < 0 for value in history):
        raise ValueError("La historia no puede contener demanda negativa.")

    events = [(index, float(value)) for index, value in enumerate(history) if value > 0]
    if len(events) < minimum_positive_weeks:
        raise CrostonInsufficientHistory(
            f"Croston-SBA requiere {minimum_positive_weeks} semanas positivas; "
            f"historial disponible={len(events)}."
        )

    first_index, first_size = events[0]
    demand_size = first_size
    interval = float(first_index + 1)
    previous_index = first_index
    for index, size in events[1:]:
        gap = float(index - previous_index)
        demand_size += alpha * (size - demand_size)
        interval += alpha * (gap - interval)
        previous_index = index

    forecast = (1 - alpha / 2) * demand_size / interval
    return CrostonState(
        demand_size=demand_size,
        interval=interval,
        positive_weeks=len(events),
        forecast_per_week=max(0.0, forecast),
    )


def forecast_croston_sba(
    history,
    steps,
    alpha=CROSTON_ALPHA,
    minimum_positive_weeks=CROSTON_MINIMUM_POSITIVE_WEEKS,
):
    _validate_forecast_inputs(history, steps)
    state = croston_sba_state(history, alpha, minimum_positive_weeks)
    return [state.forecast_per_week] * steps


def forecast_croston_sba_with_moving_average_fallback(history, horizon_days):
    positive_weeks = sum(value > 0 for value in history)
    if positive_weeks >= CROSTON_MINIMUM_POSITIVE_WEEKS:
        method = "croston_sba"
        weekly_forecasts = forecast_croston_sba(
            history,
            ceil(horizon_days / 7),
            alpha=CROSTON_ALPHA,
            minimum_positive_weeks=CROSTON_MINIMUM_POSITIVE_WEEKS,
        )
    else:
        method = "promedio_movil_4"
        weekly_forecasts = forecast_moving_average_4(
            history,
            ceil(horizon_days / 7),
        )
    return {
        "selected_method": method,
        "positive_training_weeks": positive_weeks,
        "forecast": forecast_for_horizon(weekly_forecasts, horizon_days),
    }


def forecast_for_horizon(weekly_forecasts, horizon_days):
    if horizon_days not in (7, 14, 30):
        raise ValueError("Horizonte permitido: 7, 14 o 30 días.")
    if any(value < 0 for value in weekly_forecasts):
        raise ValueError("No se permiten pronósticos semanales negativos.")

    week_count = ceil(horizon_days / 7)
    if len(weekly_forecasts) < week_count:
        raise ValueError("No hay suficientes semanas pronosticadas para el horizonte.")

    complete_weeks, remainder_days = divmod(horizon_days, 7)
    total = sum(weekly_forecasts[:complete_weeks])
    if remainder_days:
        total += weekly_forecasts[complete_weeks] * remainder_days / 7
    return float(max(0.0, total))


def _validate_forecast_inputs(history, steps):
    if steps < 1:
        raise ValueError("steps debe ser positivo.")
    if any(value < 0 for value in history):
        raise ValueError("La historia no puede contener demanda negativa.")
