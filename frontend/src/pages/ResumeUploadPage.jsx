/**
 * pages/ResumeUploadPage.jsx – Dedicated full-page resume upload experience.
 */

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Brain, LogOut, Upload, FileText, CheckCircle,
    AlertCircle, X, ArrowRight, Sparkles,
} from 'lucide-react'
import { resumeAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ResumeUploadPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [file, setFile] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [status, setStatus] = useState('idle')
    const [errorMsg, setErrorMsg] = useState('')
    const fileInputRef = useRef(null)

    const pickFile = useCallback((picked) => {
        if (!picked) return
        if (!picked.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Only PDF files are accepted.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) {
            toast.error('File must be under 10 MB.')
            return
        }
        setFile(picked)
        setStatus('idle')
        setErrorMsg('')
    }, [])

    const onFileInput = (e) => pickFile(e.target.files?.[0])

    const onDrop = useCallback((e) => {
        e.preventDefault()
        setDragging(false)
        pickFile(e.dataTransfer.files?.[0])
    }, [pickFile])

    const onDragOver = (e) => { e.preventDefault(); setDragging(true) }

    const onDragLeave = () => setDragging(false)

    const clearFile = () => {
        setFile(null)
        setStatus('idle')
        setErrorMsg('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleUpload = async () => {
        if (!file) return
        setStatus('uploading')
        setErrorMsg('')
        try {
            const formData = new FormData()
            formData.append('resume', file)
            const { data } = await resumeAPI.uploadResume(formData)
            setStatus('success')
            toast.success(`${data.questions_count} tailored questions generated!`)
            setTimeout(() => {
                navigate(`/candidate/interview/${data.session_id}`)
            }, 1200)
        } catch (err) {
            const detail = err.response?.data?.detail || 'Upload failed. Please try again.'
            setErrorMsg(detail)
            setStatus('error')
            toast.error(detail)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50">

            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-slate-800">HireNetAI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-slate-500 text-sm">Hi, {user?.full_name}</span>
                        <button
                            onClick={() => { logout(); navigate('/') }}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-6 py-14">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-5">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">Upload Your Resume</h1>
                    <p className="text-slate-500 text-sm max-w-md mx-auto">
                        Our AI will read your resume and craft personalized interview questions
                        tailored to your specific skills and experience.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm"
                >
                    <div
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onClick={() => !file && fileInputRef.current?.click()}
                        className={`
                            relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer
                            flex flex-col items-center justify-center gap-4 p-10
                            ${dragging
                                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                                : file
                                    ? 'border-blue-400 bg-blue-50 cursor-default'
                                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                            }
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={onFileInput}
                        />

                        <AnimatePresence mode="wait">
                            {!file ? (
                                <motion.div
                                    key="prompt"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <Upload className="w-10 h-10 text-blue-600 mx-auto mb-3" />
                                    <p className="text-slate-700 font-medium">Drag & drop your PDF here</p>
                                    <p className="text-slate-400 text-sm mt-1">or click to browse</p>
                                    <p className="text-slate-400 text-xs mt-3">PDF only · max 10 MB</p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="file"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-4 w-full"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-800 truncate">{file.name}</p>
                                        <p className="text-slate-400 text-sm">{formatBytes(file.size)}</p>
                                    </div>
                                    {status !== 'uploading' && status !== 'success' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); clearFile() }}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <AnimatePresence>
                        {status === 'error' && errorMsg && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm"
                            >
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {errorMsg}
                            </motion.div>
                        )}
                        {status === 'success' && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm"
                            >
                                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                Personalized questions ready! Starting your interview…
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="mt-6 flex items-center gap-4">
                        <button
                            onClick={() => navigate('/candidate/dashboard')}
                            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-all duration-200 text-sm font-medium bg-white"
                        >
                            Back
                        </button>

                        <button
                            onClick={handleUpload}
                            disabled={!file || status === 'uploading' || status === 'success'}
                            className="flex-[2] inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-[1.02] text-white"
                        >
                            {status === 'uploading' ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Analysing Resume…
                                </>
                            ) : status === 'success' ? (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Starting Interview…
                                </>
                            ) : (
                                <>
                                    <ArrowRight className="w-4 h-4" />
                                    Generate Questions & Start
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mt-6 grid grid-cols-3 gap-4 text-center"
                >
                    {[
                        { icon: '🔒', label: 'Private & Secure', sub: 'Resume never stored' },
                        { icon: '🤖', label: 'AI-Powered',       sub: 'GPT-4o-mini analysis' },
                        { icon: '⚡', label: 'Instant',          sub: 'Questions in seconds' },
                    ].map(({ icon, label, sub }) => (
                        <div key={label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                            <span className="text-2xl">{icon}</span>
                            <p className="text-slate-700 text-xs font-semibold mt-2">{label}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{sub}</p>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    )
}
