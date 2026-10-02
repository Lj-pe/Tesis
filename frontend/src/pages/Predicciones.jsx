function Predicciones() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Predicción de demanda</h1>

          <p>
            Análisis de demanda y recomendación de reposición.
          </p>
        </div>
      </div>

      <div className="panel prediction-selector">
        <div className="form-group">
          <label>Producto</label>

          <select className="form-control">
            <option>Cuaderno A4</option>
            <option>Lapicero Azul</option>
            <option>Mochila Escolar</option>
            <option>Cartuchera</option>
          </select>
        </div>

        <button className="primary-button">
          Analizar producto
        </button>
      </div>

      <div className="prediction-card">
        <div>
          <span className="prediction-label">
            Producto analizado
          </span>

          <h2>Cuaderno A4</h2>

          <p>
            Predicción estimada utilizando el historial de
            ventas del producto.
          </p>
        </div>

        <div className="risk-container">
          <span>Nivel de riesgo</span>

          <strong className="risk-high">
            ALTO
          </strong>
        </div>
      </div>

      <div className="prediction-metrics">
        <div className="stat-card">
          <span>Demanda estimada</span>
          <strong>58</strong>
          <small>Próximo periodo</small>
        </div>

        <div className="stat-card">
          <span>Stock actual</span>
          <strong>15</strong>
          <small>Unidades disponibles</small>
        </div>

        <div className="stat-card">
          <span>Stock de seguridad</span>
          <strong>10</strong>
          <small>Unidades mínimas</small>
        </div>

        <div className="stat-card">
          <span>Compra recomendada</span>
          <strong>53</strong>
          <small>Unidades</small>
        </div>
      </div>

      <div className="recommendation">
        <div className="recommendation-icon">
          !
        </div>

        <div>
          <strong>
            Recomendación del sistema
          </strong>

          <p>
            Existe riesgo de desabastecimiento. La demanda
            estimada es superior al stock disponible y se
            recomienda realizar una reposición de
            aproximadamente 53 unidades.
          </p>
        </div>
      </div>

      <div className="panel explanation-panel">
        <div className="panel-header">
          <h3>¿Cómo se obtuvo esta recomendación?</h3>
        </div>

        <div className="formula-box">
          <span>Compra recomendada</span>

          <strong>
            Demanda estimada + Stock de seguridad - Stock actual
          </strong>

          <div className="formula-result">
            58 + 10 - 15 = 53 unidades
          </div>
        </div>

        <p className="explanation-text">
          El producto presenta una demanda estimada de 58
          unidades. Actualmente existen 15 unidades disponibles
          y se desea mantener un stock de seguridad de 10
          unidades. Por ello, se recomienda adquirir
          aproximadamente 53 unidades.
        </p>
      </div>
    </>
  );
}

export default Predicciones;