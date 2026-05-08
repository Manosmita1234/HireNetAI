/**
 * pages/LandingPage.jsx – The public home page / marketing page for HireNetAI.
 *
 * This is the first page users see before logging in.
 * It is a purely visual, static page — no API calls or login required.
 *
 * Sections:
 *  1. Navbar      – Logo + Login/Get Started links
 *  2. Hero        – Eye-catching headline, description, CTA buttons, and a mock video UI
 *  3. Stats       – Four key metrics shown as numbers (e.g., "98% Accuracy")
 *  4. Features    – Six feature cards (video, emotion, speech, LLM, reports, security)
 *  5. CTA         – Final call-to-action "Get Started Free"
 *  6. Footer      – Copyright
 */

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Brain, Video, BarChart3, FileText, ChevronRight, Zap, Shield, Star } from 'lucide-react'

const features = [
    { icon: Video,     title: 'AI Video Recording',  desc: 'Browser-based webcam recording with real-time feedback.' },
    { icon: Brain,     title: 'Emotion Intelligence', desc: 'DeepFace analysis of 60+ emotional micro-expressions per session.' },
    { icon: Zap,       title: 'Speech Analysis',      desc: 'WhisperX transcription with word-level timestamps and pause detection.' },
    { icon: BarChart3, title: 'LLM Scoring',          desc: 'GPT-powered evaluation of clarity, logic, confidence, and relevance.' },
    { icon: FileText,  title: 'PDF Reports',          desc: 'Instant downloadable reports with emotion graphs and trait analysis.' },
    { icon: Shield,    title: 'Secure & Private',     desc: 'JWT auth, role separation, and encrypted storage.' },
]

const stats = [
    { value: '98%', label: 'Accuracy Rate' },
    { value: '3x',  label: 'Faster Screening' },
    { value: '10+', label: 'Personality Traits' },
    { value: '60s', label: 'Setup Time' },
]

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-white text-slate-800 overflow-hidden">

            {/* ── 1. Navbar ──────────────────────────────────────────────────── */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-blue-600">HireNetAI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link to="/login" className="text-sm text-slate-500 hover:text-blue-600 transition-colors px-4 py-2">Login</Link>
                        <Link to="/signup" className="text-sm bg-blue-600 hover:bg-blue-700 transition-colors text-white px-5 py-2 rounded-xl font-medium">
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── 2. Hero Section ────────────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>

                    <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-full text-sm text-blue-700 mb-8">
                        <Star className="w-4 h-4 text-yellow-500" />
                        AI-Powered Interview Intelligence Platform
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 text-slate-900">
                        Hire Smarter with
                        <br />
                        <span className="text-blue-600">AI-Driven Insights</span>
                    </h1>

                    <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Video interviews analyzed by emotion AI, speech intelligence, and LLM evaluation —
                        giving you objective candidate scores in minutes.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link to="/signup"
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-white">
                            Start Free Interview <ChevronRight className="w-5 h-5" />
                        </Link>
                        <Link to="/login"
                            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 text-slate-700">
                            Admin Login
                        </Link>
                    </div>
                </motion.div>

                {/* ── Mock Interview UI visual ─────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
                    className="mt-16 bg-white rounded-3xl p-6 max-w-4xl mx-auto shadow-lg border border-slate-200"
                >
                    <div className="grid grid-cols-3 gap-4 text-left">
                        <div className="bg-slate-50 rounded-2xl p-4 col-span-2">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-3 h-3 rounded-full bg-red-500 recording-active" />
                                <span className="text-sm text-slate-500 font-mono">Recording in progress…</span>
                            </div>
                            <div className="bg-slate-100 rounded-xl aspect-video flex items-center justify-center border border-slate-200">
                                <div className="text-center">
                                    <Video className="w-12 h-12 text-blue-400 mx-auto mb-2" />
                                    <p className="text-slate-500 text-sm">Live Video Feed</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {['Clarity: 8.5', 'Confidence: 7.2', 'Logic: 9.1', 'Relevance: 8.8'].map((item, i) => (
                                <motion.div key={i}
                                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                    transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                                    className="bg-slate-50 rounded-xl p-3 border border-slate-200"
                                >
                                    <div className="text-xs text-slate-500 mb-1">{item.split(':')[0]}</div>
                                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{ width: `${parseFloat(item.split(':')[1]) * 10}%` }}
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* ── 3. Stats Section ───────────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((s, i) => (
                        <motion.div key={i}
                            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                            className="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-200"
                        >
                            <div className="text-4xl font-black text-blue-600 mb-1">{s.value}</div>
                            <div className="text-slate-500 text-sm">{s.label}</div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── 4. Features Section ────────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 py-16">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold text-slate-900 mb-4">Everything You Need to Hire Right</h2>
                    <p className="text-slate-500 text-lg">Powered by cutting-edge AI models working in concert.</p>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                    {features.map((f, i) => (
                        <motion.div key={i}
                            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                            className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300 group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <f.icon className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">{f.title}</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── 5. Final CTA Section ───────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 py-16">
                <div className="bg-blue-50 rounded-3xl p-12 text-center border border-blue-100">
                    <h2 className="text-4xl font-bold text-slate-900 mb-4">Ready to Transform Your Hiring?</h2>
                    <p className="text-slate-500 mb-8 text-lg">Join thousands of companies using AI to make better hiring decisions.</p>
                    <Link to="/signup"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-10 py-4 rounded-2xl font-semibold text-xl transition-all duration-300 hover:scale-105 shadow-lg text-white">
                        Get Started Free <ChevronRight className="w-6 h-6" />
                    </Link>
                </div>
            </section>

            {/* ── 6. Footer ──────────────────────────────────────────────────── */}
            <footer className="border-t border-slate-200 py-8 text-center text-slate-400 text-sm">
                © {new Date().getFullYear()} HireNetAI. Built with ❤️ and AI.
            </footer>
        </div>
    )
}
