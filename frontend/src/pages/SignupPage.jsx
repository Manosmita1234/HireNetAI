/**
 * pages/SignupPage.jsx – Candidate registration.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Mail, Lock, User, UserPlus } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
    const navigate = useNavigate()
    const { login } = useAuth()
    const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'candidate' })
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
        setLoading(true)
        try {
            const { data } = await authAPI.signup(form)
            login(data.access_token, { id: data.user_id, role: data.role, full_name: data.full_name })
            toast.success(`Account created! Welcome, ${data.full_name}!`)
            navigate(data.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Signup failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen animated-bg flex items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-8 w-full max-w-md neon-border"
            >
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">Create Account</h1>
                    <p className="text-brand-300 text-sm mt-1">Join HireNetAI today</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Full name */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Full Name</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                            <input type="text" name="full_name" value={form.full_name} onChange={handleChange} required
                                placeholder="John Doe"
                                className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                            <input type="email" name="email" value={form.email} onChange={handleChange} required
                                placeholder="you@example.com"
                                className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                            <input type="password" name="password" value={form.password} onChange={handleChange} required
                                placeholder="Min. 6 characters"
                                className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
                        </div>
                    </div>

                    {/* Role */}
                    <div>
                        <label className="block text-sm text-brand-300 mb-2">Account Type</label>
                        <select name="role" value={form.role} onChange={handleChange}
                            className="w-full bg-surface-card border border-surface-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors">
                            <option value="candidate">Candidate</option>
                            <option value="admin">Admin / HR</option>
                        </select>
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] mt-2">
                        {loading
                            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><UserPlus className="w-4 h-4" /> Create Account</>}
                    </button>
                </form>

                <p className="text-center text-brand-400 text-sm mt-6">
                    Already have an account?{' '}
                    <Link to="/login" className="text-brand-300 hover:text-white transition-colors font-medium">Sign in</Link>
                </p>
            </motion.div>
        </div>
    )
}
