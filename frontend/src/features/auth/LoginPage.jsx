import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(form)
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'No se pudo iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page login-layout">
      <section className="login-panel">
        <p className="brand-mark text-green section-spacing-small">Boutique Libreria Bazar</p>
        <h1 className="page-title section-spacing-small">Alanis</h1>
        <p className="muted-text section-spacing">Acceso a la gestión interna.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="username">Usuario o correo</label>
          <input id="username" className="form-control" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          <label className="form-label" htmlFor="password">Contraseña</label>
          <input id="password" type="password" className="form-control" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          {error && <div className="error-message" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
