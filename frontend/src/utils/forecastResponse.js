export function hasValidForecastHistoryWindow(response, horizonDays) {
  if (horizonDays !== 30) {
    return true;
  }

  const historyWindow = response?.history_window;
  if (historyWindow?.firstDate && historyWindow?.lastDate) {
    return true;
  }

  return historyWindow === null
    && Array.isArray(response.history)
    && Array.isArray(response.daily_history)
    && response.last_complete_week === null
    && Number(response.prediction?.demand) === 0
    && response.prediction?.training_weeks === 0
    && response.prediction?.positive_training_weeks === 0
    && response.history.length === 0
    && response.daily_history.length === 0;
}
