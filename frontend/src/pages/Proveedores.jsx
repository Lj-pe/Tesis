import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  codigo: "",
  nombre: "",
  telefono: "",
  correo: "",
  direccion: "",
  plazo_entrega_dias: "",
  activo: true,
};

const providerIcons = {
  providers: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4" />,
  name: <path d="M4 7h16M4 12h10M4 17h13" />,
  code: <path d="M8 8 5 12l3 4m8-8 3 4-3 4m-3-9-2 10" />,
  phone: <path d="M7 3H5a2 2 0 0 0-2 2 16 16 0 0 0 16 16 2 2 0 0 0 2-2v-2l-5-2-2 2a12 12 0 0 1-4-4l2-2-2-5H7Z" />,
  email: <path d="M3 5h18v14H3z m0 1 9 7 9-7" />,
  address: <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  days: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  package: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12l-8-4.5m8 4.5v9" />,
  quantity: <path d="M5 12h14m-7-7v14" />,
  cost: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  preferred: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  actions: <path d="M4 6h16M4 12h16M4 18h16" />,
  edit: <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z M13 6l5 5" />,
  deactivate: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-7.1-2.9 14.2-14.2" />,
  activate: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4.5-10 3 3 6-6" />,
};

function ProviderIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {providerIcons[type]}
  </svg>;
}

function ProviderFieldLabel({ icon, htmlFor, children }) {
  return <label className="form-label provider-field-label" htmlFor={htmlFor}>
    <ProviderIcon type={icon} />{children}
  </label>;
}

function ProviderColumnHeading({ icon, children }) {
  return <span className="category-table-heading"><ProviderIcon type={icon} className="category-display-icon" />{children}</span>;
}

