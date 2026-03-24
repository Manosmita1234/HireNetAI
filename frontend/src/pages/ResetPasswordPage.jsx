/**
 * pages/ResetPasswordPage.jsx – "Set a new password" page.
 *
 * How it works:
 *  1. The user clicks the reset link from their email, e.g.:
 *       https://hirenetai.com/reset-password?token=abc123
 *  2. This page extracts the `token` from the URL query string.
 *  3. If no token is found → shows an "Invalid Link" error screen.
 *  4. User types a new password and confirms it.
 *  5. On submit → sends token + new password to POST /auth/reset-password.
 *  6. On success → shows a success screen and redirects to /login after 2.5 seconds.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
// useSearchParams lets us read URL query parameters like ?token=abc123
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, AlertTriangle } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()  // reads query params from the current URL

    // Extract the one-time reset token from the URL: /reset-password?token=<THIS>
    const token = searchParams.get('token')

    // Form state: the two password fields
    const [form, setForm] = useState({ new_password: '', confirm_password: '' })

    // Toggle visibility for each password field independently
    const [showPwd, setShowPwd] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const [loading, setLoading] = useState(false)   // true while waiting for server
    const [success, setSuccess] = useState(false)   // true after password is successfully updated

    // On page load: if there's no token in the URL, warn the user immediately
    useEffect(() => {
        if (!token) {
            toast.error('Invalid reset link. Please request a new one.')
        }
    }, [token])

    /**
     * handleChange – Updates the form state when the user types in either field.
     */
    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    /**
     * handleSubmit – Validates and submits the new password.
     */
    const handleSubmit = async (e) => {
        e.preventDefault()

        // Client-side validation: passwords must match and be at least 6 chars
        if (form.new_password !== form.confirm_password) {
            toast.error('Passwords do not match.')
            return
        }
        if (form.new_password.length < 6) {
            toast.error('Password must be at least 6 characters.')
            return
        }

        setLoading(true)
        try {
            // Send token + new_password to the backend; the token identifies who is resetting
            await authAPI.resetPassword({ token, new_password: form.new_password })
            setSuccess(true)   // switch to success UI
            toast.success('Password updated! Redirecting to login…')
            // Redirect to login after a brief delay so user can see the success message
            setTimeout(() => navigate('/login'), 2500)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Reset failed. The link may have expired.')
        } finally {
            setLoading(false)
        }
    }

    // ── Guard: show error screen if URL has no token ──────────────────────────
    if (!token) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center px-4">
                <motion.div
                    initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-3xl p-8 w-full max-w-md neon-border text-center"
                >
                    <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Invalid Reset Link</h1>
                    <p className="text-brand-300 text-sm mb-6">
                        This link is missing a reset token. Please use the link from your email, or request a new one.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 py-2.5 px-6 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] text-sm"
                    >
                        Request New Link
                    </Link>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-8 w-full max-w-md neon-border"
            >
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">Set New Password</h1>
                    <p className="text-brand-300 text-sm mt-1">Choose a strong password for your account</p>
                </div>

                {/* ── Two states: success message OR the password form ── */}
                {success ? (
                    /* Success screen – shown after the password is updated */
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-4"
                    >
                        <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck className="w-8 h-8 text-green-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white mb-2">Password Updated!</h2>
                        <p className="text-brand-300 text-sm">Redirecting you to the login page…</p>
                        <div className="mt-4 flex justify-center">
                            <span className="w-5 h-5 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                        </div>
                    </motion.div>
                ) : (
                    /* The password change form */
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* New Password field with show/hide toggle */}
                        <div>
                            <label className="block text-sm text-brand-300 mb-2">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                                <input
                                    id="new-password"
                                    type={showPwd ? 'text' : 'password'}
                                    name="new_password"
                                    value={form.new_password}
                                    onChange={handleChange}
                                    required
                                    autoFocus
                                    placeholder="At least 6 characters"
                                    className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                                />
                                <button type="button" onClick={() => setShowPwd(!showPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-white transition-colors">
                                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password field */}
                        <div>
                            <label className="block text-sm text-brand-300 mb-2">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                                <input
                                    id="confirm-password"
                                    type={showConfirm ? 'text' : 'password'}
                                    name="confirm_password"
                                    value={form.confirm_password}
                                    onChange={handleChange}
                                    required
                                    placeholder="Repeat your password"
                                    className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                                />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-white transition-colors">
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Live match indicator: turns green when passwords match */}
                            {form.confirm_password.length > 0 && (
                                <p className={`text-xs mt-1.5 ${form.new_password === form.confirm_password ? 'text-green-400' : 'text-red-400'}`}>
                                    {form.new_password === form.confirm_password ? '✓ Passwords match' : '✗ Passwords do not match'}
                                </p>
                            )}
                        </div>

                        {/* Submit button */}
                        <button
                            id="reset-password-btn"
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02]"
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <><ShieldCheck className="w-4 h-4" /> Update Password</>
                            )}
                        </button>
                    </form>
                )}

                {/* Back to login link */}
                <div className="mt-6 text-center">
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-brand-400 hover:text-white text-sm transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                    </Link>
                </div>
            </motion.div>
        </div>
    )
}
