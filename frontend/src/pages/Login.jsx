import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";

function Login() {
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");

  const iniciarSesion = async (e) => {
    e.preventDefault();

    setError("");

    if (!correo.includes("@")) {
      setError("Ingrese un correo electrónico válido.");
      return;
    }

    try {
      const payload = { email: correo, password };
      const data = await apiClient.post("/auth/login", payload, { skipAuth: true });

      localStorage.setItem("alanis_token", data.token);
      localStorage.setItem("alanis_user", JSON.stringify(data.user));

      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Correo o contraseña incorrectos.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <section className="login-showcase">
          <div className="login-showcase-content">
            <div className="login-brand">
              <div className="login-brand-mark" aria-hidden="true">
                <svg viewBox="0 0 52 52" fill="none">
                  <path d="M7 43 24 8c.8-1.7 3.2-1.7 4 0l17 35H34l-8-17-8 17H7Z" fill="currentColor" />
                  <path d="m17 24 9 8 9-8-4-8-5 6-5-6-4 8Z" fill="#123b3e" />
                  <path d="m18 43 8-17 8 17" stroke="#91fff0" strokeWidth="2" />
                </svg>
              </div>
              <div className="login-brand-copy">
                <strong>ALANIS</strong>
                <span>BOUTIQUE LIBRERÍA BAZAR</span>
              </div>
            </div>

            <div className="login-accent-line" aria-hidden="true" />

            <div className="login-description">
              <h1>
                Sistema de
                <br />
                <span>Gestión Comercial</span>
              </h1>
              <p>
                Controla productos, inventario, compras y ventas de Boutique
                Librería Bazar Alanis desde un solo lugar.
              </p>
            </div>

            <div className="login-feature-grid">
              <article className="login-feature-card">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="m16 4 11 6v12l-11 6-11-6V10l11-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="m5 10 11 6 11-6M16 16v12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </span>
                <span><strong>Inventario</strong><small>Control de productos y stock</small></span>
              </article>
              <article className="login-feature-card">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M4 6h3l3 16h15l3-11H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="26" r="2" fill="currentColor" />
                    <circle cx="23" cy="26" r="2" fill="currentColor" />
                  </svg>
                </span>
                <span><strong>Ventas y compras</strong><small>Registro y seguimiento</small></span>
              </article>
              <article className="login-feature-card">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="currentColor">
                    <path d="M5 17h6v10H5zM13 9h6v18h-6zM21 4h6v23h-6z" />
                  </svg>
                </span>
                <span><strong>Reportes</strong><small>Información organizada</small></span>
              </article>
              <article className="login-feature-card">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="currentColor">
                    <circle cx="12" cy="11" r="5" />
                    <circle cx="23" cy="13" r="4" />
                    <path d="M2 27c0-5.2 4.3-9 10-9s10 3.8 10 9H2ZM20 20c5-1.8 10 1.1 10 6v1h-6c0-2.8-1.5-5.3-4-7Z" />
                  </svg>
                </span>
                <span><strong>Usuarios y roles</strong><small>Acceso seguro</small></span>
              </article>
            </div>

            <div className="login-showcase-footer">
              <div className="login-accent-line" aria-hidden="true" />
              <div className="login-module-list">
                <span>
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="m10 6 6 3 6-3 6 4-3 6-3-2v12H10V14l-3 2-3-6 6-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M13 9c0 2 1 3 3 3s3-1 3-3" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  Ropa y textiles
                </span>
                <span>
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M3.5 7.5c5-2 9-.7 12.5 2v17c-3.5-2.7-7.5-4-12.5-2v-17ZM28.5 7.5c-5-2-9-.7-12.5 2v17c3.5-2.7 7.5-4 12.5-2v-17Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                  Librería
                </span>
                <span>
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M8 4h16v24H8zM12 9h8M12 14h8M12 19h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="m5 8 2-2m-2 8 2-2m-2 8 2-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  Papelería
                </span>
                <span>
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M4 11h24v16H4zM2.5 7h27v5h-27zM16 7v20" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M16 7c-7 0-8-5-4-5 2.5 0 4 5 4 5Zm0 0c7 0 8-5 4-5-2.5 0-4 5-4 5Z" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  Bazar y accesorios
                </span>
                <span>
                  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M6 10h20l-1 18H7L6 10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M11 12V8a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  Otros productos
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-form-side">
          <div className="login-form-card">
            <form className="login-form" onSubmit={iniciarSesion}>
              <div className="login-header">
                <h2>Iniciar sesión</h2>
                <p>Ingrese sus credenciales para continuar.</p>
              </div>

              <div className="login-field">
                <label htmlFor="login-email">Correo electrónico</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="Ingrese su correo electrónico"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Contraseña</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={mostrarPassword ? "text" : "password"}
                    placeholder="Ingrese su contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    className="login-password-toggle"
                    type="button"
                    aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    onClick={() => setMostrarPassword((visible) => !visible)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      {mostrarPassword ? (
                        <>
                          <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" />
                          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
                        </>
                      ) : (
                        <>
                          <path d="M3 3 21 21M10.6 6.2A10.5 10.5 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15 15 0 0 1-3.1 3.5M6.2 6.8C3.8 8.4 2.5 12 2.5 12s3.3 6 9.5 6c1.3 0 2.4-.3 3.4-.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}

              <button className="btn-login" type="submit">
                <span>Iniciar sesión</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="login-security-note">
                <span aria-hidden="true">
                  <svg viewBox="0 0 28 28" fill="none">
                    <path d="M14 3 23 6v7c0 5.7-3.7 9.7-9 12-5.3-2.3-9-6.3-9-12V6l9-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M11 14h6m-3-3v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </span>
                <p>Sistema interno de<br />Boutique Librería Bazar Alanis</p>
              </div>
            </form>
          </div>
        </section>

      </div>
    </div>
  );
}

export default Login;