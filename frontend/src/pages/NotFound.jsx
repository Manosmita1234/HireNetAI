/**
 * pages/NotFound.jsx – The 404 "Page Not Found" screen.
 *
 * React Router shows this page automatically (via the "*" wildcard route in App.jsx)
 * when a user navigates to any URL that doesn't match any known route.
 * e.g. visiting /wrong-url will show this page instead of a blank screen.
 */

import { Link } from 'react-router-dom'  // Link renders a clickable navigation link
import { Brain } from 'lucide-react'     // Brain icon (HireNetAI logo)

export default function NotFound() {
    return (
        // Full-screen dark animated background, text centered
        <div className="min-h-screen animated-bg flex items-center justify-center text-white">
            {/* Card container with glass effect and neon border */}
            <div className="text-center glass rounded-3xl p-12 neon-border">
                {/* Decorative brain icon */}
                <Brain className="w-16 h-16 text-brand-400 mx-auto mb-4" />

                {/* Large "404" number */}
                <h1 className="text-6xl font-black gradient-text mb-4">404</h1>

                {/* Short explanation */}
                <p className="text-brand-300 mb-8">Oops! This page doesn't exist.</p>

                {/* Button to go back to the home page */}
                <Link to="/" className="bg-brand-600 hover:bg-brand-500 px-6 py-3 rounded-xl font-semibold transition-colors">
                    Go Home
                </Link>
            </div>
        </div>
    )
}
