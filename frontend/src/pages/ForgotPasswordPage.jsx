/**
 * pages/ForgotPasswordPage.jsx – Enter your email to receive a reset link.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Mail, ArrowLeft, CheckCircle, Send } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            await authAPI.forgotPassword({ email })
            setSubmitted(true)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-8 w-full max-w-md neon-border"
            >
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">Forgot Password?</h1>
                    <p className="text-brand-300 text-sm mt-1">No worries, we'll send you a reset link</p>
                </div>

                <AnimatePresence mode="wait">
                    {submitted ? (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-4"
                        >
                            <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-400" />
                            </div>
                            <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
                            <p className="text-brand-300 text-sm leading-relaxed">
                                If an account exists for <span className="text-white font-medium">{email}</span>,
                                you'll receive a password reset link shortly.
                            </p>
                            <p className="text-brand-500 text-xs mt-4">
                                Didn't get it? Check your spam folder or try again.
                            </p>
                            <button
                                onClick={() => { setSubmitted(false); setEmail('') }}
                                className="mt-5 text-brand-300 hover:text-white text-sm transition-colors underline underline-offset-2"
                            >
                                Try a different email
                            </button>
                        </motion.div>
                    ) : (
                        <motion.form
                            key="form"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onSubmit={handleSubmit}
                            className="space-y-5"
                        >
                            <div>
                                <label className="block text-sm text-brand-300 mb-2">Email address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                                    <input
                                        id="forgot-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                        placeholder="you@example.com"
                                        className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <button
                                id="send-reset-link-btn"
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02]"
                            >
                                {loading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <><Send className="w-4 h-4" /> Send Reset Link</>
                                )}
                            </button>
                        </motion.form>
                    )}
                </AnimatePresence>

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
