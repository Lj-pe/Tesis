import { createContext, useContext, useEffect, useState } from 'react'
import apiClient from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('alanis_token'))
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('alanis_user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [isLoading, setIsLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }

    apiClient.get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => logout())
      .finally(() => setIsLoading(false))
  }, [token])

  async function login(credentials) {
    const { data } = await apiClient.post('/auth/login', credentials)
    localStorage.setItem('alanis_token', data.token)
    localStorage.setItem('alanis_user', JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
  }

  function logout() {
    localStorage.removeItem('alanis_token')
    localStorage.removeItem('alanis_user')
    setToken(null)
    setUser(null)
  }

  const value = {
    token,
    user,
    isLoading,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.rol?.nombre === 'Administrador',
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
