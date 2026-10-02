import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";

function Login() {
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
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

        <div className="login-info">
          <div className="brand">
            <div className="brand-icon">B</div>

            <div>
              <h2>Sistema de Gestión Comercial</h2>
              <span>Inventario y Predicción de Demanda</span>
            </div>
          </div>

          <div className="login-description">
            <h1>
              Gestión de Inventario
              <br />
              y Predicción de Demanda
            </h1>

            <p>
              Sistema web para la administración de inventario,
              análisis de ventas y generación de predicciones
              orientadas a la toma de decisiones.
            </p>

            <div className="feature-list">
              <div>✓ Control de inventario</div>
              <div>✓ Predicción de demanda</div>
              <div>✓ Recomendaciones de reposición</div>
              <div>✓ Análisis de rotación</div>
            </div>
          </div>
        </div>

        <div className="login-form-container">

          <form className="login-form" onSubmit={iniciarSesion}>

            <div className="login-header">
              <h2>Iniciar sesión</h2>
              <p>Ingrese sus credenciales para continuar.</p>
            </div>

            <label>Correo electrónico</label>

            <input
              type="email"
              placeholder="admin@gmail.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />

            <label>Contraseña</label>

            <input
              type="password"
              placeholder="Ingrese su contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button className="btn-login" type="submit">
              Iniciar sesión
            </button>

            <div className="login-test">
              <strong>Usuario demo</strong>
              <span>admin@gmail.com</span>
              <span>admin123</span>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
}

export default Login;