import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Settings,
  Plus,
  X,
  RefreshCw,
  Timer,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  )
}

// ── General section ─────────────────────────────────────────────────────────

function GeneralSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: prefs } = useQuery({
    queryKey: ['system', 'preferences'],
    queryFn: api.system.getPreferences,
  })

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.system.setPreference(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'preferences'] })
      toast({ message: 'Preference saved' })
    },
    onError: () => toast({ message: 'Failed to save preference', type: 'error' }),
  })

  const tempUnit = prefs?.temp_unit ?? 'C'

  return (
    <Section title="General">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-200">Temperature Unit</span>
        <div className="flex rounded-lg border border-slate-700 bg-slate-800">
          {(['C', 'F'] as const).map(unit => (
            <button
              key={unit}
              onClick={() => mutation.mutate({ key: 'temp_unit', value: unit })}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                tempUnit === unit
                  ? 'bg-fairy-500 text-white'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              °{unit}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── Modes section ───────────────────────────────────────────────────────────

function ModesSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [newMode, setNewMode] = useState('')

  const { data: modes } = useQuery({
    queryKey: ['system', 'modes'],
    queryFn: api.system.getModes,
  })

  const addMutation = useMutation({
    mutationFn: api.system.addMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      setNewMode('')
      toast({ message: 'Mode added' })
    },
    onError: () => toast({ message: 'Failed to add mode', type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: api.system.deleteMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'modes'] })
      queryClient.invalidateQueries({ queryKey: ['system', 'current'] })
      toast({ message: 'Mode removed' })
    },
    onError: () => toast({ message: 'Failed to remove mode', type: 'error' }),
  })

  const handleAdd = () => {
    const trimmed = newMode.trim()
    if (!trimmed) return
    addMutation.mutate(trimmed)
  }

  const handleDelete = (mode: string) => {
    if (!confirm(`Remove mode "${mode}"?`)) return
    deleteMutation.mutate(mode)
  }

  return (
    <Section title="Modes">
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newMode}
          onChange={e => setNewMode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="New mode name..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fairy-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newMode.trim() || addMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-fairy-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fairy-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {modes?.map(mode => (
          <span
            key={mode}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            {mode}
            <button
              onClick={() => handleDelete(mode)}
              className="rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {modes?.length === 0 && (
          <p className="text-sm text-slate-500">No modes configured.</p>
        )}
      </div>
    </Section>
  )
}

// ── Devices section ─────────────────────────────────────────────────────────

function DevicesSection() {
  const { toast } = useToast()

  const { data: lights, isLoading: lifxLoading } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    retry: false,
  })

  const syncMutation = useMutation({
    mutationFn: api.hubitat.syncDevices,
    onSuccess: () => toast({ message: 'Hubitat devices synced' }),
    onError: () => toast({ message: 'Sync failed', type: 'error' }),
  })

  return (
    <Section title="Devices">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200">Hubitat</p>
            <p className="text-xs text-slate-500">Sync devices from Hubitat hub</p>
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')}
            />
            Sync Devices
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200">LIFX</p>
            <p className="text-xs text-slate-500">
              {lifxLoading
                ? 'Checking...'
                : lights
                  ? `${lights.length} light${lights.length !== 1 ? 's' : ''} connected`
                  : 'Unable to connect'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            {lifxLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />
            ) : lights ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400" />
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Timers section ──────────────────────────────────────────────────────────

function TimersSection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: timers } = useQuery({
    queryKey: ['system', 'timers'],
    queryFn: api.system.getTimers,
    refetchInterval: 1000,
  })

  const cancelMutation = useMutation({
    mutationFn: api.system.cancelTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'Timer cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timer', type: 'error' }),
  })

  const cancelAllMutation = useMutation({
    mutationFn: api.system.cancelAllTimers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'timers'] })
      toast({ message: 'All timers cancelled' })
    },
    onError: () => toast({ message: 'Failed to cancel timers', type: 'error' }),
  })

  const formatRemaining = (startedAt: number, durationMs: number) => {
    const remaining = Math.max(0, startedAt + durationMs - Date.now())
    const secs = Math.ceil(remaining / 1000)
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    return `${mins}:${String(s).padStart(2, '0')}`
  }

  return (
    <Section title="Timers">
      {timers && timers.length > 0 ? (
        <div className="space-y-3">
          {timers.map(timer => (
            <div
              key={timer.id}
              className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2"
            >
              <div>
                <p className="text-sm text-slate-200">
                  {timer.sceneName} → {timer.targetScene}
                </p>
                <p className="font-mono text-xs text-fairy-400">
                  {formatRemaining(timer.startedAt, timer.durationMs)}
                </p>
              </div>
              <button
                onClick={() => cancelMutation.mutate(timer.id)}
                disabled={cancelMutation.isPending}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => cancelAllMutation.mutate()}
            disabled={cancelAllMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Cancel All
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Timer className="h-4 w-4" />
          No active timers
        </div>
      )}
    </Section>
  )
}

// ── System section ──────────────────────────────────────────────────────────

function SystemSection() {
  const { data: health } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: api.system.health,
  })

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <Section title="System">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Version</span>
          <span className="text-slate-200">3.0.0</span>
        </div>
        {health && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Uptime</span>
              <span className="text-slate-200">{formatUptime(health.uptime)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Database</span>
              <span
                className={cn(
                  'text-sm',
                  health.db === 'connected' ? 'text-green-400' : 'text-red-400',
                )}
              >
                {health.db}
              </span>
            </div>
          </>
        )}
        <div className="pt-2">
          <Link
            to="/settings/logs"
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-700"
          >
            <FileText className="h-4 w-4" />
            View System Logs
          </Link>
        </div>
      </div>
    </Section>
  )
}

// ── Settings page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Settings className="h-5 w-5 text-fairy-400" />
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
      </div>

      <div className="space-y-4">
        <GeneralSection />
        <ModesSection />
        <DevicesSection />
        <TimersSection />
        <SystemSection />
      </div>
    </div>
  )
}
