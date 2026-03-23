import { useState } from 'react'
import { Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import type { PowerDevice } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a Tailwind text colour class reflecting relative power intensity.
 * Thresholds are intentionally gentle — the colour supplements the watt value,
 * never replaces it as the sole indicator.
 */
function powerIntensityClass(watts: number, maxWatts: number): string {
  if (maxWatts === 0) return 'text-heading'
  const ratio = watts / maxWatts
  if (ratio >= 0.75) return 'text-amber-400'
  if (ratio >= 0.4) return 'text-yellow-400'
  return 'text-green-400'
}

// ── Power device row ──────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: PowerDevice
  maxWatts: number
}

function DeviceRow({ device, maxWatts }: DeviceRowProps) {
  const isOn = device.switch === 'on'
  const intensityClass = powerIntensityClass(device.power, maxWatts)

  return (
    <li className="flex items-start gap-3 py-2.5">
      {/* On/off indicator — paired with text label so colour is not the sole signal */}
      <span
        aria-label={isOn ? 'On' : 'Off'}
        title={isOn ? 'On' : 'Off'}
        className={cn(
          'mt-1 h-2 w-2 shrink-0 rounded-full',
          isOn ? 'bg-fairy-500' : 'bg-slate-600',
        )}
      />

      {/* Device info */}
      <div className="min-w-0 flex-1">
        <p className="text-heading text-sm font-medium leading-snug">
          {device.label}
        </p>
        {device.room_name && (
          <p className="text-caption text-xs leading-snug">
            {device.room_name}
          </p>
        )}
        {device.energy !== null && device.energy !== undefined && (
          <p className="text-caption text-xs leading-snug">
            {device.energy.toFixed(2)} kWh total
          </p>
        )}
      </div>

      {/* Power value — colour reinforces scale but watt number is always visible */}
      <div className="shrink-0 text-right">
        <span className={cn('text-sm font-semibold tabular-nums', intensityClass)}>
          {device.power.toFixed(1)} W
        </span>
        <span className="sr-only"> watts, device is {isOn ? 'on' : 'off'}</span>
      </div>
    </li>
  )
}

// ── EnergyCard ────────────────────────────────────────────────────────────────

interface EnergyCardProps {
  power: PowerDevice[]
}

export default function EnergyCard({ power }: EnergyCardProps) {
  const [chartExpanded, setChartExpanded] = useState(false)

  // Sort highest power first
  const sorted = [...power].sort((a, b) => b.power - a.power)
  const maxWatts = sorted[0]?.power ?? 0
  const totalWatts = power.reduce((sum, d) => sum + d.power, 0)

  // Track trend for the highest-drawing device
  const topDevice = sorted[0]
  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ['dashboard', 'history', 'power', topDevice?.label, '24h'],
    queryFn: () => api.dashboard.getHistory('power', topDevice!.label, '24h'),
    enabled: !!topDevice && chartExpanded,
    staleTime: 5 * 60 * 1000,
  })

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (power.length === 0) {
    return (
      <section aria-label="Energy usage" className="card rounded-xl border p-5">
        <header className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-heading text-base font-semibold">Energy</h2>
        </header>
        <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border-secondary)' }}>
          <Zap className="text-caption mx-auto mb-3 h-7 w-7" aria-hidden="true" />
          <p className="text-body text-sm">No power-monitoring devices detected.</p>
          <p className="text-caption mt-1 text-xs">
            Smart plugs that report energy usage will appear here.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Energy usage" className="card rounded-xl border p-5">
      {/* Header */}
      <header className="mb-1 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" aria-hidden="true" />
        <h2 className="text-heading text-base font-semibold">Energy</h2>
      </header>

      {/* Total */}
      <p className="text-caption mb-4 text-sm">
        <span className="text-heading text-2xl font-semibold tabular-nums">
          {totalWatts.toFixed(1)}
        </span>
        {' '}W total across {power.length} device{power.length !== 1 ? 's' : ''}
      </p>

      {/* Device list */}
      <ul
        role="list"
        aria-label="Power-consuming devices"
        className="divide-y"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        {sorted.map(device => (
          <DeviceRow key={device.id} device={device} maxWatts={maxWatts} />
        ))}
      </ul>

      {/* Chart section */}
      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
        <button
          type="button"
          aria-expanded={chartExpanded}
          aria-controls="energy-trend-chart"
          onClick={() => setChartExpanded(prev => !prev)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            'text-body hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            'min-h-[44px]',
          )}
        >
          <span>
            {topDevice
              ? `24-hour trend — ${topDevice.label}`
              : '24-hour trend'}
          </span>
          <span className={cn('text-caption text-xs transition-transform', chartExpanded ? 'rotate-180' : '')}>
            {chartExpanded ? 'Hide' : 'Show'}
          </span>
        </button>

        {chartExpanded && (
          <div id="energy-trend-chart" className="mt-3">
            <TimeSeriesChart
              data={historyData?.data ?? []}
              label={topDevice?.label ?? 'Power'}
              color="#f59e0b"
              unit="W"
              height={160}
              loading={historyLoading}
              emptyMessage="Power trends will appear as data is collected."
            />
          </div>
        )}
      </div>
    </section>
  )
}
