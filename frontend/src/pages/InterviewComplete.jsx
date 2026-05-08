/**
 * pages/InterviewComplete.jsx – "Thank You" screen shown after a candidate
 * submits all their video answers.
 */

import { Link } from 'react-router-dom'
import { CheckCircle, Brain } from 'lucide-react'

export default function InterviewComplete() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">

            <header className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                        <Brain className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-slate-800">Video Interview Platform</span>
                    <span className="text-slate-400 text-sm">| Pre-Selection Assessment</span>
                </div>
            </header>

            <div className="flex-1 flex items-center justify-center px-4 py-16">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
                    <div className="py-12 px-8">

                        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-800 mb-3">
                            Interview Complete!
                        </h1>

                        <p className="text-slate-500 text-sm leading-relaxed mb-8">
                            Thank you for completing your video interview. Our team will review your
                            responses and get back to you soon.
                        </p>

                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 text-left">
                            <h3 className="text-sm font-semibold text-blue-800 mb-2">What happens next?</h3>
                            <ul className="space-y-1.5 text-sm text-blue-700">
                                <li>* Our AI will analyze your responses</li>
                                <li>* A recruiter will review your results</li>
                                <li>* You'll receive feedback within 2-3 business days</li>
                            </ul>
                        </div>

                        <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
                            Return to Home
                        </Link>
                    </div>
                </div>
            </div>

            <footer className="bg-white border-t border-slate-200 py-4 text-center text-slate-400 text-xs">
                © {new Date().getFullYear()} Video Interview Platform. All rights reserved.
                <span className="ml-2">Your privacy is important to us. All recordings are securely stored.</span>
            </footer>
        </div>
    )
}
