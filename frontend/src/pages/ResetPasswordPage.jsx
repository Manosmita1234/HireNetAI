/**
 * pages/ResetPasswordPage.jsx – "Set a new password" page.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, AlertTriangle } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const token = searchParams.get('token')

    const [form, setForm] = useState({ new_password: '', confirm_password: '' })

    const [showPwd, setShowPwd] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        if (!token) {
            toast.error('Invalid reset link. Please request a new one.')
        }
    }, [token])

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async (e) => {
        e.preventDefault()

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
            await authAPI.resetPassword({ token, new_password: form.new_password })
            setSuccess(true)
            toast.success('Password updated! Redirecting to login…')
            setTimeout(() => navigate('/login'), 2500)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Reset failed. The link may have expired.')
        } finally {
            setLoading(false)
        }
    }

    if (!token) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
                <motion.div
                    initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-sm text-center"
                >
                    <div className="w-16 h-16 rounded-full bg-red-100 border border-red-200 flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Reset Link</h1>
                    <p className="text-slate-500 text-sm mb-6">
                        This link is missing a reset token. Please use the link from your email, or request a new one.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 py-2.5 px-6 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] text-sm text-white"
                    >
                        Request New Link
                    </Link>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-sm"
            >
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Set New Password</h1>
                    <p className="text-slate-500 text-sm mt-1">Choose a strong password for your account</p>
                </div>

                {success ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-4"
                    >
                        <div className="w-16 h-16 rounded-full bg-green-100 border border-green-200 flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-800 mb-2">Password Updated!</h2>
                        <p className="text-slate-500 text-sm">Redirecting you to the login page…</p>
                        <div className="mt-4 flex justify-center">
                            <span className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                    </motion.div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">

                        <div>
                            <label className="block text-sm text-slate-600 mb-2">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    id="new-password"
                                    type={showPwd ? 'text' : 'password'}
                                    name="new_password"
                                    value={form.new_password}
                                    onChange={handleChange}
                                    required
                                    autoFocus
                                    placeholder="At least 6 characters"
                                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                />
                                <button type="button" onClick={() => setShowPwd(!showPwd)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-slate-600 mb-2">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    id="confirm-password"
                                    type={showConfirm ? 'text' : 'password'}
                                    name="confirm_password"
                                    value={form.confirm_password}
                                    onChange={handleChange}
                                    required
                                    placeholder="Repeat your password"
                                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {form.confirm_password.length > 0 && (
                                <p className={`text-xs mt-1.5 ${form.new_password === form.confirm_password ? 'text-green-600' : 'text-red-600'}`}>
                                    {form.new_password === form.confirm_password ? '✓ Passwords match' : '✗ Passwords do not match'}
                                </p>
                            )}
                        </div>

                        <button
                            id="reset-password-btn"
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] text-white"
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <><ShieldCheck className="w-4 h-4" /> Update Password</>
                            )}
                        </button>
                    </form>
                )}

                <div className="mt-6 text-center">
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-blue-600 text-sm transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                    </Link>
                </div>
            </motion.div>
        </div>
    )
}
