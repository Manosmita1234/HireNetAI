/**
 * pages/NotFound.jsx – The 404 "Page Not Found" screen.
 */

import { Link } from 'react-router-dom'
import { Brain } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-center bg-white rounded-3xl p-12 border border-slate-200 shadow-sm">
                <Brain className="w-16 h-16 text-blue-600 mx-auto mb-4" />

                <h1 className="text-6xl font-black text-slate-800 mb-4">404</h1>

                <p className="text-slate-500 mb-8">Oops! This page doesn't exist.</p>

                <Link to="/" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold transition-colors text-white">
                    Go Home
                </Link>
            </div>
        </div>
    )
}
