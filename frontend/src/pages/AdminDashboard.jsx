/**
 * pages/AdminDashboard.jsx – Admin-only page showing all candidate sessions.
 *
 * What this page does:
 *  1. Loads all candidate sessions from GET /admin/candidates
 *  2. Shows summary statistics (total candidates, average score, recommended count)
 *  3. Provides a search bar to filter by name, email, or verdict
 *  4. Lets the admin sort the table by any column
 *  5. Each row has:
 *     - Eye button → goes to CandidateDetail page for full breakdown
 *     - Trash button → permanently deletes the session
 *  6. "Seed Questions" button → adds default question bank to the database (one-time setup)
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Users, LogOut, Eye, Trash2, Database, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

const categoryColors = {
    'Highly Recommended': 'text-emerald-700 bg-emerald-50 border-emerald-200',
    'Recommended':        'text-blue-700 bg-blue-50 border-blue-200',
    'Average':            'text-yellow-700 bg-yellow-50 border-yellow-200',
    'Not Recommended':    'text-red-700 bg-red-50 border-red-200',
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
            : <ChevronDown className="w-3 h-3 text-slate-300" />


    const recommended = candidates.filter(c =>
        ['Highly Recommended', 'Recommended'].includes(c.category)
    ).length

    return (
        <div className="min-h-screen bg-slate-50">

            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-slate-800">HireNetAI Admin</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSeed} disabled={seeding}
                            className="flex items-center gap-2 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-slate-600">
                            <Database className="w-3 h-3" /> {seeding ? 'Seeding…' : 'Seed Questions'}
                        </button>
                        <span className="text-slate-500 text-sm">{user?.full_name}</span>
                        <button onClick={() => { logout(); navigate('/') }}
                            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-10">

                <div className="grid grid-cols-2 gap-6 mb-8 max-w-xl mx-auto">
                    {[
                        { label: 'Total Candidates', value: candidates.length, icon: Users },
                        { label: 'Recommended',      value: recommended,       icon: ChevronUp },
                    ].map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <s.icon className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-500 text-sm">{s.label}</span>
                            </div>
                            <p className="text-4xl font-bold text-slate-800">{s.value}</p>
                        </motion.div>
                    ))}
                </div>

                <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, email, or recommendation…"
                        className="w-full bg-white border border-slate-300 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                {[
                                    { key: 'candidate_name',  label: 'Candidate' },
                                    { key: 'status',          label: 'Status' },
                                    { key: 'answer_count',    label: 'Answers' },
                                    { key: 'final_score',     label: 'Score' },
                                    { key: 'category',        label: 'Verdict' },
                                ].map(col => (
                                    <th key={col.key}
                                        className="px-4 py-3 text-left text-slate-600 font-medium cursor-pointer hover:text-blue-600 transition-colors"
                                        onClick={() => toggleSort(col.key)}>
                                        <div className="flex items-center gap-1">{col.label} <SortIcon field={col.key} /></div>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-left text-slate-600 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-12">
                                    <span className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin inline-block" />
                                </td></tr>
                            ) : sorted.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No candidates found.</td></tr>
                            ) : sorted.map((c, i) => (
                                <motion.tr key={c.session_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{c.candidate_name}</div>
                                        <div className="text-slate-400 text-xs">{c.candidate_email}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs capitalize text-slate-500">{c.status?.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-600">{c.answer_count}</td>
                                    <td className="px-4 py-3">
                                        <span className="font-bold text-slate-800">{c.final_score?.toFixed(1) || '—'}</span>
                                        <span className="text-slate-400"> /10</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${categoryColors[c.category] || 'text-slate-600 bg-slate-100 border-slate-200'}`}>
                                            {c.category || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Link to={`/admin/candidate/${c.session_id}`}
                                                className="p-2 rounded-lg hover:bg-blue-50 transition-colors text-slate-400 hover:text-blue-600">
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                            <button onClick={() => handleDelete(c.session_id)}
                                                className="p-2 rounded-lg hover:bg-red-50 transition-colors text-slate-400 hover:text-red-600">
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
