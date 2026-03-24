/**
 * main.jsx – React application bootstrap / entry point.
 *
 * This is the very first file that runs in the browser.
 * It mounts the entire React app onto the <div id="root"> in index.html.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'  // enables client-side routing (URL changes without page reload)
import { Toaster } from 'react-hot-toast'           // global toast notification container
import App from './App'
import './index.css'   // global CSS styles (Tailwind + custom design tokens)

// Mount the app into the DOM element with id="root"
ReactDOM.createRoot(document.getElementById('root')).render(
    // StrictMode: detects potential problems in development (double-renders, deprecated APIs, etc.)
    <React.StrictMode>
        {/* BrowserRouter provides URL-based navigation context to all child components */}
        <BrowserRouter>
            {/* App contains all the routes and the AuthProvider */}
            <App />

            {/* Toaster renders the floating notification stack used by toast.success / toast.error */}
            <Toaster
                position="top-right"   // notifications appear in top-right corner
                toastOptions={{
                    // Custom dark-theme styling to match the app's design
                    style: {
                        background: '#1a1830',
                        color: '#e0e7ff',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: '12px',
                    },
                    // Green checkmark for success toasts
                    success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                    // Red X for error toasts
                    error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                }}
            />
        </BrowserRouter>
    </React.StrictMode>
)
