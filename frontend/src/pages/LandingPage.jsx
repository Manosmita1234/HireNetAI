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

import { Link } from 'react-router-dom'   // Link renders a clickable nav link without page reload
import { motion } from 'framer-motion'    // framer-motion: handles smooth animation on scroll and load
import { Brain, Video, BarChart3, FileText, ChevronRight, Zap, Shield, Star } from 'lucide-react'

// ── Feature cards data ────────────────────────────────────────────────────────
// Each object defines one card in the "Features" section.
// Matching them as data (not hardcoded JSX) keeps the code DRY and easy to update.
const features = [
    { icon: Video,     title: 'AI Video Recording',  desc: 'Browser-based webcam recording with real-time feedback.' },
    { icon: Brain,     title: 'Emotion Intelligence', desc: 'DeepFace analysis of 60+ emotional micro-expressions per session.' },
    { icon: Zap,       title: 'Speech Analysis',      desc: 'WhisperX transcription with word-level timestamps and pause detection.' },
    { icon: BarChart3, title: 'LLM Scoring',          desc: 'GPT-powered evaluation of clarity, logic, confidence, and relevance.' },
    { icon: FileText,  title: 'PDF Reports',          desc: 'Instant downloadable reports with emotion graphs and trait analysis.' },
    { icon: Shield,    title: 'Secure & Private',     desc: 'JWT auth, role separation, and encrypted storage.' },
]

// ── Stats numbers ─────────────────────────────────────────────────────────────
// Displayed as big bold numbers in the "Stats" section.
const stats = [
    { value: '98%', label: 'Accuracy Rate' },
    { value: '3x',  label: 'Faster Screening' },
    { value: '10+', label: 'Personality Traits' },
    { value: '60s', label: 'Setup Time' },
]

