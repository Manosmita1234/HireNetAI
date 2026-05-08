/**
 * pages/LoginPage.jsx – The sign-in form for both candidates and admin users.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
    const navigate = useNavigate()
    const { login } = useAuth()

    const [form, setForm] = useState({ email: '', password: '' })
    const [showPwd, setShowPwd] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            const { data } = await authAPI.login(form)
            login(data.access_token, { id: data.user_id, role: data.role, full_name: data.full_name })
            toast.success(`Welcome back, ${data.full_name}!`)
            navigate(data.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Login failed. Check your credentials.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 w-full max-w-md shadow-lg border border-slate-200"
            >
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-blue-600">Welcome Back</h1>
                    <p className="text-slate-400 text-sm mt-1">Sign in to HireNetAI</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm text-slate-600 mb-2">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="email" name="email" value={form.email} onChange={handleChange} required
                                placeholder="you@example.com"
                                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-600 mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type={showPwd ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange} required
                                placeholder="••••••••"
                                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                            <button type="button" onClick={() => setShowPwd(!showPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">
                                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <div className="text-right -mt-2">
                            <Link to="/forgot-password" className="text-blue-600 hover:text-blue-700 text-xs transition-colors">
                                Forgot password?
                            </Link>
                        </div>
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] text-white">
                        {loading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <><LogIn className="w-4 h-4" /> Sign In</>
                        )}
                    </button>
                </form>

                <p className="text-center text-slate-400 text-sm mt-6">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-blue-600 hover:text-blue-700 transition-colors font-medium">Sign up</Link>
                </p>
            </motion.div>
        </div>
    )
}
