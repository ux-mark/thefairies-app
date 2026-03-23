import { useState, useId } from 'react'
import { Battery, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import type { BatteryDevice } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function batteryBarClass(level: number): string {
  if (level < 15) return 'bg-red-500'
  if (level <= 50) return 'bg-yellow-400'
  return 'bg-green-500'
}

function batteryTextClass(level: number): string {
  if (level < 15) return 'text-red-400'
  if (level <= 50) return 'text-yellow-400'
  return 'text-green-400'
}

function batteryStatusLabel(status: BatteryDevice['status']): string {
  switch (status) {
    case 'critical': return 'Critical'
    case 'low': return 'Low'
    default: return 'Ok'
  }
}

function batteryStatusClass(status: BatteryDevice['status']): string {
  switch (status) {
    case 'critical': return 'bg-red-500/15 text-red-400'
    case 'low': return 'bg-yellow-500/15 text-yellow-400'
    default: return 'bg-fairy-500/15 text-fairy-400'
  }
}

// ── Battery device row ────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: BatteryDevice
}

function BatteryDeviceRow({ device }: DeviceRowProps) {
  const isCritical = device.status === 'critical'
  const level = device.battery ?? 0

  return (
    <li
      className={cn(
        'rounded-lg px-3 py-2.5',
        isCritical ? 'bg-red-500/8 ring-1 ring-red-500/20' : '',
      )}
      aria-label={`${device.label}: ${level}% battery, status ${batteryStatusLabel(device.status)}`}
    >
      <div className="flex items-center gap-3">
        {/* Critical warning icon — paired with text badge so icon is not the sole indicator */}
        {isCritical && (
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-red-400"
            aria-hidden="true"
          />
        )}

        {/* Label */}
        <span className={cn('flex-1 text-sm font-medium', isCritical ? 'text-red-300' : 'text-heading')}>
          {device.label}
        </span>

        {/* Percentage — always visible text, not just colour */}
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', batteryTextClass(level))}>
          {level}%
        </span>

        {/* Status badge */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            batteryStatusClass(device.status),
          )}
        >
          {batteryStatusLabel(device.status)}
        </span>
      </div>

      {/* Visual progress bar — decorative; percentage text above is the real indicator */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"
        role="presentation"
        aria-hidden="true"
      >
        <div
          className={cn('h-full rounded-full transition-all', batteryBarClass(level))}
          style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
        />
      </div>
    </li>
  )
}

// ── BatteryCard ───────────────────────────────────────────────────────────────

interface BatteryCardProps {
  battery: BatteryDevice[]
}

export default function BatteryCard({ battery }: BatteryCardProps) {
  const selectId = useId()

  // Sort lowest battery first (worst cases at the top)
  const sorted = [...battery].sort((a, b) => (a.battery ?? 0) - (b.battery ?? 0))

  // Default selection: lowest-battery device
  const [selectedDeviceLabel, setSelectedDeviceLabel] = useState<string>(
    sorted[0]?.label ?? '',
  )
  const [listExpanded, setListExpanded] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)

  const allHealthy = battery.length > 0 && battery.every(d => (d.battery ?? 0) > 50)

  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['dashboard', 'history', 'battery', selectedDeviceLabel, '30d'],
    queryFn: () => api.dashboard.getHistory('battery', selectedDeviceLabel, '30d'),
    enabled: !!selectedDeviceLabel && chartExpanded,
    staleTime: 5 * 60 * 1000,
  })

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (battery.length === 0) {
    return (
      <section aria-label="Battery health" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </header>
        <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Battery className="text-caption mx-auto mb-3 h-7 w-7" aria-hidden="true" />
          <p className="text-body text-sm">No battery-powered devices detected.</p>
        </div>
      </section>
    )
  }

  // ── All-healthy compact state ─────────────────────────────────────────────

  if (allHealthy && !listExpanded) {
    return (
      <section aria-label="Battery health" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </header>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-green-500/8 px-4 py-3 ring-1 ring-green-500/20">
          <p className="text-sm font-medium text-green-400">
            All {battery.length} {battery.length === 1 ? 'battery' : 'batteries'} are healthy
          </p>
          <button
            type="button"
            onClick={() => setListExpanded(true)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-green-400',
              'hover:bg-green-500/15 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px] min-w-[44px]',
            )}
          >
            View details
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Battery health" className="card rounded-xl border p-5">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Battery className="h-4 w-4 text-green-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Battery health</h2>
        </div>
        {/* If we expanded from the all-healthy compact state, offer to collapse back */}
        {allHealthy && listExpanded && (
          <button
            type="button"
            onClick={() => setListExpanded(false)}
            className={cn(
              'text-caption text-xs hover:text-body transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              'min-h-[44px] min-w-[44px] flex items-center justify-end',
            )}
          >
            Collapse
          </button>
        )}
      </header>

      {/* Device list */}
      <ul
        role="list"
        aria-label="Battery-powered devices"
        className="space-y-1.5"
      >
        {sorted.map(device => (
          <BatteryDeviceRow key={device.id} device={device} />
        ))}
      </ul>

      {/* Chart section */}
      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          aria-expanded={chartExpanded}
          aria-controls="battery-trend-chart"
          onClick={() => setChartExpanded(prev => !prev)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            'text-body hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px]',
          )}
        >
          <span>30-day battery trend</span>
          <span className="text-caption text-xs">
            {chartExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {chartExpanded && (
          <div id="battery-trend-chart" className="mt-3 space-y-3">
            {/* Device selector */}
            <div className="flex items-center gap-2">
              <label
                htmlFor={selectId}
                className="text-caption shrink-0 text-xs"
              >
                Device:
              </label>
              <select
                id={selectId}
                value={selectedDeviceLabel}
                onChange={e => setSelectedDeviceLabel(e.target.value)}
                className={cn(
                  'input-field min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                )}
              >
                {sorted.map(device => (
                  <option key={device.id} value={device.label}>
                    {device.label}
                    {device.battery !== null ? ` — ${device.battery}%` : ''}
                  </option>
                ))}
              </select>
            </div>

            <TimeSeriesChart
              data={historyData?.data ?? []}
              label={selectedDeviceLabel}
              color="#22c55e"
              unit="%"
              height={160}
              loading={historyLoading}
              emptyMessage="Battery trend data will appear once history is collected."
            />
          </div>
        )}
      </div>
    </section>
  )
}
