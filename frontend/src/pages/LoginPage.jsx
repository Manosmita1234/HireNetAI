/**
 * pages/LoginPage.jsx – The sign-in form for both candidates and admin users.
 *
 * Flow:
 *  1. User types their email and password
 *  2. On submit → calls POST /auth/login on the backend
 *  3. If successful → stores JWT token and user info via AuthContext.login()
 *  4. Redirects to the appropriate dashboard (admin vs candidate)
 *  5. If it fails → shows an error toast notification
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'  // Link = clickable <a> tag; useNavigate = programmatic redirect
import { motion } from 'framer-motion'               // animation library for smooth page entrance
import toast from 'react-hot-toast'                  // pop-up notifications (success/error banners)
import { Brain, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'  // icon library
import { authAPI } from '../services/api'             // pre-configured HTTP calls to the backend
import { useAuth } from '../context/AuthContext'      // gives access to the global login() function

export default function LoginPage() {
    const navigate = useNavigate()   // function to redirect the user to a different URL
    const { login } = useAuth()      // get the login() function from global auth state

    // React state: tracks current form field values
    // form is an object with email and password keys
    const [form, setForm] = useState({ email: '', password: '' })

    // showPwd: toggles between showing password as dots (••••) or plain text
    const [showPwd, setShowPwd] = useState(false)

    // loading: true while waiting for the server to respond → disables the submit button
    const [loading, setLoading] = useState(false)

    /**
     * handleChange – Updates the form state whenever the user types in a field.
     * Uses the input's `name` attribute (e.g. name="email") to know which field to update.
     * The spread `...form` keeps all other fields unchanged.
     */
    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    /**
     * handleSubmit – Runs when the user clicks "Sign In".
     * e.preventDefault() stops the page from refreshing (default browser form behavior).
     */
    const handleSubmit = async (e) => {
        e.preventDefault()   // prevent default HTML form submission (page reload)
        setLoading(true)     // show spinner on button
        try {
            // Send email + password to the backend, get back a JWT token + user info
            const { data } = await authAPI.login(form)

            // Save token and user to localStorage via AuthContext (persists on refresh)
            login(data.access_token, { id: data.user_id, role: data.role, full_name: data.full_name })

            toast.success(`Welcome back, ${data.full_name}!`)   // green success banner

            // Redirect to the right dashboard based on the user's role
            navigate(data.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard')
        } catch (err) {
            // Show the server's error message, or a generic fallback
            toast.error(err.response?.data?.detail || 'Login failed. Check your credentials.')
        } finally {
            setLoading(false)   // always re-enable the button, success or fail
        }
    }

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center px-4">
            {/* motion.div adds a fade-in + slide-up animation when the page loads */}
            <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-8 w-full max-w-md neon-border"
            >
                {/* ── Logo / Header ─────────────────────────────────────────── */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">Welcome Back</h1>
                    <p className="text-brand-300 text-sm mt-1">Sign in to HireNetAI</p>
                </div>

                {/* ── Login Form ────────────────────────────────────────────── */}
                <form onSubmit={handleSubmit} className="space-y-5">

                    {/* Email field */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Email</label>
                        <div className="relative">
                            {/* Mail icon positioned inside the input on the left */}
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                            <input
                                type="email" name="email" value={form.email} onChange={handleChange} required
                                placeholder="you@example.com"
                                className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Password field with show/hide toggle */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                            {/* type changes between "password" (dots) and "text" (plain) */}
                            <input
                                type={showPwd ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange} required
                                placeholder="••••••••"
                                className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                            />
                            {/* Eye icon button to toggle password visibility */}
                            <button type="button" onClick={() => setShowPwd(!showPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-white transition-colors">
                                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        {/* Forgot Password link – navigates to /forgot-password */}
                        <div className="text-right -mt-2">
                            <Link to="/forgot-password" className="text-brand-400 hover:text-white text-xs transition-colors">
                                Forgot password?
                            </Link>
                        </div>
                    </div>

                    {/* Submit button – disabled while request is in flight */}
                    <button type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02]">
                        {loading ? (
                            // Spinning circle shown while waiting for server response
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <><LogIn className="w-4 h-4" /> Sign In</>
                        )}
                    </button>
                </form>

                {/* Link to sign-up page for new users */}
                <p className="text-center text-brand-400 text-sm mt-6">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-brand-300 hover:text-white transition-colors font-medium">Sign up</Link>
                </p>
            </motion.div>
        </div>
    )
}
