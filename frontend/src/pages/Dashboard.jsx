import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";

const LIMA_TIME_ZONE = "America/Lima";
const MOVEMENT_LABELS = {
  venta: "Venta",
  anulacion_venta: "Anulación de venta",
  recepcion: "Recepción",
  ajuste: "Ajuste",
};

const STAT_ICONS = {
  products: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z M4.5 7.7 12 12l7.5-4.3 M12 12v9 M8 5.3l8 4.5" />,
  stock: <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z M4 12l8 4.5 8-4.5 M4 16.5 12 21l8-4.5 M12 12v4.5" />,
  sales: <path d="M4 18.5 9 13l3.5 3.5L20 8 M14.5 8H20v5.5" />,
  purchases: <path d="M4 5h2l2.2 10.1a2 2 0 0 0 2 1.6h6.9a2 2 0 0 0 1.9-1.4L21 9H7 M11 20h.01 M17 20h.01" />,
};

function StatIcon({ type }) {
  return <span className="dashboard-stat-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {STAT_ICONS[type]}
    </svg>
  </span>;
}

function SectionIcon({ type }) {
  const paths = {
    chart: <path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6M16 7h3v3" />,
    warning: <path d="M10.3 4.5 2.9 17.3A1.8 1.8 0 0 0 4.5 20h15a1.8 1.8 0 0 0 1.6-2.7L13.7 4.5a2 2 0 0 0-3.4 0ZM12 9v4m0 3h.01" />,
    clock: <path d="M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  };
  return <span className={`dashboard-section-icon dashboard-section-icon-${type}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  </span>;
}

function getDateParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map(({ type, value }) => [type, value]));
}

function getLastSevenDays() {
  const { year, month, day } = getDateParts(new Date(), LIMA_TIME_ZONE);
  const lastDay = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(lastDay);
    date.setUTCDate(lastDay.getUTCDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const parts = new Intl.DateTimeFormat("es-PE", {
      timeZone: "UTC",
      weekday: "short",
      day: "2-digit",
    }).formatToParts(date);
    const weekday = parts.find((part) => part.type === "weekday")?.value.replace(".", "") || "";
    const dayNumber = parts.find((part) => part.type === "day")?.value || "";
    return { date: key, label: `${weekday} ${dayNumber}` };
  });
}

function dateKey(value) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const { year, month, day } = getDateParts(value, LIMA_TIME_ZONE);
    return `${year}-${month}-${day}`;
  }
  return "";
}

function toCents(value) {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(String(value ?? "0"));
  if (!match) return 0n;
  const fraction = (match[3] || "").padEnd(2, "0").slice(0, 2);
  const cents = BigInt(match[2]) * 100n + BigInt(fraction || "0");
  return match[1] ? -cents : cents;
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100);
}

function formatChartDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function niceStep(maximum) {
  if (maximum <= 0) return 1;
  const raw = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function SalesChart({ days, salesByDay, loading }) {
  const [activePoint, setActivePoint] = useState(null);
  const chartData = useMemo(() => {
    const totals = new Map(salesByDay.map((row) => [dateKey(row.fecha_comercial), toCents(row.ingresos)]));
    return days.map((day) => ({ ...day, cents: totals.get(day.date) || 0n }));
  }, [days, salesByDay]);

  const maximum = Math.max(0, ...chartData.map((item) => Number(item.cents) / 100));
  const step = niceStep(maximum);
  const axisMaximum = step * 4;
  const bounds = { width: 640, height: 270, left: 76, right: 18, top: 16, bottom: 42 };
  const plotWidth = bounds.width - bounds.left - bounds.right;
  const plotHeight = bounds.height - bounds.top - bounds.bottom;
  const x = (index) => bounds.left + (plotWidth * index) / Math.max(chartData.length - 1, 1);
  const y = (value) => bounds.top + plotHeight - (value / axisMaximum) * plotHeight;
  const points = chartData.map((item, index) => `${x(index)},${y(Number(item.cents) / 100)}`).join(" ");
  const areaPoints = `${x(0)},${bounds.height - bounds.bottom} ${points} ${x(chartData.length - 1)},${bounds.height - bounds.bottom}`;
  const activeItem = activePoint === null ? null : chartData[activePoint];
  const tooltipX = activePoint === null ? 0 : Math.min(
    Math.max(x(activePoint) - 85, bounds.left),
    bounds.width - bounds.right - 170,
  );
  const pointY = activePoint === null ? 0 : y(Number(activeItem.cents) / 100);
  const tooltipY = Math.max(bounds.top + 6, pointY - 58);

  return <div className="dashboard-chart-scroll">
    {loading ? <div className="dashboard-empty">Cargando ingresos...</div>
      : <svg className="dashboard-sales-chart" viewBox={`0 0 ${bounds.width} ${bounds.height}`} role="img" aria-label="Ingresos diarios por ventas realizadas en los últimos siete días">
        <defs>
          <linearGradient id="dashboard-sales-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity=".24" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = step * tick;
          return <g key={tick}>
            <line className="dashboard-chart-grid" x1={bounds.left} x2={bounds.width - bounds.right} y1={y(value)} y2={y(value)} />
            <text className="dashboard-chart-axis" x={bounds.left - 10} y={y(value) + 4} textAnchor="end">
              {`S/ ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value)}`}
            </text>
          </g>;
        })}
        <polygon className="dashboard-chart-area" points={areaPoints} />
        <polyline className="dashboard-chart-line" points={points} />
        {chartData.map((item, index) => <g key={item.date}>
          <circle
            className="dashboard-chart-point"
            cx={x(index)}
            cy={y(Number(item.cents) / 100)}
            r="5"
            tabIndex="0"
            role="img"
            aria-label={`${item.label}: ${formatCurrency(item.cents)}`}
            onMouseEnter={() => setActivePoint(index)}
            onMouseLeave={() => setActivePoint(null)}
            onFocus={() => setActivePoint(index)}
            onBlur={() => setActivePoint(null)}
          >
          </circle>
          <text className="dashboard-chart-day" x={x(index)} y={bounds.height - 12} textAnchor="middle">{item.label}</text>
        </g>)}
        {activeItem && <g className="dashboard-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} pointerEvents="none">
          <rect width="170" height="48" rx="8" />
          <text className="dashboard-chart-tooltip-date" x="12" y="19">{formatChartDate(activeItem.date)}</text>
          <text className="dashboard-chart-tooltip-value" x="12" y="37">{formatCurrency(activeItem.cents)}</text>
        </g>}
      </svg>}
    {!loading && chartData.every((item) => item.cents === 0n) && <p className="dashboard-chart-note">Sin ingresos por ventas realizadas en este período.</p>}
  </div>;
}

function formatMovementDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LIMA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("day")}/${part("month")}/${part("year")} · ${part("hour")}:${part("minute")}`;
}

