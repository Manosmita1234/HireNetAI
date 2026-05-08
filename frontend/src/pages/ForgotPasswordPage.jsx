/**
 * pages/ForgotPasswordPage.jsx – "I forgot my password" page.
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 w-full max-w-md border border-slate-200 shadow-sm"
            >
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Forgot Password?</h1>
                    <p className="text-slate-500 text-sm mt-1">No worries, we'll send you a reset link</p>
                </div>

                <AnimatePresence mode="wait">
                    {submitted ? (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-4"
                        >
                            <div className="w-16 h-16 rounded-full bg-green-100 border border-green-200 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-800 mb-2">Check your inbox</h2>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                If an account exists for <span className="text-slate-700 font-medium">{email}</span>,
                                you'll receive a password reset link shortly.
                            </p>
                            <p className="text-slate-400 text-xs mt-4">
                                Didn't get it? Check your spam folder or try again.
                            </p>
                            <button
                                onClick={() => { setSubmitted(false); setEmail('') }}
                                className="mt-5 text-blue-600 hover:text-blue-700 text-sm transition-colors underline underline-offset-2"
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
                                <label className="block text-sm text-slate-600 mb-2">Email address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        id="forgot-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                        placeholder="you@example.com"
                                        className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <button
                                id="send-reset-link-btn"
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] text-white"
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
                        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-blue-600 text-sm transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                    </Link>
                </div>
            </motion.div>
        </div>
    )
}
