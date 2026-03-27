import { Thermometer, Sun, Battery, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import OverUnderBadge from '@/components/dashboard/OverUnderBadge'
import type { InsightsData } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSummaryStripProps {
  insights: InsightsData
  onOpenSection?: (sectionId: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Capitalise the first letter of each word in a brightness level label.
 * "very bright" → "Very bright" (only first word capitalised per sentence case).
 */
function capitaliseBrightnessLevel(level: string): string {
  if (!level) return level
  return level.charAt(0).toUpperCase() + level.slice(1)
}

// ── Pill wrapper ──────────────────────────────────────────────────────────────

interface PillProps {
  ariaLabel: string
  scrollTargetId: string
  /** Called before scrolling to allow the parent to open the target section */
  onBeforeScroll?: () => void
  children: React.ReactNode
}

function Pill({ ariaLabel, scrollTargetId, onBeforeScroll, children }: PillProps) {
  function handleClick() {
    onBeforeScroll?.()
    document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${ariaLabel} — scroll to details`}
      className="card rounded-xl border p-4 cursor-pointer hover:border-fairy-500/30 transition-colors w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
    >
      {children}
    </button>
  )
}

// ── Pill header ───────────────────────────────────────────────────────────────

interface PillHeaderProps {
  icon: React.ReactNode
  label: string
}

function PillHeader({ icon, label }: PillHeaderProps) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      {icon}
      <span className="text-caption text-xs font-medium">{label}</span>
    </div>
  )
}

// ── Temperature pill ──────────────────────────────────────────────────────────

function TemperaturePill({ temperature, onOpenSection }: { temperature: InsightsData['temperature']; onOpenSection?: (sectionId: string) => void }) {
  return (
    <Pill ariaLabel="Temperature summary" scrollTargetId="environment-card" onBeforeScroll={() => onOpenSection?.('environment')}>
      <PillHeader
        icon={<Thermometer className="h-4 w-4 shrink-0 text-fairy-400" aria-hidden="true" />}
        label="Temperature"
      />

      {temperature ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-heading text-xl font-semibold tabular-nums">
              {Math.round(temperature.houseAvgTemp * 10) / 10}°
            </span>
            <TrendIcon trend={temperature.trend} />
          </div>

          {temperature.overUnderTemp !== null && (
            <p className="text-caption text-xs">
              {Math.abs(temperature.overUnderTemp).toFixed(1)}°{' '}
              {temperature.overUnderTemp > 0 ? 'warmer' : 'cooler'} than usual
            </p>
          )}
        </div>
      ) : (
        <p className="text-caption text-sm">No temperature data</p>
      )}
    </Pill>
  )
}

interface TrendIconProps {
  trend: 'warming' | 'cooling' | 'stable'
}

function TrendIcon({ trend }: TrendIconProps) {
  if (trend === 'warming') {
    return (
      <>
        <ArrowUp className="h-4 w-4 text-red-400" aria-hidden="true" />
        <span className="sr-only">Warming</span>
      </>
    )
  }
  if (trend === 'cooling') {
    return (
      <>
        <ArrowDown className="h-4 w-4 text-blue-400" aria-hidden="true" />
        <span className="sr-only">Cooling</span>
      </>
    )
  }
  return (
    <>
      <Minus className="h-4 w-4 text-caption" aria-hidden="true" />
      <span className="sr-only">Stable</span>
    </>
  )
}

// ── Brightness pill ───────────────────────────────────────────────────────────

function BrightnessPill({ lux, onOpenSection }: { lux: InsightsData['lux']; onOpenSection?: (sectionId: string) => void }) {
  return (
    <Pill ariaLabel="Brightness summary" scrollTargetId="environment-card" onBeforeScroll={() => onOpenSection?.('environment')}>
      <PillHeader
        icon={<Sun className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />}
        label="Brightness"
      />

      {lux ? (
        <div className="space-y-1.5">
          <span className="text-heading text-xl font-semibold block">
            {capitaliseBrightnessLevel(lux.brightnessLevel)}
          </span>

          <p className="text-caption text-xs">
            {Math.round(lux.houseAvgLux)} lux average
          </p>

          <OverUnderBadge percent={lux.overUnderLuxPercent} />
        </div>
      ) : (
        <p className="text-caption text-sm">No light data</p>
      )}
    </Pill>
  )
}

// ── Battery pill ──────────────────────────────────────────────────────────────

function BatteryPill({ battery, onOpenSection }: { battery: InsightsData['battery']; onOpenSection?: (sectionId: string) => void }) {
  return (
    <Pill ariaLabel="Battery fleet summary" scrollTargetId="battery-card" onBeforeScroll={() => onOpenSection?.('battery')}>
      <PillHeader
        icon={<Battery className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />}
        label="Batteries"
      />

      {battery ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-heading text-xl font-semibold tabular-nums">
              {battery.fleetHealth.healthy}/{battery.fleetHealth.total}
            </span>
            <span className="text-caption text-xs">healthy</span>
          </div>

          <BatteryStatusLine fleetHealth={battery.fleetHealth} />
        </div>
      ) : (
        <p className="text-caption text-sm">No battery data</p>
      )}
    </Pill>
  )
}

interface FleetHealth {
  healthy: number
  low: number
  critical: number
  total: number
}

function BatteryStatusLine({ fleetHealth }: { fleetHealth: FleetHealth }) {
  if (fleetHealth.critical > 0) {
    return (
      <p className="text-xs font-medium text-red-400">
        {fleetHealth.critical} critical
      </p>
    )
  }
  if (fleetHealth.low > 0) {
    return (
      <p className="text-xs font-medium text-amber-400">
        {fleetHealth.low} low
      </p>
    )
  }
  return (
    <p className="text-xs font-medium text-green-400">All healthy</p>
  )
}

// ── HomeSummaryStrip ──────────────────────────────────────────────────────────

export default function HomeSummaryStrip({ insights, onOpenSection }: HomeSummaryStripProps) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      role="region"
      aria-label="Home summary"
    >
      <TemperaturePill temperature={insights.temperature} onOpenSection={onOpenSection} />
      <BrightnessPill lux={insights.lux} onOpenSection={onOpenSection} />
      <BatteryPill battery={insights.battery} onOpenSection={onOpenSection} />
    </div>
  )
}
