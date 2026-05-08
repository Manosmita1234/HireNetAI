/**
 * pages/QuestionBank.jsx – Admin page to manage the library of interview questions.
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Brain, ArrowLeft, Plus, Trash2, BookOpen, Clock,
    ChevronDown, Filter, CheckCircle, Loader
} from 'lucide-react'
import { adminAPI } from '../services/api'

const CATEGORIES = ['all', 'general', 'behavioural', 'situational', 'motivational', 'technical']
const DIFFICULTIES = ['easy', 'medium', 'hard']

const diffColors = {
    easy:   'text-emerald-700 bg-emerald-50 border-emerald-200',
    medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    hard:   'text-red-700 bg-red-50 border-red-200',
}

const catColors = {
    general:      'bg-blue-50 text-blue-700',
    behavioural:  'bg-purple-50 text-purple-700',
    situational: 'bg-orange-50 text-orange-700',
    motivational: 'bg-pink-50 text-pink-700',
    technical:    'bg-cyan-50 text-cyan-700',
}

const defaultForm = {
    text: '',
    category: 'general',
    difficulty: 'medium',
    expected_duration_seconds: 90,
}

export default function QuestionBank() {
    const navigate = useNavigate()

    const [questions, setQuestions] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState(defaultForm)
    const [submitting, setSubmitting] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    const loadQuestions = async (cat = 'all') => {
        setLoading(true)
        try {
            const { data } = await adminAPI.getQuestionBank(cat !== 'all' ? cat : undefined)
            setQuestions(data.questions || [])
        } catch {
            toast.error('Failed to load questions')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadQuestions(selectedCategory) }, [selectedCategory])

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!form.text.trim()) { toast.error('Question text is required'); return }
        setSubmitting(true)
        try {
            await adminAPI.addQuestion(form)
            toast.success('Question added!')
            setForm(defaultForm)
            setShowForm(false)
            loadQuestions(selectedCategory)
        } catch {
            toast.error('Failed to add question')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this question permanently?')) return
        setDeletingId(id)
        try {
            await adminAPI.deleteQuestion(id)
            toast.success('Question deleted')
            setQuestions(q => q.filter(x => x.id !== id))
        } catch {
            toast.error('Failed to delete')
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50">

            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button onClick={() => navigate('/admin/dashboard')}
                        className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="font-bold text-slate-800">Question Bank</span>
                            <p className="text-xs text-slate-400">Manage interview questions</p>
                        </div>
                    </div>
                    <button onClick={() => setShowForm(s => !s)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 text-white">
                        <Plus className="w-4 h-4" /> Add Question
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <form onSubmit={handleAdd} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                                <h2 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                                    <Plus className="w-5 h-5 text-slate-400" /> Add New Question
                                </h2>

                                <div>
                                    <label className="text-sm text-slate-600 mb-1 block">Question Text *</label>
                                    <textarea
                                        value={form.text}
                                        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                                        rows={3}
                                        placeholder="Enter the interview question…"
                                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-sm text-slate-600 mb-1 block">Category</label>
                                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500">
                                            {CATEGORIES.filter(c => c !== 'all').map(c => (
                                                <option key={c} value={c} className="bg-white capitalize">{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm text-slate-600 mb-1 block">Difficulty</label>
                                        <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500">
                                            {DIFFICULTIES.map(d => (
                                                <option key={d} value={d} className="bg-white capitalize">{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm text-slate-600 mb-1 block">Duration (seconds)</label>
                                        <input type="number" min={30} max={300} step={10}
                                            value={form.expected_duration_seconds}
                                            onChange={e => setForm(f => ({ ...f, expected_duration_seconds: parseInt(e.target.value) || 90 }))}
                                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button type="button" onClick={() => { setShowForm(false); setForm(defaultForm) }}
                                        className="px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={submitting}
                                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all text-white">
                                        {submitting
                                            ? <><Loader className="w-4 h-4 animate-spin" /> Adding…</>
                                            : <><CheckCircle className="w-4 h-4" /> Add Question</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex gap-2 flex-wrap">
                    {CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${selectedCategory === cat
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50'
                                }`}>
                            {cat === 'all' ? 'All Categories' : cat}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4 text-sm text-slate-500">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <span>{loading ? '…' : questions.length} question{questions.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <span className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                ) : questions.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                        <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 mb-2">No questions found.</p>
                        <p className="text-slate-400 text-sm">
                            Use the "Seed Questions" button on the{' '}
                            <Link to="/admin/dashboard" className="text-blue-600 hover:text-blue-700 underline">admin dashboard</Link>
                            {' '}to add default questions, or click "Add Question" above.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {questions.map((q, i) => (
                                <motion.div key={q.id}
                                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.04 }}
                                    className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-start gap-4 group"
                                >
                                    <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 font-mono mt-0.5">
                                        {i + 1}
                                    </span>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-700 leading-relaxed text-sm mb-2">{q.text}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${catColors[q.category] || 'bg-slate-100 text-slate-600'}`}>
                                                {q.category}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${diffColors[q.difficulty] || ''}`}>
                                                {q.difficulty}
                                            </span>
                                            {q.expected_duration_seconds && (
                                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                                    <Clock className="w-3 h-3" /> {q.expected_duration_seconds}s
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button onClick={() => handleDelete(q.id)}
                                        disabled={deletingId === q.id}
                                        className="p-2 rounded-lg hover:bg-red-50 transition-colors text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 shrink-0">
                                        {deletingId === q.id
                                            ? <Loader className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />}
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}
