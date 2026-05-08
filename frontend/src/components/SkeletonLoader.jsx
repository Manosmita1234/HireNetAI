export function SkeletonCard({ className = '' }) {
    return (
        <div className={`bg-surface-card/40 rounded-2xl p-5 animate-pulse ${className}`}>
            <div className="space-y-3">
                <div className="h-4 bg-surface-border/60 rounded-full w-3/4" />
                <div className="h-4 bg-surface-border/60 rounded-full w-1/2" />
                <div className="h-4 bg-surface-border/60 rounded-full w-5/6" />
            </div>
        </div>
    )
}

export function SkeletonRow({ cols = 5 }) {
    return (
        <div className="flex items-center gap-4 py-4 px-4 border-b border-surface-border/50">
            {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="flex-1 space-y-2">
                    <div className="h-3 bg-surface-border/60 rounded-full" style={{ width: `${60 + Math.random() * 40}%` }} />
                    <div className="h-3 bg-surface-border/40 rounded-full w-3/4" />
                </div>
            ))}
        </div>
    )
}

export function SkeletonStatCard() {
    return (
        <div className="relative overflow-hidden rounded-2xl p-6 h-44 glass neon-border">
            <div className="w-12 h-12 rounded-xl bg-surface-border/40 mb-4" />
            <div className="h-3 w-20 bg-surface-border/60 rounded-full mb-2" />
            <div className="h-8 w-16 bg-surface-border/60 rounded-full" />
        </div>
    )
}

export function SkeletonDetailPage() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <SkeletonStatCard key={i} />)}
            </div>
            <div className="glass rounded-2xl p-6 neon-border space-y-4">
                <div className="h-6 w-48 bg-surface-border/60 rounded-full" />
                <div className="h-40 bg-surface-border/40 rounded-xl" />
            </div>
            <div className="glass rounded-2xl p-6 neon-border space-y-4">
                <div className="h-6 w-32 bg-surface-border/60 rounded-full" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                </div>
            </div>
        </div>
    )
}