function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [managedProvider, setManagedProvider] = useState(null);
  const [catalogRows, setCatalogRows] = useState([]);
  const [daysInput, setDaysInput] = useState("");
  const [catalogForm, setCatalogForm] = useState({
    producto_id: "", presentacion_compra: "", unidades_por_presentacion: "1",
    costo_presentacion: "", minimo_presentaciones: "1", preferido: false, activo: true,
  });
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [managementError, setManagementError] = useState("");

  const cargarProveedores = async () => {
    try {
      setLoadError("");
      const [data, productRows] = await Promise.all([
        apiClient.get("/proveedores"), apiClient.get("/productos"),
      ]);
      setProveedores(Array.isArray(data) ? data : []);
      setProductos(Array.isArray(productRows) ? productRows : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar los proveedores.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(cargarProveedores);
  }, []);

  const abrirCrear = () => {
    setEditingProvider(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const abrirEditar = (proveedor) => {
    setEditingProvider(proveedor);
    setForm({
      codigo: proveedor.codigo || "",
      nombre: proveedor.nombre || "",
      telefono: proveedor.telefono || "",
      correo: proveedor.correo || "",
      direccion: proveedor.direccion || "",
      plazo_entrega_dias: String(proveedor.plazo_entrega_dias ?? ""),
      activo: Boolean(proveedor.activo),
    });
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    setEditingProvider(null);
    setForm(emptyForm);
    setFormError("");
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const guardarProveedor = async (event) => {
    event.preventDefault();

    if (!form.codigo.trim() || !form.nombre.trim() ||
        !Number.isInteger(Number(form.plazo_entrega_dias)) || Number(form.plazo_entrega_dias) < 0) {
      setFormError("Completa el código, nombre y plazo de entrega en días.");
      return;
    }

    const payload = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim() || null,
      correo: form.correo.trim() || null,
      direccion: form.direccion.trim() || null,
      plazo_entrega_dias: Number(form.plazo_entrega_dias),
      activo: form.activo,
    };

    try {
      if (editingProvider) {
        await apiClient.put(`/proveedores/${editingProvider.id}`, payload);
      } else {
        await apiClient.post("/proveedores", payload);
      }
      await cargarProveedores();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo guardar el proveedor.");
    }
  };

  const cambiarEstado = async (proveedor) => {
    try {
      await apiClient.put(`/proveedores/${proveedor.id}`, {
        activo: !proveedor.activo,
      });
      await cargarProveedores();
    } catch (error) {
      setLoadError(error.message || "No se pudo cambiar el estado del proveedor.");
    }
  };

  const gestionarProveedor = async (proveedor) => {
    try {
      setManagementError("");
      const [catalogData, days] = await Promise.all([
        apiClient.get(`/proveedores/catalogo?proveedor_id=${encodeURIComponent(proveedor.id)}&incluir_inactivos=true`),
        apiClient.get(`/proveedores/${proveedor.id}/dias-pedido`),
      ]);
      setManagedProvider(proveedor);
      setCatalogRows(Array.isArray(catalogData) ? catalogData : []);
      setDaysInput(Array.isArray(days) ? days.join(", ") : "");
    } catch (error) {
      setLoadError(error.message || "No se pudo cargar el catálogo del proveedor.");
    }
  };

  const editarCatalogo = (row) => {
    setEditingCatalogId(row.id);
    setCatalogForm({
      producto_id: String(row.producto_id),
      presentacion_compra: row.presentacion_compra,
      unidades_por_presentacion: String(row.unidades_por_presentacion),
      costo_presentacion: String(row.costo_presentacion),
      minimo_presentaciones: String(row.minimo_presentaciones),
      preferido: Boolean(row.preferido),
      activo: Boolean(row.activo),
    });
  };

  const guardarCatalogo = async (event) => {
    event.preventDefault();
    setManagementError("");
    try {
      const payload = {
        presentacion_compra: catalogForm.presentacion_compra.trim(),
        unidades_por_presentacion: Number(catalogForm.unidades_por_presentacion),
        costo_presentacion: catalogForm.costo_presentacion,
        minimo_presentaciones: Number(catalogForm.minimo_presentaciones),
        preferido: Boolean(catalogForm.preferido),
        activo: Boolean(catalogForm.activo),
      };
      if (editingCatalogId) {
        await apiClient.put(`/proveedores/catalogo/${editingCatalogId}`, payload);
      } else {
        await apiClient.post("/proveedores/catalogo", {
          ...payload, proveedor_id: managedProvider.id, producto_id: catalogForm.producto_id,
        });
      }
      const rows = await apiClient.get(`/proveedores/catalogo?proveedor_id=${encodeURIComponent(managedProvider.id)}&incluir_inactivos=true`);
      setCatalogRows(rows);
      setEditingCatalogId(null);
      setCatalogForm({ producto_id: "", presentacion_compra: "", unidades_por_presentacion: "1", costo_presentacion: "", minimo_presentaciones: "1", preferido: false, activo: true });
    } catch (error) {
      setManagementError(error.message || "No se pudo guardar la relación.");
    }
  };

  const guardarDiasPedido = async (event) => {
    event.preventDefault();
    try {
      const values = daysInput.split(",").map((value) => value.trim()).filter(Boolean);
      const days = await apiClient.put(`/proveedores/${managedProvider.id}/dias-pedido`, { dias: values });
      setDaysInput(Array.isArray(days) ? days.join(", ") : "");
      setManagementError("");
    } catch (error) {
      setManagementError(error.message || "No se pudieron guardar los días de pedido.");
    }
  };

  const proveedoresVisibles = proveedores.filter((proveedor) => {
    const texto = search.trim().toLowerCase();
    return !texto ||
      proveedor.nombre?.toLowerCase().includes(texto) ||
      proveedor.codigo?.toLowerCase().includes(texto) ||
      proveedor.correo?.toLowerCase().includes(texto);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="category-page-title"><ProviderIcon type="providers" className="category-display-icon" />Proveedores</h1>
          <p>Gestión de proveedores del negocio.</p>
        </div>
        <button className="primary-button" type="button" onClick={abrirCrear}>
          + Nuevo proveedor
        </button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input
            className="search-input"
            placeholder="Buscar proveedor..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loadError && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {loadError}
          </div>
        )}

        <div className="table-responsive provider-table-scroll">
        <table className="provider-table">
          <thead>
            <tr>
              <th><ProviderColumnHeading icon="providers">Proveedor</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="code">Código</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="phone">Teléfono</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="days">Plazo (días)</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="status">Estado</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="actions">Acciones</ProviderColumnHeading></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="6">Cargando proveedores...</td></tr>
            ) : !loadError && proveedoresVisibles.length === 0 ? (
              <tr><td colSpan="6">No se encontraron proveedores.</td></tr>
            ) : proveedoresVisibles.map((proveedor) => (
              <tr key={proveedor.id}>
                <td><strong>{proveedor.nombre}</strong></td>
                <td>{proveedor.codigo}</td>
                <td>{proveedor.telefono || "Sin teléfono"}</td>
                <td>{proveedor.plazo_entrega_dias}</td>
                <td>
                  <span className={`badge product-status-badge ${proveedor.activo ? "success-badge is-active" : "inactive-badge"}`}>
                    <span className="product-status-dot" />
                    {proveedor.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <button className="product-action-button provider-table-action provider-action-edit" type="button" onClick={() => abrirEditar(proveedor)}>
                    <ProviderIcon type="edit" />
                    Editar
                  </button>
                  <button className="product-action-button provider-table-action provider-action-manage" type="button" onClick={() => gestionarProveedor(proveedor)}>
                    <ProviderIcon type="product" />
                    Productos y días
                  </button>
                  <button className={`product-action-button provider-table-action ${proveedor.activo ? "is-destructive" : "provider-action-activate"}`} type="button" onClick={() => cambiarEstado(proveedor)}>
                    <ProviderIcon type={proveedor.activo ? "deactivate" : "activate"} />
                    {proveedor.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <div className="account-modal-backdrop">
          <section className={`account-modal provider-form-modal ${editingProvider ? "is-editing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="provider-form-title">
            <div className="account-modal-header">
              <div><h2 id="provider-form-title">{editingProvider ? "Editar proveedor" : "Nuevo proveedor"}</h2>
                <p>{editingProvider ? "Actualiza los datos del proveedor." : "Registra un nuevo proveedor."}</p></div>
              <button className="account-modal-close" type="button" aria-label="Cerrar" onClick={cerrarFormulario}>×</button>
            </div>

            {formError && <div className="error-message" role="alert">{formError}</div>}

            <form onSubmit={guardarProveedor}>
              <div className="provider-form-fields">
                {[
                  ["codigo", "Código", "code", "Ej.: PRV-001"],
                  ["nombre", "Nombre", "name", "Ej.: Distribuidora Central"],
                  ["telefono", "Teléfono", "phone", "Ej.: 987 654 321"],
                  ["correo", "Correo", "email", "Ej.: ventas@proveedor.pe"],
                  ["direccion", "Dirección", "address", "Ej.: Av. Principal 123"],
                ].map(([name, label, icon, placeholder]) => (
                  <div className={`provider-form-field provider-form-field-${name}`} key={name}>
                    <ProviderFieldLabel icon={icon} htmlFor={`proveedor-${name}`}>{label}</ProviderFieldLabel>
                    <input id={`proveedor-${name}`} name={name} className="form-control" value={form[name]} onChange={manejarCambio} placeholder={placeholder} />
                  </div>
                ))}
                <div className="provider-form-field provider-form-field-plazo_entrega_dias">
                  <ProviderFieldLabel icon="days" htmlFor="proveedor-plazo">Plazo de entrega (días)</ProviderFieldLabel>
                  <input id="proveedor-plazo" name="plazo_entrega_dias" type="number" min="0" step="1" className="form-control" value={form.plazo_entrega_dias} onChange={manejarCambio} placeholder="Ej.: 3" />
                </div>
                <div className="provider-form-field">
                  <ProviderFieldLabel icon="status" htmlFor="proveedor-activo">Estado</ProviderFieldLabel>
                  <select id="proveedor-activo" className="form-control" value={String(form.activo)} onChange={(event) => setForm((current) => ({ ...current, activo: event.target.value === "true" }))}>
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="account-modal-actions">
                <button type="submit" className="primary-button">Guardar cambios</button>
                <button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {managedProvider && (
        <div className="account-modal-backdrop">
          <section className="account-modal provider-management-modal" role="dialog" aria-modal="true" aria-labelledby="provider-catalog-title">
            <div className="account-modal-header">
              <div><h2 id="provider-catalog-title"><ProviderIcon type="providers" className="provider-modal-title-icon" />{managedProvider.nombre}</h2><p>Productos asociados y días de pedido.</p></div>
              <button className="account-modal-close" type="button" onClick={() => setManagedProvider(null)}>×</button>
            </div>
            {managementError && <div className="error-message" role="alert">{managementError}</div>}
            <form onSubmit={guardarCatalogo}>
              <h3 className="provider-section-title"><ProviderIcon type="product" />Catálogo del proveedor</h3>
              <div className="account-modal-fields provider-catalog-fields">
                {!editingCatalogId && <div><ProviderFieldLabel icon="product">Producto</ProviderFieldLabel><select className="form-control" value={catalogForm.producto_id} onChange={(event) => setCatalogForm((current) => ({ ...current, producto_id: event.target.value }))} required><option value="">Selecciona producto</option>{productos.map((item) => <option value={item.id} key={item.id}>{item.codigo} — {item.nombre}</option>)}</select></div>}
                <div><ProviderFieldLabel icon="package">Presentación de compra</ProviderFieldLabel><input className="form-control" value={catalogForm.presentacion_compra} onChange={(event) => setCatalogForm((current) => ({ ...current, presentacion_compra: event.target.value }))} placeholder="Ej.: caja" required /></div>
                <div><ProviderFieldLabel icon="quantity">Unidades por presentación</ProviderFieldLabel><input className="form-control" type="number" min="1" step="1" value={catalogForm.unidades_por_presentacion} onChange={(event) => setCatalogForm((current) => ({ ...current, unidades_por_presentacion: event.target.value }))} placeholder="Ej.: 12" required /></div>
                <div><ProviderFieldLabel icon="cost">Costo por presentación</ProviderFieldLabel><input className="form-control" type="number" min="0" step="0.01" value={catalogForm.costo_presentacion} onChange={(event) => setCatalogForm((current) => ({ ...current, costo_presentacion: event.target.value }))} placeholder="Ej.: 24.50" required /></div>
                <div><ProviderFieldLabel icon="quantity">Mínimo de presentaciones</ProviderFieldLabel><input className="form-control" type="number" min="1" step="1" value={catalogForm.minimo_presentaciones} onChange={(event) => setCatalogForm((current) => ({ ...current, minimo_presentaciones: event.target.value }))} placeholder="Ej.: 1" required /></div>
                <label className="provider-checkbox"><input type="checkbox" checked={catalogForm.preferido} onChange={(event) => setCatalogForm((current) => ({ ...current, preferido: event.target.checked }))} /><ProviderIcon type="preferred" />Proveedor preferido</label>
                <label className="provider-checkbox"><input type="checkbox" checked={catalogForm.activo} onChange={(event) => setCatalogForm((current) => ({ ...current, activo: event.target.checked }))} /><ProviderIcon type="status" />Relación activa</label>
              </div>
              <div className="account-modal-actions"><button className="primary-button">Guardar relación</button>{editingCatalogId && <button className="action-button" type="button" onClick={() => setEditingCatalogId(null)}>Cancelar edición</button>}</div>
            </form>
            <h3 className="provider-section-title"><ProviderIcon type="package" />Productos asociados</h3>
            <div className="provider-catalog-table"><table><thead><tr>
              <th><ProviderColumnHeading icon="product">Producto</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="package">Presentación</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="quantity">Unidades</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="cost">Costo</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="status">Estado</ProviderColumnHeading></th>
              <th><ProviderColumnHeading icon="actions">Acciones</ProviderColumnHeading></th>
            </tr></thead><tbody>
              {catalogRows.map((row) => <tr key={row.id}><td>{row.nombre_producto}</td><td>{row.presentacion_compra}</td><td>{row.unidades_por_presentacion}</td><td>{row.costo_presentacion}</td><td><span className={`badge product-status-badge ${row.activo ? "success-badge is-active" : "inactive-badge"}`}><span className="product-status-dot" />{row.activo ? "Activo" : "Inactivo"}</span></td><td><button className="product-action-button provider-table-action provider-action-edit" type="button" onClick={() => editarCatalogo(row)}><ProviderIcon type="edit" />Editar</button></td></tr>)}
            </tbody></table></div>
            <form className="provider-days-form" onSubmit={guardarDiasPedido}>
              <h3 className="provider-section-title"><ProviderIcon type="days" />Días de pedido</h3>
              <ProviderFieldLabel icon="days" htmlFor="dias-pedido">Días separados por coma</ProviderFieldLabel>
              <input id="dias-pedido" className="form-control" value={daysInput} onChange={(event) => setDaysInput(event.target.value)} placeholder="Ej.: 1, 3, 5" />
              <div className="account-modal-actions"><button className="primary-button">Guardar días</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default Proveedores;
