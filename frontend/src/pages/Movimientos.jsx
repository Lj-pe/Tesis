import { useEffect, useState } from "react";
import apiClient from "../api/client";

function Movimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [inventarios, setInventarios] = useState([]);
  const [productos, setProductos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [movimientosData, inventariosData, productosData, usuariosData] = await Promise.all([
          apiClient.get("/movimientos-inventario"),
          apiClient.get("/inventarios"),
          apiClient.get("/productos"),
          apiClient.get("/usuarios"),
        ]);
        setMovimientos(Array.isArray(movimientosData) ? movimientosData : []);
        setInventarios(Array.isArray(inventariosData) ? inventariosData : []);
        setProductos(Array.isArray(productosData) ? productosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch (error) {
        setLoadError(error.message || "No se pudieron cargar los movimientos de inventario.");
      } finally {
        setIsLoading(false);
      }
    };
    cargarDatos();
  }, []);

  const obtenerProducto = (inventarioId) => {
    const inventario = inventarios.find((item) => item.id_inventario === inventarioId);
    return productos.find((item) => item.id_producto === inventario?.producto_id);
  };

  const obtenerUsuario = (usuarioId) => {
    const usuario = usuarios.find((item) => item.id_usuario === usuarioId);
    return usuario ? `${usuario.nombre} ${usuario.apellido || ""}`.trim() : "Usuario no encontrado";
  };

  const formatearFecha = (fecha) => (fecha ? new Date(fecha).toLocaleString("es-PE") : "No disponible");
  const movimientosVisibles = movimientos.filter((movimiento) => {
    const producto = obtenerProducto(movimiento.inventario_id);
    const texto = busqueda.trim().toLowerCase();
    const coincideBusqueda = !texto || producto?.nombre?.toLowerCase().includes(texto) || producto?.codigo_sku?.toLowerCase().includes(texto);
    const coincideTipo = tipoFiltro === "todos" || movimiento.tipo_movimiento === tipoFiltro;
    return coincideBusqueda && coincideTipo;
  }).sort((a, b) => new Date(b.fecha_movimiento) - new Date(a.fecha_movimiento));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Movimientos de inventario</h1>
          <p>Historial de entradas y salidas de stock.</p>
        </div>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input className="search-input" placeholder="Buscar producto..." value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />
          <div className="toolbar-filters">
            <select className="filter-select" value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value)}>
              <option value="todos">Todos los tipos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
        </div>

        {loadError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}

        <div className="table-responsive movimientos-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Producto</th><th>Tipo</th><th>Motivo</th>
                <th>Cantidad</th><th>Usuario</th><th>Observación</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="8">Cargando movimientos...</td></tr>
              ) : movimientosVisibles.length === 0 ? (
                <tr><td colSpan="8">No se encontraron movimientos con los filtros actuales.</td></tr>
              ) : movimientosVisibles.map((movimiento) => {
                const producto = obtenerProducto(movimiento.inventario_id);
                return (
                  <tr key={movimiento.id_movimiento}>
                    <td>{formatearFecha(movimiento.fecha_movimiento)}</td>
                    <td><strong>{producto?.nombre || "Producto no encontrado"}</strong></td>
                    <td><span className={`badge ${movimiento.tipo_movimiento === "entrada" ? "success-badge" : "danger-badge"}`}>{movimiento.tipo_movimiento}</span></td>
                    <td>{movimiento.motivo || "Sin motivo"}</td>
                    <td>{movimiento.cantidad}</td>
                    <td>{obtenerUsuario(movimiento.usuario_id)}</td>
                    <td>{movimiento.observaciones || "Sin observaciones"}</td>
                    <td>{movimiento.estado || "Sin estado"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default Movimientos;
