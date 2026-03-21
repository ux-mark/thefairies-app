import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const CATEGORIES = ['hubitat', 'scene', 'lifx', 'system', 'timer'] as const

function formatTimestamp(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function LogEntry({
  log,
}: {
  log: {
    id: number
    message: string
    debug: string | null
    category: string | null
    created_at: string
  }
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-slate-800 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <button
          onClick={() => log.debug && setExpanded(!expanded)}
          className={cn(
            'mt-0.5 shrink-0',
            log.debug ? 'text-slate-500 hover:text-slate-300' : 'text-transparent',
          )}
          disabled={!log.debug}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {log.category && (
              <span className="inline-flex rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                {log.category}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {formatTimestamp(log.created_at)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-200">{log.message}</p>

          {expanded && log.debug && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-400">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(log.debug), null, 2)
                } catch {
                  return log.debug
                }
              })()}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LogsPage() {
  const [category, setCategory] = useState<string | undefined>(undefined)

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system', 'logs', category],
    queryFn: () => api.system.getLogs(50, category),
    refetchInterval: 30000,
  })

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/settings"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-slate-100">
          System Logs
        </h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <RefreshCw
            className={cn('h-4 w-4', isFetching && 'animate-spin')}
          />
        </button>
      </div>

      {/* Category filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory(undefined)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            !category
              ? 'bg-fairy-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200',
          )}
        >
          All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(category === cat ? undefined : cat)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              category === cat
                ? 'bg-fairy-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-24 rounded bg-slate-800" />
                <div className="h-4 w-3/4 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="divide-y divide-slate-800 px-4">
            {logs.map(log => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">
            No logs found.
          </div>
        )}
      </div>
    </div>
  )
}
