/**
 * pages/AdminDashboard.jsx – Admin candidate list with quick stats.
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Users, LogOut, Eye, Trash2, Database, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

const categoryColors = {
    'Highly Recommended': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    'Recommended': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    'Average': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    'Not Recommended': 'text-red-400 bg-red-400/10 border-red-400/30',
}

export default function AdminDashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [candidates, setCandidates] = useState([])
    const [filtered, setFiltered] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [sortField, setSortField] = useState('final_score')
    const [sortAsc, setSortAsc] = useState(false)
    const [seeding, setSeeding] = useState(false)

    const load = () => {
        adminAPI.listCandidates()
            .then(({ data }) => {
                setCandidates(data.candidates || [])
                setFiltered(data.candidates || [])
            })
            .catch(() => toast.error('Failed to load candidates'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    // Search filter
    useEffect(() => {
        const q = search.toLowerCase()
        const f = candidates.filter(c =>
            c.candidate_name?.toLowerCase().includes(q) ||
            c.candidate_email?.toLowerCase().includes(q) ||
            c.category?.toLowerCase().includes(q)
        )
        setFiltered(f)
    }, [search, candidates])

    const toggleSort = (field) => {
        if (sortField === field) setSortAsc(!sortAsc)
        else { setSortField(field); setSortAsc(false) }
    }

    const sorted = [...filtered].sort((a, b) => {
        const va = a[sortField] ?? 0, vb = b[sortField] ?? 0
        return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })

    const handleDelete = async (sessionId) => {
        if (!confirm('Delete this session permanently?')) return
        try {
            await adminAPI.deleteSession(sessionId)
            toast.success('Session deleted')
            load()
        } catch { toast.error('Failed to delete') }
    }

    const handleSeed = async () => {
        setSeeding(true)
        try {
            const { data } = await adminAPI.seedQuestions()
            toast.success(data.message)
        } catch { toast.error('Seeding failed') }
        finally { setSeeding(false) }
    }

    const SortIcon = ({ field }) =>
        sortField === field
            ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
            : <ChevronDown className="w-3 h-3 opacity-30" />

    // Stats
    const avgScore = candidates.length ? (candidates.reduce((s, c) => s + (c.final_score || 0), 0) / candidates.length).toFixed(1) : '—'
    const recommended = candidates.filter(c => ['Highly Recommended', 'Recommended'].includes(c.category)).length

    return (
        <div className="min-h-screen animated-bg text-white">
            {/* Navbar */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text">HireNetAI Admin</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSeed} disabled={seeding}
                            className="flex items-center gap-2 text-xs glass border border-surface-border px-3 py-2 rounded-lg hover:bg-surface-card transition-colors">
                            <Database className="w-3 h-3" /> {seeding ? 'Seeding…' : 'Seed Questions'}
                        </button>
                        <span className="text-brand-300 text-sm">{user?.full_name}</span>
                        <button onClick={() => { logout(); navigate('/') }}
                            className="text-brand-400 hover:text-white p-2 rounded-lg hover:bg-surface-card transition-colors">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                        { label: 'Total Candidates', value: candidates.length, icon: Users },
                        { label: 'Avg Score', value: avgScore + ' / 10', icon: Brain },
                        { label: 'Recommended', value: recommended, icon: ChevronUp },
                    ].map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                            className="glass rounded-2xl p-5 neon-border">
                            <div className="flex items-center gap-2 mb-2">
                                <s.icon className="w-4 h-4 text-brand-400" />
                                <span className="text-brand-300 text-sm">{s.label}</span>
                            </div>
                            <p className="text-3xl font-bold gradient-text">{s.value}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Search bar */}
                <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, email, or recommendation…"
                        className="w-full glass border border-surface-border rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors" />
                </div>

                {/* Table */}
                <div className="glass rounded-2xl neon-border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-border bg-surface-card/50">
                                {[
                                    { key: 'candidate_name', label: 'Candidate' },
                                    { key: 'status', label: 'Status' },
                                    { key: 'answer_count', label: 'Answers' },
                                    { key: 'final_score', label: 'Score' },
                                    { key: 'category', label: 'Verdict' },
                                ].map(col => (
                                    <th key={col.key}
                                        className="px-4 py-3 text-left text-brand-300 font-medium cursor-pointer hover:text-white transition-colors"
                                        onClick={() => toggleSort(col.key)}>
                                        <div className="flex items-center gap-1">{col.label} <SortIcon field={col.key} /></div>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-left text-brand-300 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-12">
                                    <span className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin inline-block" />
                                </td></tr>
                            ) : sorted.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-12 text-brand-400">No candidates found.</td></tr>
                            ) : sorted.map((c, i) => (
                                <motion.tr key={c.session_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                    className="border-b border-surface-border/50 hover:bg-surface-card/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{c.candidate_name}</div>
                                        <div className="text-brand-400 text-xs">{c.candidate_email}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs capitalize text-brand-300">{c.status?.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">{c.answer_count}</td>
                                    <td className="px-4 py-3">
                                        <span className="font-bold text-white">{c.final_score?.toFixed(1) || '—'}</span>
                                        <span className="text-brand-400"> /10</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${categoryColors[c.category] || 'text-brand-300 bg-brand-900/30 border-brand-700'}`}>
                                            {c.category || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Link to={`/admin/candidate/${c.session_id}`}
                                                className="p-2 rounded-lg glass hover:bg-brand-700/20 transition-colors text-brand-300 hover:text-white">
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            <button onClick={() => handleDelete(c.session_id)}
                                                className="p-2 rounded-lg glass hover:bg-red-700/20 transition-colors text-brand-300 hover:text-red-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