export default function LandingPage() {
    return (
        <div className="min-h-screen animated-bg text-white overflow-hidden">

            {/* ── 1. Navbar ──────────────────────────────────────────────────── */}
            {/*
              sticky top-0 z-50: always stays at the top of the screen while scrolling.
              glass:             semi-transparent frosted-glass visual effect (CSS class).
            */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    {/* Logo: brain icon + "HireNetAI" text */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold gradient-text">HireNetAI</span>
                    </div>
                    {/* Navigation buttons */}
                    <div className="flex items-center gap-4">
                        <Link to="/login" className="text-sm text-brand-300 hover:text-white transition-colors px-4 py-2">Login</Link>
                        <Link to="/signup" className="text-sm bg-brand-600 hover:bg-brand-500 transition-colors px-5 py-2 rounded-xl font-medium">
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── 2. Hero Section ────────────────────────────────────────────── */}
            {/*
              The "hero" is the large first section that grabs the user's attention.
              It contains:
                - An announcement badge ("AI-Powered Interview Intelligence")
                - H1 headline
                - Description paragraph
                - Two CTA buttons
                - A mock interview UI showing score bars
            */}
            <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
                {/* motion.div: element animates from opacity 0 → 1 and y:30 → 0 on load */}
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>

                    {/* Announcement badge */}
                    <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full text-sm text-brand-300 mb-8 neon-border">
                        <Star className="w-4 h-4 text-yellow-400" />
                        AI-Powered Interview Intelligence Platform
                    </div>

                    {/* Main headline */}
                    <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
                        Hire Smarter with
                        <br />
                        <span className="gradient-text">AI-Driven Insights</span>
                    </h1>

                    {/* Subheadline description */}
                    <p className="text-lg md:text-xl text-brand-200 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Video interviews analyzed by emotion AI, speech intelligence, and LLM evaluation —
                        giving you objective candidate scores in minutes.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        {/* Primary button → goes to signup */}
                        <Link to="/signup"
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 shadow-lg shadow-brand-900/50 hover:shadow-brand-700/50 hover:scale-105">
                            Start Free Interview <ChevronRight className="w-5 h-5" />
                        </Link>
                        {/* Secondary button → goes to login */}
                        <Link to="/login"
                            className="inline-flex items-center gap-2 glass hover:bg-surface-card px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 neon-border">
                            Admin Login
                        </Link>
                    </div>
                </motion.div>

                {/* ── Mock Interview UI visual ─────────────────────────────── */}
                {/* This is purely decorative — it simulates what a real interview looks like */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
                    className="mt-16 glass rounded-3xl p-6 max-w-4xl mx-auto neon-border"
                >
                    <div className="grid grid-cols-3 gap-4 text-left">
                        {/* Left: fake video feed box */}
                        <div className="glass rounded-2xl p-4 col-span-2">
                            <div className="flex items-center gap-3 mb-3">
                                {/* Red blinking dot = "Recording" indicator */}
                                <div className="w-3 h-3 rounded-full bg-red-500 recording-active" />
                                <span className="text-sm text-brand-300 font-mono">Recording in progress…</span>
                            </div>
                            <div className="bg-black/40 rounded-xl aspect-video flex items-center justify-center">
                                <div className="text-center">
                                    <Video className="w-12 h-12 text-brand-400 mx-auto mb-2" />
                                    <p className="text-brand-300 text-sm">Live Video Feed</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: animated AI score bars */}
                        <div className="space-y-3">
                            {['Clarity: 8.5', 'Confidence: 7.2', 'Logic: 9.1', 'Relevance: 8.8'].map((item, i) => (
                                <motion.div key={i}
                                    // scaleX animation: bar "grows" from left to right on page load
                                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                    transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                                    className="glass rounded-xl p-3"
                                >
                                    <div className="text-xs text-brand-300 mb-1">{item.split(':')[0]}</div>
                                    <div className="h-2 bg-surface rounded-full overflow-hidden">
                                        {/* Width: score * 10 = percent (e.g. 8.5 → 85%) */}
                                        <div
                                            className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full"
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
            {/*
              whileInView: animation triggers when the element scrolls into view.
              viewport={{ once: true }}: animation only plays once, not on every scroll.
            */}
            <section className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((s, i) => (
                        <motion.div key={i}
                            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                            className="glass rounded-2xl p-6 text-center neon-border"
                        >
                            <div className="text-4xl font-black gradient-text mb-1">{s.value}</div>
                            <div className="text-brand-300 text-sm">{s.label}</div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── 4. Features Section ────────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 py-16">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold mb-4">Everything You Need to Hire Right</h2>
                    <p className="text-brand-300 text-lg">Powered by cutting-edge AI models working in concert.</p>
                </div>
                {/* Render each feature card from the `features` array defined above */}
                <div className="grid md:grid-cols-3 gap-6">
                    {features.map((f, i) => (
                        <motion.div key={i}
                            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                            className="glass rounded-2xl p-6 neon-border hover:bg-surface-card transition-all duration-300 group"
                        >
                            {/* Icon box – scales up on hover (group-hover:scale-110) */}
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-purple-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <f.icon className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                            <p className="text-brand-300 text-sm leading-relaxed">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── 5. Final CTA Section ───────────────────────────────────────── */}
            <section className="max-w-7xl mx-auto px-6 py-16">
                <div className="glass rounded-3xl p-12 text-center neon-border bg-gradient-to-r from-brand-950/50 to-purple-950/50">
                    <h2 className="text-4xl font-bold mb-4">Ready to Transform Your Hiring?</h2>
                    <p className="text-brand-300 mb-8 text-lg">Join thousands of companies using AI to make better hiring decisions.</p>
                    <Link to="/signup"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 px-10 py-4 rounded-2xl font-semibold text-xl transition-all duration-300 hover:scale-105 shadow-2xl shadow-brand-900/50">
                        Get Started Free <ChevronRight className="w-6 h-6" />
                    </Link>
                </div>
            </section>

            {/* ── 6. Footer ──────────────────────────────────────────────────── */}
            <footer className="border-t border-surface-border py-8 text-center text-brand-400 text-sm">
                © {new Date().getFullYear()} HireNetAI. Built with ❤️ and AI.
            </footer>
        </div>
    )
}
