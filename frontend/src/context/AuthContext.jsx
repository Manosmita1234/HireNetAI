/**
 * context/AuthContext.jsx – Global authentication state for the whole app.
 *
 * WHY THIS EXISTS:
 *   Many pages need to know "Is the user logged in? What is their name/role?"
 *   Instead of passing this information through every component (prop-drilling),
 *   we store it in a React Context so ANY component can access it directly.
 *
 * HOW IT WORKS:
 *   - On login  → saves the JWT token and user info to localStorage (survives page refresh)
 *   - On logout → clears localStorage and resets state
 *   - On page load → reads from localStorage to restore the previous login session
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

// Create the context object. Think of it as a "broadcast channel" for auth state.
const AuthContext = createContext(null)

/**
 * AuthProvider – Wraps the whole app (in App.jsx) and provides auth state
 * to every child component via React Context.
 *
 * @param {ReactNode} children – all the child components rendered inside this provider
 */
export function AuthProvider({ children }) {
    // ── Restore user from localStorage on first render ────────────────────
    // useState accepts a function; it runs once and provides the initial value.
    const [user, setUser] = useState(() => {
        try {
            // localStorage.getItem returns a JSON string like '{"id":"…","role":"candidate"}'
            return JSON.parse(localStorage.getItem('user'))
        } catch {
            return null  // fallback if JSON is corrupted
        }
    })

    // ── Restore JWT token from localStorage on first render ───────────────
    const [token, setToken] = useState(() => localStorage.getItem('token') || null)

    /**
     * login – Called after a successful /auth/login or /auth/signup API response.
     *
     * @param {string} tokenValue – The JWT token returned by the backend
     * @param {object} userData   – User object { id, full_name, role }
     */
    const login = useCallback((tokenValue, userData) => {
        // Persist to localStorage so the session survives a page refresh
        localStorage.setItem('token', tokenValue)
        localStorage.setItem('user', JSON.stringify(userData))

        // Update React state so all subscribed components re-render immediately
        setToken(tokenValue)
        setUser(userData)
    }, [])  // empty deps → function reference never changes (stable for useEffect)

    /**
     * logout – Clears all auth data and forces the user back to guest state.
     */
    const logout = useCallback(() => {
        // Remove from localStorage so the session is not restored on next page load
        localStorage.removeItem('token')
        localStorage.removeItem('user')

        // Reset React state → all pages will see user = null and redirect accordingly
        setToken(null)
        setUser(null)
    }, [])

    return (
        // Provide these values to ALL child components via the context
        <AuthContext.Provider value={{
            user,           // the logged-in user object (or null)
            token,          // the JWT Bearer token string (or null)
            login,          // call this after a successful login
            logout,         // call this to sign out
            isAdmin: user?.role === 'admin',  // convenience shortcut for admin checks
        }}>
            {children}
        </AuthContext.Provider>
    )
}

/**
 * useAuth – Custom hook that any component can call to access auth state.
 *
 * Usage example inside any page:
 *   const { user, logout, isAdmin } = useAuth()
 *
 * Throws an error if called outside of <AuthProvider> (safety guard).
 */
export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
