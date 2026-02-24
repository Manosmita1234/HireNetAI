/**
 * context/AuthContext.jsx – Global auth state via React Context.
 * Persists user data + JWT token to localStorage.
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
    })
    const [token, setToken] = useState(() => localStorage.getItem('token') || null)

    const login = useCallback((tokenValue, userData) => {
        localStorage.setItem('token', tokenValue)
        localStorage.setItem('user', JSON.stringify(userData))
        setToken(tokenValue)
        setUser(userData)
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setToken(null)
        setUser(null)
    }, [])

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAdmin: user?.role === 'admin' }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
