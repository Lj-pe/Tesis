import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


MIN_LAG_WEEKS = 4
RIDGE_ALPHA = 1.0


def feature_row(history, target_week_index):
    if len(history) < MIN_LAG_WEEKS:
        raise ValueError("Ridge requiere cuatro semanas previas para construir lags.")
    last_four = history[-MIN_LAG_WEEKS:]
    return [
        float(history[-1]),
        float(history[-2]),
        float(history[-4]),
        float(sum(last_four) / MIN_LAG_WEEKS),
        float(target_week_index),
    ]


def build_training_examples(panel, training_weeks):
    features = []
    targets = []
    for values in panel.values():
        if len(values) < training_weeks:
            raise ValueError("Cada serie debe cubrir el tramo de entrenamiento.")
        for target_index in range(MIN_LAG_WEEKS, training_weeks):
            features.append(feature_row(values[:target_index], target_index))
            targets.append(float(values[target_index]))
    if not features:
        raise ValueError("No hay observaciones suficientes para entrenar Ridge.")
    return np.asarray(features, dtype=float), np.asarray(targets, dtype=float)


def fit_ridge(panel, training_weeks, alpha=RIDGE_ALPHA):
    if training_weeks < MIN_LAG_WEEKS + 1:
        raise ValueError("Ridge requiere al menos cinco semanas de entrenamiento.")
    x_train, y_train = build_training_examples(panel, training_weeks)
    model = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
    model.fit(x_train, y_train)
    return model


def forecast_ridge(model, history, target_week_index, steps):
    if steps < 1:
        raise ValueError("steps debe ser positivo.")
    if len(history) < MIN_LAG_WEEKS:
        raise ValueError("Ridge requiere cuatro semanas de historia.")

    recursive_history = [float(value) for value in history]
    forecasts = []
    for offset in range(steps):
        week_index = target_week_index + offset
        features = np.asarray(
            [feature_row(recursive_history, week_index)],
            dtype=float,
        )
        prediction = float(model.predict(features)[0])
        prediction = max(0.0, prediction)
        forecasts.append(prediction)
        recursive_history.append(prediction)
    return forecasts
