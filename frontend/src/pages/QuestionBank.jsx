/**
 * pages/QuestionBank.jsx – Admin page to manage the library of interview questions.
 *
 * Route:  /admin/question-bank
 * Access: Admin only
 *
 * What admins can do here:
 *  1. View all interview questions in the database
 *  2. Filter questions by category (General, Behavioural, Situational, etc.)
 *  3. Add a new custom question via a collapsible form
 *  4. Delete any question by clicking the trash icon
 *
 * If the question bank is empty, the admin is prompted to use the "Seed Questions"
 * button on the Admin Dashboard, which populates a default set of questions.
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'  // for smooth form show/hide animation
import toast from 'react-hot-toast'
import {
    Brain, ArrowLeft, Plus, Trash2, BookOpen, Clock,
    ChevronDown, Filter, CheckCircle, Loader
} from 'lucide-react'
import { adminAPI } from '../services/api'

// Available filter categories (used for both the filter tabs and the "Add Question" form dropdown)
const CATEGORIES = ['all', 'general', 'behavioural', 'situational', 'motivational', 'technical']
const DIFFICULTIES = ['easy', 'medium', 'hard']

// Tailwind class maps for the colored difficulty badges
const diffColors = {
    easy:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    hard:   'text-red-400 bg-red-400/10 border-red-400/30',
}

// Tailwind class maps for the colored category labels
const catColors = {
    general:      'bg-blue-500/20 text-blue-300',
    behavioural:  'bg-purple-500/20 text-purple-300',
    situational:  'bg-orange-500/20 text-orange-300',
    motivational: 'bg-pink-500/20 text-pink-300',
    technical:    'bg-cyan-500/20 text-cyan-300',
}

// Default values for the "Add Question" form (reset to these after each submission)
const defaultForm = {
    text: '',
    category: 'general',
    difficulty: 'medium',
    expected_duration_seconds: 90,  // how many seconds candidates are expected to answer in
}

export default function QuestionBank() {
    const navigate = useNavigate()

    const [questions, setQuestions] = useState([])    // full list of questions from the server
    const [loading, setLoading] = useState(true)      // true while fetching
    const [selectedCategory, setSelectedCategory] = useState('all')  // active filter tab
    const [showForm, setShowForm] = useState(false)   // controls whether the "Add Question" form is visible
    const [form, setForm] = useState(defaultForm)     // form field values
    const [submitting, setSubmitting] = useState(false)  // true while "Add Question" request is in flight
    const [deletingId, setDeletingId] = useState(null)   // ID of the question currently being deleted

    /**
     * loadQuestions – Fetches questions from the backend, optionally filtered by category.
     * "all" means no filter, so all questions are returned.
     */
    const loadQuestions = async (cat = 'all') => {
        setLoading(true)
        try {
            // If cat is 'all', pass undefined so the API returns unfiltered results
            const { data } = await adminAPI.getQuestionBank(cat !== 'all' ? cat : undefined)
            setQuestions(data.questions || [])
        } catch {
            toast.error('Failed to load questions')
        } finally {
            setLoading(false)
        }
    }

    // Re-fetch questions whenever the selected category tab changes
    useEffect(() => { loadQuestions(selectedCategory) }, [selectedCategory])

    /**
     * handleAdd – Submits the "Add Question" form to the backend.
     */
    const handleAdd = async (e) => {
        e.preventDefault()  // prevent page reload
        if (!form.text.trim()) { toast.error('Question text is required'); return }
        setSubmitting(true)
        try {
            await adminAPI.addQuestion(form)  // POST /admin/questions
            toast.success('Question added!')
            setForm(defaultForm)      // reset form fields
            setShowForm(false)        // hide the form
            loadQuestions(selectedCategory)  // refresh the list
        } catch {
            toast.error('Failed to add question')
        } finally {
            setSubmitting(false)
        }
    }

    /**
     * handleDelete – Permanently deletes a question after browser confirmation.
     * While deleting, the trash icon for that question shows a spinner.
     */
    const handleDelete = async (id) => {
        if (!confirm('Delete this question permanently?')) return  // native browser dialog
        setDeletingId(id)  // mark this row as "being deleted" (shows spinner)
        try {
            await adminAPI.deleteQuestion(id)  // DELETE /admin/questions/:id
            toast.success('Question deleted')
            // Optimistically remove from local state (no need to re-fetch)
            setQuestions(q => q.filter(x => x.id !== id))
        } catch {
            toast.error('Failed to delete')
        } finally {
            setDeletingId(null)  // clear spinner
        }
    }

    return (
        <div className="min-h-screen animated-bg text-white">

            {/* ── Sticky Navbar ──────────────────────────────────────────────── */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    {/* Back to admin dashboard */}
                    <button onClick={() => navigate('/admin/dashboard')}
                        className="text-brand-400 hover:text-white p-2 rounded-lg hover:bg-surface-card transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="font-bold gradient-text">Question Bank</span>
                            <p className="text-xs text-brand-400">Manage interview questions</p>
                        </div>
                    </div>
                    {/* Toggle the add-question form: click again to hide it */}
                    <button onClick={() => setShowForm(s => !s)}
                        className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105">
                        <Plus className="w-4 h-4" /> Add Question
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

                {/* ── Add Question Form ──────────────────────────────────────── */}
                {/*
                  AnimatePresence: handles smooth mount/unmount animation.
                  When showForm is true → the form slides down (height 0 → auto).
                  When showForm is false → the form slides back up and disappears.
                */}
                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <form onSubmit={handleAdd} className="glass rounded-2xl p-6 neon-border space-y-4">
                                <h2 className="font-semibold text-lg flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-brand-400" /> Add New Question
                                </h2>

                                {/* Question text textarea */}
                                <div>
                                    <label className="text-sm text-brand-300 mb-1 block">Question Text *</label>
                                    <textarea
                                        value={form.text}
                                        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                                        rows={3}
                                        placeholder="Enter the interview question…"
                                        className="w-full glass border border-surface-border rounded-xl px-4 py-3 text-sm text-white placeholder-brand-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none transition-colors"
                                    />
                                </div>

                                {/* Three config dropdowns in a row */}
                                <div className="grid grid-cols-3 gap-4">
                                    {/* Category picker */}
                                    <div>
                                        <label className="text-sm text-brand-300 mb-1 block">Category</label>
                                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="w-full glass border border-surface-border rounded-xl px-3 py-2.5 text-sm text-white bg-transparent focus:outline-none focus:border-brand-500">
                                            {/* 'all' is excluded since it's only for filtering, not for adding */}
                                            {CATEGORIES.filter(c => c !== 'all').map(c => (
                                                <option key={c} value={c} className="bg-gray-900 capitalize">{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Difficulty picker */}
                                    <div>
                                        <label className="text-sm text-brand-300 mb-1 block">Difficulty</label>
                                        <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                                            className="w-full glass border border-surface-border rounded-xl px-3 py-2.5 text-sm text-white bg-transparent focus:outline-none focus:border-brand-500">
                                            {DIFFICULTIES.map(d => (
                                                <option key={d} value={d} className="bg-gray-900 capitalize">{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Duration input: how many seconds the candidate should answer in */}
                                    <div>
                                        <label className="text-sm text-brand-300 mb-1 block">Duration (seconds)</label>
                                        <input type="number" min={30} max={300} step={10}
                                            value={form.expected_duration_seconds}
                                            onChange={e => setForm(f => ({ ...f, expected_duration_seconds: parseInt(e.target.value) || 90 }))}
                                            className="w-full glass border border-surface-border rounded-xl px-3 py-2.5 text-sm text-white bg-transparent focus:outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                {/* Form action buttons */}
                                <div className="flex gap-3 justify-end">
                                    <button type="button" onClick={() => { setShowForm(false); setForm(defaultForm) }}
                                        className="px-4 py-2 text-sm glass border border-surface-border rounded-xl hover:bg-surface-card transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={submitting}
                                        className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all">
                                        {submitting
                                            ? <><Loader className="w-4 h-4 animate-spin" /> Adding…</>
                                            : <><CheckCircle className="w-4 h-4" /> Add Question</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Category Filter Tabs ───────────────────────────────────── */}
                {/* Clicking a tab sets selectedCategory, which triggers a re-fetch via useEffect */}
                <div className="flex gap-2 flex-wrap">
                    {CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${selectedCategory === cat
                                ? 'bg-brand-600 text-white'        // active tab
                                : 'glass border border-surface-border text-brand-300 hover:text-white hover:bg-surface-card'  // inactive tab
                                }`}>
                            {cat === 'all' ? 'All Categories' : cat}
                        </button>
                    ))}
                </div>

                {/* ── Question Count ────────────────────────────────────────── */}
                <div className="flex items-center gap-4 text-sm text-brand-300">
                    <BookOpen className="w-4 h-4 text-brand-400" />
                    {/* Shows '…' while loading, then the actual count */}
                    <span>{loading ? '…' : questions.length} question{questions.length !== 1 ? 's' : ''}</span>
                </div>

                {/* ── Question List ─────────────────────────────────────────── */}
                {loading ? (
                    /* Loading spinner */
                    <div className="flex justify-center py-16">
                        <span className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                    </div>
                ) : questions.length === 0 ? (
                    /* Empty state: no questions found in this category */
                    <div className="glass rounded-2xl p-12 text-center">
                        <BookOpen className="w-12 h-12 text-brand-600 mx-auto mb-4 opacity-50" />
                        <p className="text-brand-300 mb-2">No questions found.</p>
                        <p className="text-brand-500 text-sm">
                            Use the "Seed Questions" button on the{' '}
                            <Link to="/admin/dashboard" className="text-brand-400 hover:text-white underline">admin dashboard</Link>
                            {' '}to add default questions, or click "Add Question" above.
                        </p>
                    </div>
                ) : (
                    /* List of question cards */
                    <div className="space-y-3">
                        <AnimatePresence>
                            {questions.map((q, i) => (
                                // motion.div with exit animation (slides left when deleted)
                                <motion.div key={q.id}
                                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.04 }}
                                    className="glass rounded-xl p-4 neon-border flex items-start gap-4 group"
                                >
                                    {/* Question number badge */}
                                    <span className="w-7 h-7 rounded-lg bg-brand-600/30 text-brand-300 text-xs flex items-center justify-center shrink-0 font-mono mt-0.5">
                                        {i + 1}
                                    </span>

                                    {/* Question text + metadata tags */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white leading-relaxed text-sm mb-2">{q.text}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Category badge */}
                                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${catColors[q.category] || 'bg-brand-900/40 text-brand-300'}`}>
                                                {q.category}
                                            </span>
                                            {/* Difficulty badge */}
                                            <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${diffColors[q.difficulty] || ''}`}>
                                                {q.difficulty}
                                            </span>
                                            {/* Duration in seconds */}
                                            {q.expected_duration_seconds && (
                                                <span className="flex items-center gap-1 text-xs text-brand-400">
                                                    <Clock className="w-3 h-3" /> {q.expected_duration_seconds}s
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Delete button (only visible on hover via group-hover) */}
                                    <button onClick={() => handleDelete(q.id)}
                                        disabled={deletingId === q.id}
                                        className="p-2 rounded-lg glass hover:bg-red-700/20 transition-colors text-brand-400 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0">
                                        {deletingId === q.id
                                            ? <Loader className="w-4 h-4 animate-spin" />  // spinner while deleting
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
