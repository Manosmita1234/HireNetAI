/**
 * pages/NotFound.jsx – 404 page.
 */
import { Link } from 'react-router-dom'
import { Brain } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen animated-bg flex items-center justify-center text-white">
            <div className="text-center glass rounded-3xl p-12 neon-border">
                <Brain className="w-16 h-16 text-brand-400 mx-auto mb-4" />
                <h1 className="text-6xl font-black gradient-text mb-4">404</h1>
                <p className="text-brand-300 mb-8">Oops! This page doesn't exist.</p>
                <Link to="/" className="bg-brand-600 hover:bg-brand-500 px-6 py-3 rounded-xl font-semibold transition-colors">
                    Go Home
                </Link>
            </div>
        </div>
    )
}
