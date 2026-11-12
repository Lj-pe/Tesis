const ALLOWED_HORIZONS = [7, 14, 30];

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatForecastDate(date) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date).replace(".", "");
}

export function getForecastDateRange(horizonDays, now = new Date()) {
  if (!ALLOWED_HORIZONS.includes(horizonDays)) {
    throw new RangeError("Horizonte permitido: 7, 14 o 30 días.");
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + horizonDays - 1);

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
    label: `${formatForecastDate(start)} – ${formatForecastDate(end)}`,
  };
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function prepareForecastChartData(
  weeklyHistory,
  horizonDays,
  forecastTotal,
  historyWindow,
  dailyHistory = []
) {
  if (!ALLOWED_HORIZONS.includes(horizonDays)) {
    throw new RangeError("Horizonte permitido: 7, 14 o 30 días.");
  }

  const history = horizonDays === 30
    ? aggregateDailySalesByPeriod(dailyHistory, 6, historyWindow)
    : weeklyHistory.map((item) => ({
        key: item.week_start,
        periodStart: item.week_start,
        periodEnd: addDays(item.week_start, 6),
        value: Number(item.demand_units),
      }));

  return { history, forecast: forecastTotal };
}

function aggregateDailySalesByPeriod(dailyHistory, periodCount, historyWindow) {
  if (!historyWindow?.firstDate || !historyWindow?.lastDate) {
    return [];
  }

  const boundaries = Array.from({ length: periodCount + 1 }, (_, index) =>
    subtractCalendarMonths(historyWindow.lastDate, periodCount - index)
  );

  return boundaries.slice(0, -1).flatMap((periodStart, index) => {
    const periodEnd = index === periodCount - 1
      ? historyWindow.lastDate
      : addDays(boundaries[index + 1], -1);
    const salesInPeriod = dailyHistory.filter(({ sale_date }) =>
      sale_date >= periodStart && sale_date <= periodEnd
    );
    const coverageIsExplicit = historyWindow?.require_complete_periods === true
      || dailyHistory.some((row) => row.observability_checked === true);
    const expectedDays = Math.round(
      (new Date(`${periodEnd}T00:00:00Z`) - new Date(`${periodStart}T00:00:00Z`))
      / 86400000
    ) + 1;
    if (coverageIsExplicit && salesInPeriod.length !== expectedDays) {
      return [];
    }

    return [{
      key: periodStart,
      periodStart,
      periodEnd,
      value: salesInPeriod.reduce(
        (total, sale) => total + Number(sale.demand_units),
        0
      ),
    }];
  });
}

function subtractCalendarMonths(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0
  )).getUTCDate();

  return formatUtcDate(new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(day, lastDay)
  )));
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getHistoricalBarHeight(value, scaleMax, chartHeight) {
  if (value <= 0) {
    return 0;
  }

  return Math.max(2, (value / scaleMax) * chartHeight);
}

export function getZeroForecastMarker(forecast, centerX, baselineY) {
  return forecast === 0
    ? {
        cx: centerX,
        cy: baselineY,
        ariaLabel: "Pronóstico: 0 unidades",
      }
    : null;
}
