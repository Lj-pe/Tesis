import { useEffect, useMemo, useState } from "react";
import apiClient from "../api/client";
import {
  getForecastDateRange,
  getHistoricalBarHeight,
  getZeroForecastMarker,
  prepareForecastChartData,
} from "../utils/forecastChart";
import { hasValidForecastHistoryWindow } from "../utils/forecastResponse";

const PERIODS = [
  { value: 7, label: "7 días" },
  { value: 14, label: "14 días" },
  { value: 30, label: "30 días" },
];

const DEMAND_FORMATTER = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 1,
});
const WEEK_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const PERIOD_DATE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatearSemana(fecha) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return WEEK_FORMATTER.format(new Date(Date.UTC(anio, mes - 1, dia))).replace(".", "");
}

function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return FULL_DATE_FORMATTER
    .format(new Date(Date.UTC(anio, mes - 1, dia)))
    .replace(".", "");
}

function SalesChart({ history, forecast, period, forecastDateRange }) {
  const [hoveredBar, setHoveredBar] = useState(null);
  const maxValue = Math.max(
    0,
    ...history.map((item) => item.value),
    forecast
  );
  const tickStep = Math.max(1, Math.ceil(maxValue / 4));
  const scaleMax = Math.max(tickStep, Math.ceil(maxValue / tickStep) * tickStep);
  const chartTop = 18;
  const chartBottom = 143;
  const chartHeight = chartBottom - chartTop;
  const chartWidth = 760;
  const plotLeft = 52;
  const slotWidth = (chartWidth - plotLeft - 16) / (history.length + 1);
  const barWidth = Math.min(48, slotWidth * 0.62);
  const positions = history.map((_, index) =>
    plotLeft + slotWidth * index + (slotWidth - barWidth) / 2
  );
  const forecastX = plotLeft
    + slotWidth * history.length
    + (slotWidth - barWidth) / 2;
  const zeroForecastMarker = getZeroForecastMarker(
    forecast,
    forecastX + barWidth / 2,
    chartBottom
  );
  const ticks = Array.from(
    { length: scaleMax / tickStep + 1 },
    (_, index) => index * tickStep
  );
  const barY = (value) => chartBottom - (value / scaleMax) * chartHeight;
  const barHeight = (value) => (value / scaleMax) * chartHeight;
  const historicalBarHeight = (value) =>
    getHistoricalBarHeight(value, scaleMax, chartHeight);
  const historicalBarY = (value) => chartBottom - historicalBarHeight(value);

  const showHistoryTooltip = (x, y, periodStart, periodEnd, value) => {
    setHoveredBar({
      x,
      y,
      title: `${formatearFecha(periodStart)} – ${formatearFecha(periodEnd)}`,
      detail: `${DEMAND_FORMATTER.format(value)} unidades vendidas`,
    });
  };
  const showForecastTooltip = () => {
    setHoveredBar({
      x: forecastX,
      y: barY(forecast),
      title: `Pronóstico ${forecastDateRange.label}`,
      detail: `${DEMAND_FORMATTER.format(forecast)} unidades`,
    });
  };
  const hideTooltip = () => setHoveredBar(null);
  const tooltipWidth = 220;
  const tooltipHeight = 44;
  const tooltipX = hoveredBar
    ? Math.max(4, Math.min(
      hoveredBar.x + barWidth / 2 - tooltipWidth / 2,
      chartWidth - tooltipWidth - 4
    ))
    : 0;
  const tooltipY = hoveredBar
    ? Math.max(4, hoveredBar.y - tooltipHeight - 8)
    : 0;

  return (
    <div className="prediction-chart">
      <svg
        className="prediction-chart-svg"
        viewBox={`0 0 ${chartWidth} 202`}
        role="img"
        aria-label={`Ventas históricas ${
          period === 30 ? "mensuales" : "semanales"
        } y pronóstico total para ${forecastDateRange.label}`}
      >
        <text className="chart-axis-title" transform="translate(15 112) rotate(-90)">
          Unidades
        </text>
        {ticks.map((tick) => {
          const y = chartBottom - (tick / scaleMax) * chartHeight;
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1="48" x2={chartWidth - 12} y1={y} y2={y} />
              <text className="chart-tick-label" x="38" y={y + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}
        {history.map(({ value, periodStart, periodEnd, key }, index) => {
          const x = positions[index];
          const label = period === 30
            ? `${PERIOD_DATE_FORMATTER.format(new Date(`${periodStart}T00:00:00Z`)).replace(".", "")}–${PERIOD_DATE_FORMATTER.format(new Date(`${periodEnd}T00:00:00Z`)).replace(".", "")}`
            : formatearSemana(periodStart);
          const periodLabel = `${formatearFecha(periodStart)} – ${formatearFecha(periodEnd)}`;
          return (
            <g key={key}>
              <rect
                className="chart-history-bar"
                x={x}
                y={historicalBarY(value)}
                width={barWidth}
                height={historicalBarHeight(value)}
                rx="2"
                tabIndex="0"
                aria-label={`${periodLabel}: ${DEMAND_FORMATTER.format(value)} unidades vendidas`}
                onPointerEnter={() => showHistoryTooltip(x, barY(value), periodStart, periodEnd, value)}
                onPointerLeave={hideTooltip}
                onFocus={() => showHistoryTooltip(x, barY(value), periodStart, periodEnd, value)}
                onBlur={hideTooltip}
              />
              {value === 0 && (
                <rect
                  x={x}
                  y={chartBottom - 12}
                  width={slotWidth}
                  height="12"
                  fill="transparent"
                  aria-label={`${periodLabel}: 0 unidades vendidas`}
                  tabIndex="0"
                  onPointerEnter={() => showHistoryTooltip(x, chartBottom, periodStart, periodEnd, value)}
                  onPointerLeave={hideTooltip}
                  onFocus={() => showHistoryTooltip(x, chartBottom, periodStart, periodEnd, value)}
                  onBlur={hideTooltip}
                />
              )}
              <text className="chart-x-label" x={x + barWidth / 2} y="164" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
        <rect
          className="chart-forecast-bar"
          x={forecastX}
          y={barY(forecast)}
          width={barWidth}
          height={barHeight(forecast)}
          rx="2"
          tabIndex="0"
          aria-label={`Pronóstico de ${DEMAND_FORMATTER.format(forecast)} unidades para ${period} días`}
          onPointerEnter={showForecastTooltip}
          onPointerLeave={hideTooltip}
          onFocus={showForecastTooltip}
          onBlur={hideTooltip}
        />
        {zeroForecastMarker && (
          <circle
            className="chart-forecast-zero-marker"
            cx={zeroForecastMarker.cx}
            cy={zeroForecastMarker.cy}
            r="5"
            role="img"
            aria-label={zeroForecastMarker.ariaLabel}
            tabIndex="0"
            onPointerEnter={showForecastTooltip}
            onPointerLeave={hideTooltip}
            onFocus={showForecastTooltip}
            onBlur={hideTooltip}
          />
        )}
        <text className="chart-x-label" x={forecastX + barWidth / 2} y="164" textAnchor="middle">
          <tspan x={forecastX + barWidth / 2}>Pronóstico</tspan>
          <tspan x={forecastX + barWidth / 2} dy="15">{period} días</tspan>
        </text>
        {hoveredBar && (
          <g className="chart-tooltip" aria-hidden="true" pointerEvents="none">
            <rect
              className="chart-tooltip-background"
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="5"
            />
            <text className="chart-tooltip-text" x={tooltipX + 10} y={tooltipY + 17}>
              {hoveredBar.title}
            </text>
            <text className="chart-tooltip-text" x={tooltipX + 10} y={tooltipY + 34}>
              {hoveredBar.detail}
            </text>
          </g>
        )}
      </svg>
      <div className="prediction-chart-legend" aria-hidden="true">
        <span>
          <i className="legend-dot legend-history" />
          {period === 30
            ? "Ventas históricas (periodo mensual)"
            : "Ventas históricas (semana completa)"}
        </span>
        <span><i className="legend-dot legend-forecast" />Demanda total pronosticada</span>
      </div>
    </div>
  );
}

function Predicciones() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [forecastData, setForecastData] = useState(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [period, setPeriod] = useState(7);

  useEffect(() => {
    let mounted = true;

    const cargarDatos = async () => {
      try {
        const catalog = await apiClient.get("/predicciones/demanda/catalogo");
        if (!Array.isArray(catalog?.categories) || !Array.isArray(catalog?.products)) {
          throw new Error("La API devolvió datos con un formato no válido.");
        }

        if (!mounted) return;

        setCategories(catalog.categories);
        setProducts(catalog.products);
      } catch (error) {
        if (mounted) {
          setLoadError(error.message || "No se pudieron cargar los datos de predicción.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    cargarDatos();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!productId) return undefined;

    let mounted = true;

    const cargarPronostico = async () => {
      try {
        const result = await apiClient.get(
          `/predicciones/demanda/productos/${encodeURIComponent(productId)}?horizonte_dias=${period}`
        );
        if (
          !result?.prediction
          || !Number.isFinite(Number(result.prediction.demand))
          || !Array.isArray(result.history)
          || !Array.isArray(result.daily_history)
          || !hasValidForecastHistoryWindow(result, period)
          || (result.risk !== null && typeof result.risk !== "boolean")
          || (
            result.suggested_replenishment !== null
            && !Number.isFinite(Number(result.suggested_replenishment))
          )
        ) {
          throw new Error("La API devolvió una predicción con formato no válido.");
        }
        if (mounted) setForecastData(result);
      } catch (error) {
        if (mounted) {
          setForecastError(error.message || "No se pudo calcular la predicción.");
        }
      } finally {
        if (mounted) setIsForecastLoading(false);
      }
    };

    cargarPronostico();
    return () => {
      mounted = false;
    };
  }, [period, productId]);

  const filteredProducts = useMemo(
    () => products.filter(
      (product) => category
        && String(product.categoria_id) === category
        && product.estado === "activo"
    ),
    [category, products]
  );
  const selectedProduct = products.find(
    (product) => String(product.id_producto) === productId
  );
  const selectedCategory = categories.find(
    (item) => String(item.id_categoria) === String(selectedProduct?.categoria_id)
  );
  const prediction = forecastData?.prediction;
  const forecastStartDate = forecastData?.target_range?.firstDate;
  const forecastDateRange = getForecastDateRange(
    period,
    forecastStartDate
      ? (() => {
          const [year, month, day] = forecastStartDate.split("-").map(Number);
          return new Date(year, month - 1, day);
        })()
      : new Date()
  );
  const matchingProducts = filteredProducts.filter((product) =>
    String(product.nombre || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const selectedInventory = forecastData?.inventory;
  const selectedChartData = useMemo(
    () => prepareForecastChartData(
      forecastData?.history || [],
      period,
      Number(prediction?.demand ?? 0),
      forecastData?.history_window,
      forecastData?.daily_history || []
    ),
    [forecastData, period, prediction?.demand]
  );
  const selectedHistory = selectedChartData.history;
  const selectedHistoryRange = useMemo(() => {
    const history = selectedHistory;
    if (history.length === 0) return undefined;
    return {
      first: history[0].periodStart,
      last: history[history.length - 1].periodEnd,
    };
  }, [selectedHistory]);

  const handleCategoryChange = (event) => {
    const nextCategory = event.target.value;
    setCategory(nextCategory);
    setProductId("");
    setForecastData(null);
    setForecastError("");
    setIsForecastLoading(false);
    setSearch("");
    setActiveProductIndex(0);
    setProductMenuOpen(false);
  };

  const selectProduct = (product) => {
    setProductId(String(product.id_producto));
    setForecastData(null);
    setForecastError("");
    setIsForecastLoading(true);
    setSearch("");
    setActiveProductIndex(0);
    setProductMenuOpen(false);
  };

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (productId) {
      setForecastData(null);
      setForecastError("");
      setIsForecastLoading(true);
    }
  };

  return (
    <div className="demand-prediction">
      <div className="page-header prediction-page-header">
        <div className="prediction-page-title">
          <span className="prediction-title-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 19V12h4v7H4Zm6 0V5h4v14h-4Zm6 0V9h4v10h-4Z" fill="currentColor" />
            </svg>
          </span>
          <h1>Predicción de demanda</h1>
        </div>
      </div>

      <section className="panel prediction-controls" aria-label="Filtros de predicción">
        <div className="form-group">
          <label htmlFor="prediction-category">Categoría</label>
          <select
            id="prediction-category"
            className="form-control"
            value={category}
            onChange={handleCategoryChange}
          >
            <option value="">Seleccionar categoría</option>
            {categories.filter((item) => item.estado === "activo").map((item) => (
              <option key={item.id_categoria} value={String(item.id_categoria)}>
                {item.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group prediction-product-picker">
          <label htmlFor="prediction-product">Producto</label>
          <div className="prediction-product-input-wrap">
            <svg className="prediction-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
              <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              id="prediction-product"
              className="form-control"
              type="search"
              disabled={!category || filteredProducts.length === 0}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={productMenuOpen}
              aria-controls="prediction-product-options"
              aria-activedescendant={
                productMenuOpen && matchingProducts[activeProductIndex]
                  ? `prediction-product-option-${matchingProducts[activeProductIndex].id_producto}`
                  : undefined
              }
              placeholder={
                !category
                  ? "Selecciona primero una categoría"
                  : filteredProducts.length === 0
                    ? "No hay productos disponibles"
                    : "Buscar o seleccionar producto..."
              }
              value={productMenuOpen ? search : selectedProduct?.nombre ?? ""}
              onChange={(event) => {
                setSearch(event.target.value);
                setActiveProductIndex(0);
                setProductMenuOpen(true);
              }}
              onFocus={() => {
                setSearch("");
                setActiveProductIndex(0);
                setProductMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && matchingProducts.length > 0) {
                  event.preventDefault();
                  setProductMenuOpen(true);
                  setActiveProductIndex((index) =>
                    productMenuOpen
                      ? Math.min(index + 1, matchingProducts.length - 1)
                      : 0
                  );
                } else if (event.key === "ArrowUp" && matchingProducts.length > 0) {
                  event.preventDefault();
                  setProductMenuOpen(true);
                  setActiveProductIndex((index) =>
                    productMenuOpen
                      ? Math.max(index - 1, 0)
                      : matchingProducts.length - 1
                  );
                } else if (event.key === "Enter" && productMenuOpen) {
                  const activeProduct = matchingProducts[activeProductIndex];
                  if (activeProduct) {
                    event.preventDefault();
                    selectProduct(activeProduct);
                  }
                } else if (event.key === "Escape" && productMenuOpen) {
                  setProductMenuOpen(false);
                  setSearch("");
                }
              }}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement.contains(event.relatedTarget)) {
                  setProductMenuOpen(false);
                  setSearch("");
                }
              }}
            />
            <span className={`prediction-picker-chevron${productMenuOpen ? " is-open" : ""}`} aria-hidden="true" />
            {productMenuOpen && (
              <div className="prediction-product-options" id="prediction-product-options" role="listbox">
                {matchingProducts.length > 0 ? matchingProducts.map((product) => (
                  <button
                    className={`prediction-product-option${String(product.id_producto) === productId ? " is-selected" : ""}${String(matchingProducts[activeProductIndex]?.id_producto) === String(product.id_producto) ? " is-active" : ""}`}
                    id={`prediction-product-option-${product.id_producto}`}
                    key={product.id_producto}
                    type="button"
                    role="option"
                    aria-selected={String(product.id_producto) === productId}
                    onClick={() => selectProduct(product)}
                  >
                    <span>{product.nombre}</span>
                    <small>
                      {categories.find(
                        (item) => String(item.id_categoria) === String(product.categoria_id)
                      )?.nombre || "Sin categoría"}
                    </small>
                  </button>
                )) : (
                  <span className="prediction-no-products">No se encontraron productos.</span>
                )}
              </div>
            )}
          </div>
        </div>

        <fieldset className="prediction-period-group">
          <legend>Horizonte de predicción</legend>
          <div className="prediction-period-options">
            {PERIODS.map((option) => (
              <button
                className={`prediction-period-button${period === option.value ? " is-active" : ""}`}
                type="button"
                key={option.value}
                aria-pressed={period === option.value}
                onClick={() => handlePeriodChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="panel prediction-result" aria-labelledby="prediction-result-heading">
        <div className="prediction-result-heading">
          <span className="prediction-title-icon prediction-result-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 19V12h4v7H4Zm6 0V5h4v14h-4Zm6 0V9h4v10h-4Z" fill="currentColor" />
            </svg>
          </span>
          <h2 id="prediction-result-heading">Resultado de la predicción</h2>
        </div>

        {loadError ? (
          <div className="error-message" role="alert">{loadError}</div>
        ) : isLoading ? (
          <p className="prediction-empty-result">Cargando datos de predicción...</p>
        ) : forecastError ? (
          <div className="error-message" role="alert">{forecastError}</div>
        ) : isForecastLoading ? (
          <p className="prediction-empty-result">Calculando pronóstico con ventas registradas...</p>
        ) : selectedProduct && prediction ? (
          <>
            <div className="prediction-selected-product">
              <div className="prediction-product-mark" aria-hidden="true">
                {String(selectedProduct.nombre || "").slice(0, 1).toLocaleUpperCase()}
              </div>
              <div>
                <h3>{selectedProduct.nombre}</h3>
                <span className="prediction-category-badge">
                  {selectedCategory?.nombre || "Sin categoría"}
                </span>
              </div>
            </div>

            <p className="prediction-empty-result" role="status">
              Solo se consideran días con disponibilidad positiva durante toda la jornada.
              Los días censurados se excluyen y no se interpretan como ventas cero. El corte
              utilizado es {formatearFecha(forecastData.cutoff_date)}; el modelo está en modo
              sombra.
            </p>

            <div className="prediction-metric-grid">
              <article className="prediction-metric-card">
                <span className="prediction-metric-symbol metric-demand" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 19V12h4v7H4Zm6 0V5h4v14h-4Zm6 0V9h4v10h-4Z" fill="currentColor" />
                  </svg>
                </span>
                <div>
                  <span className="prediction-metric-label">Demanda estimada</span>
                  <strong>{DEMAND_FORMATTER.format(Number(prediction.demand))}</strong>
                  <small>unidades</small>
                </div>
              </article>
              <article className="prediction-metric-card">
                <span className="prediction-metric-symbol metric-stock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v8.2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <span className="prediction-metric-label">Stock actual</span>
                  <strong>
                    {selectedInventory
                      ? Number(selectedInventory.stock_actual).toLocaleString("es-PE")
                      : "—"}
                  </strong>
                  <small>
                    {selectedInventory ? "unidades" : "Sin registro de inventario"}
                  </small>
                </div>
              </article>
              <article className="prediction-metric-card">
                <span className="prediction-metric-symbol metric-risk" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M10.3 4.7 2.9 17.5A1.7 1.7 0 0 0 4.4 20h15.2a1.7 1.7 0 0 0 1.5-2.5L13.7 4.7a2 2 0 0 0-3.4 0Z" fill="currentColor" />
                    <path d="M12 9v4m0 3h.01" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <span className="prediction-metric-label">Riesgo de desabastecimiento</span>
                  <strong
                    className={`prediction-risk-badge ${
                      forecastData.risk === null
                        ? ""
                        : forecastData.risk
                          ? "risk-alto"
                          : "risk-bajo"
                    }`}
                  >
                    {forecastData.risk === null
                      ? "No disponible"
                      : forecastData.risk
                        ? "En riesgo"
                        : "Sin riesgo"}
                  </strong>
                  {forecastData.risk === null && (
                    <small>No se ha aprobado una política de riesgo de inventario</small>
                  )}
                </div>
              </article>
              <article className="prediction-metric-card prediction-replenishment-card">
                <span className="prediction-metric-symbol metric-replenishment" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3 4h2l2.3 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L22 8H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="10" cy="20" r="1.3" fill="currentColor" />
                    <circle cx="18" cy="20" r="1.3" fill="currentColor" />
                  </svg>
                </span>
                <div>
                  <span className="prediction-metric-label">Reposición sugerida</span>
                  <strong>
                    {forecastData.suggested_replenishment === null
                      ? "—"
                      : Number(forecastData.suggested_replenishment).toLocaleString("es-PE")}
                  </strong>
                  <small>
                    {forecastData.suggested_replenishment === null
                      ? forecastData.replenishment_unavailable_reason
                      : selectedInventory?.stock_maximo === null
                        ? "unidades; sin límite máximo configurado"
                        : "unidades; limitada por stock máximo"}
                  </small>
                </div>
              </article>
            </div>

            <section className="prediction-chart-panel" aria-labelledby="prediction-chart-heading">
              <div className="prediction-chart-heading">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m4 16 5-5 4 3 7-8m0 0h-5m5 0v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <h3 id="prediction-chart-heading">Ventas históricas y predicción</h3>
                  <p>
                    Histórico: {period === 30
                      ? "periodos mensuales completos y observables"
                      : "semanas completas y observables"}
                    {" · "}
                    {selectedHistoryRange
                      ? `${formatearFecha(selectedHistoryRange.first)} – ${formatearFecha(selectedHistoryRange.last)}`
                      : "sin datos"}
                    {" · "}Pronóstico: {forecastDateRange.label} ({period} días)
                  </p>
                </div>
              </div>
              <SalesChart
                history={selectedHistory}
                forecast={selectedChartData.forecast}
                period={period}
                forecastDateRange={forecastDateRange}
              />
              {selectedHistory.length === 0 && (
                <p className="prediction-empty-result" role="status">
                  No hay períodos históricos completamente observables para mostrar.
                </p>
              )}
            </section>

            <div className="prediction-model-info">
              <span className="prediction-model-setting" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v2m0 14v2M3 12h2m14 0h2m-15.4-6.4 1.4 1.4m10 10 1.4 1.4m0-12.8L17 7m-10 10-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span><strong>Método:</strong> {prediction.selected_method}</span>
              <span><strong>Segmento:</strong> {prediction.segment}</span>
              <span><strong>Versión:</strong> {prediction.model_version} (sombra)</span>
              <span><strong>MAE:</strong> Pendiente de evaluación</span>
              <span>
                <strong>Historial visible:</strong>{" "}
                {prediction.history_weeks} semanas completas
                {" · "}
                {prediction.positive_history_weeks} con ventas
                {" · "}
                {selectedHistoryRange
                  ? `${formatearFecha(selectedHistoryRange.first)} – ${formatearFecha(selectedHistoryRange.last)}`
                  : "Sin semanas completas"}
              </span>
              <span>
                <strong>Días observables en el historial:</strong>{" "}
                {prediction.observed_days}
              </span>
              <span><strong>Horizonte:</strong> {period} días</span>
            </div>
          </>
        ) : (
          <p className="prediction-empty-result">
            {!category
              ? "Selecciona una categoría y un producto para consultar su pronóstico."
              : filteredProducts.length === 0
                ? "No hay productos activos disponibles en esta categoría."
                : "Selecciona un producto para consultar su pronóstico."}
          </p>
        )}
      </section>
    </div>
  );
}

export default Predicciones;