function formatVariation(value) {
  try {
    const units = BigInt(value);
    return `${units < 0n ? "−" : "+"}${units < 0n ? -units : units} unidades`;
  } catch {
    return "—";
  }
}

function variationClass(value) {
  try {
    const units = BigInt(value);
    return units < 0n ? "is-outgoing" : units > 0n ? "is-incoming" : "is-neutral";
  } catch {
    return "is-neutral";
  }
}

function formatInteger(value) {
  try {
    return new Intl.NumberFormat("es-PE").format(BigInt(value ?? 0));
  } catch {
    return "—";
  }
}

function Dashboard() {
  const [days] = useState(getLastSevenDays);
  const [data, setData] = useState({ stats: null, salesByDay: [], movements: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const desde = days[0].date;
    const hasta = days[days.length - 1].date;
    apiClient.get(`/dashboard?desde=${desde}&hasta=${hasta}`)
      .then((result) => setData({
        stats: result.stats || null,
        salesByDay: Array.isArray(result.salesByDay) ? result.salesByDay : [],
        movements: Array.isArray(result.movements) ? result.movements : [],
      }))
      .catch((requestError) => setError(requestError.message || "No se pudieron cargar los datos del dashboard."))
      .finally(() => setLoading(false));
  }, [days]);

  const stats = data.stats;

  return <>
    <div className="page-header"><div><h1 className="category-page-title"><svg className="category-display-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6M16 7h3v3" /></svg>Dashboard</h1><p>Resumen operativo del minimarket.</p></div></div>
    {error && <div className="error-message" role="alert">{error}</div>}

    <div className="stats-grid">
      <article className="stat-card dashboard-stat-card dashboard-stat-products">
        <div className="dashboard-stat-heading"><StatIcon type="products" /><span>Productos activos</span></div>
        <strong>{loading || !stats ? "—" : formatInteger(stats.productos_activos)}</strong>
        <small className="dashboard-stat-description">Productos habilitados para la venta</small>
      </article>
      <article className="stat-card dashboard-stat-card dashboard-stat-stock">
        <div className="dashboard-stat-heading"><StatIcon type="stock" /><span>Unidades en stock</span></div>
        <strong>{loading || !stats ? "—" : formatInteger(stats.unidades_en_stock)}</strong>
        <small className="dashboard-stat-description">Unidades disponibles en inventario</small>
      </article>
      <article className="stat-card dashboard-stat-card dashboard-stat-sales">
        <div className="dashboard-stat-heading"><StatIcon type="sales" /><span>Ventas realizadas</span></div>
        <strong>{loading || !stats ? "—" : formatInteger(stats.ventas_realizadas)}</strong>
        <small className="dashboard-stat-description">Operaciones completadas</small>
      </article>
      <article className="stat-card dashboard-stat-card dashboard-stat-purchases">
        <div className="dashboard-stat-heading"><StatIcon type="purchases" /><span>Compras por recibir</span></div>
        <strong>{loading || !stats ? "—" : formatInteger(stats.compras_por_recibir)}</strong>
        <small className="dashboard-stat-description">Compras con saldo pendiente</small>
      </article>
    </div>

    <section className="dashboard-grid">
      <article className="panel dashboard-panel">
        <div className="panel-header dashboard-section-heading">
          <SectionIcon type="chart" />
          <h3>Ingresos por ventas — últimos 7 días</h3>
        </div>
        <SalesChart days={days} salesByDay={data.salesByDay} loading={loading} />
      </article>
      <article className="panel dashboard-panel">
        <div className="panel-header dashboard-panel-heading">
          <div className="dashboard-heading-content">
            <SectionIcon type="warning" />
            <h3>Productos con stock bajo</h3>
            <span className="dashboard-count">(0)</span>
          </div>
          <Link className="dashboard-link" to="/inventario">Ver todos</Link>
        </div>
        <div className="dashboard-stock-scroll">
          <p className="dashboard-empty">No hay productos clasificados como stock bajo</p>
        </div>
      </article>
    </section>

    <section className="panel dashboard-panel dashboard-movements-panel">
      <div className="panel-header dashboard-panel-heading">
        <div className="dashboard-heading-content">
          <SectionIcon type="clock" />
          <h3>Movimientos recientes</h3>
          <span className="dashboard-count">({data.movements.length})</span>
        </div>
        <Link className="dashboard-link" to="/movimientos">Ver todos</Link>
      </div>
      <div className="dashboard-movements-scroll">
        <div className="table-responsive"><table>
          <thead><tr><th>Fecha y hora</th><th>Producto</th><th>Movimiento</th><th>Variación</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="4">Cargando movimientos...</td></tr>
            : data.movements.length === 0 ? <tr><td colSpan="4">No hay movimientos registrados.</td></tr>
              : data.movements.map((item) => <tr key={String(item.id)}>
                <td>{formatMovementDate(item.ocurrido_en)}</td>
                <td>{item.nombre_producto}</td>
                <td><span className={`dashboard-movement-badge is-${item.tipo}`}>{MOVEMENT_LABELS[item.tipo] || item.tipo}</span></td>
                <td><span className={`dashboard-movement-variation ${variationClass(item.variacion_unidades)}`}>{formatVariation(item.variacion_unidades)}</span></td>
              </tr>)}
          </tbody>
        </table></div>
      </div>
    </section>
  </>;
}

export default Dashboard;
