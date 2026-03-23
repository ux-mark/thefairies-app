import { Thermometer, Cloud, Droplets, Wind } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import TimeSeriesChart from '@/components/dashboard/TimeSeriesChart'
import type { DashboardSummary } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnvironmentCardProps {
  weather: DashboardSummary['weather']
  rooms: DashboardSummary['rooms']
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the user's preferred temperature unit from localStorage.
 * Defaults to 'C' if the key is absent or contains an unrecognised value.
 */
function getTempUnit(): 'C' | 'F' {
  try {
    const stored = localStorage.getItem('temp_unit')
    return stored === 'F' ? 'F' : 'C'
  } catch {
    return 'C'
  }
}

function toDisplay(celsius: number, unit: 'C' | 'F'): number {
  return unit === 'F'
    ? Math.round(celsius * 9 / 5 + 32)
    : Math.round(celsius * 10) / 10
}

/** Format a temperature value with its degree symbol and unit. */
function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  const val = toDisplay(celsius, unit)
  return `${val}\u00b0${unit}`
}

// ── Outdoor weather section ───────────────────────────────────────────────────

function OutdoorSection({
  weather,
  unit,
}: {
  weather: NonNullable<DashboardSummary['weather']>
  unit: 'C' | 'F'
}) {
  return (
    <div className="mb-5">
      <h3 className="text-caption mb-2 text-xs font-medium">Outdoors</h3>
      <div className="surface flex items-start gap-3 rounded-xl p-3">
        {/* Icon placeholder — no weather icon assets available; use a lucide icon */}
        <Cloud
          className="mt-0.5 h-8 w-8 shrink-0 text-sky-400"
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          {/* Temperature + description */}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-heading text-2xl font-semibold tabular-nums">
              {formatTemp(weather.temp, unit)}
            </span>
            <span className="text-body text-sm capitalize">
              {weather.description}
            </span>
          </div>

          {/* Humidity and wind */}
          <dl className="mt-1.5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1">
              <Droplets
                className="h-3.5 w-3.5 shrink-0 text-sky-400"
                aria-hidden="true"
              />
              <dt className="sr-only">Humidity</dt>
              <dd className="text-caption text-xs">{weather.humidity}%</dd>
            </div>
            <div className="flex items-center gap-1">
              <Wind
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <dt className="sr-only">Wind speed</dt>
              <dd className="text-caption text-xs">
                {Math.round(weather.wind_speed)} m/s
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

// ── Indoor rooms section ──────────────────────────────────────────────────────

type RoomEntry = DashboardSummary['rooms'][number]

function IndoorSection({
  rooms,
  unit,
}: {
  rooms: RoomEntry[]
  unit: 'C' | 'F'
}) {
  const roomsWithTemp = rooms.filter(r => r.temperature !== null)

  if (roomsWithTemp.length === 0) return null

  return (
    <div className="mb-5">
      <h3 className="text-caption mb-2 text-xs font-medium">Indoors</h3>
      <ul
        role="list"
        aria-label="Room temperatures"
        className="divide-y"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        {roomsWithTemp.map(room => (
          <li
            key={room.name}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-heading text-sm font-medium leading-snug">
              {room.name}
            </span>
            <div className="shrink-0 text-right">
              <span className="text-heading text-sm font-semibold tabular-nums">
                {formatTemp(room.temperature!, unit)}
              </span>
              {room.lux !== null && (
                <p className="text-caption text-xs leading-snug">
                  {room.lux} lux
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Chart section ─────────────────────────────────────────────────────────────

function TempChartSection({ roomName }: { roomName: string }) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['dashboard', 'history', 'temperature', roomName, '24h'],
    queryFn: () => api.dashboard.getHistory('temperature', roomName, '24h'),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border-primary)' }}>
      <p className="text-caption mb-3 text-xs font-medium">
        24-hour trend — {roomName}
      </p>
      <TimeSeriesChart
        data={historyData?.data ?? []}
        label="Temperature"
        unit="°"
        height={140}
        loading={isLoading}
        emptyMessage="Temperature trends will appear after a few hours of collection."
      />
    </div>
  )
}

// ── EnvironmentCard ───────────────────────────────────────────────────────────

export default function EnvironmentCard({ weather, rooms }: EnvironmentCardProps) {
  const unit = getTempUnit()

  const roomsWithTemp = rooms.filter(r => r.temperature !== null)
  const hasWeather = weather !== null
  const hasIndoor = roomsWithTemp.length > 0
  const hasAnyData = hasWeather || hasIndoor

  // Pick the first room with temperature data for the chart
  const chartRoom = roomsWithTemp[0]

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!hasAnyData) {
    return (
      <section
        aria-label="Environment"
        className="card rounded-xl border p-5"
      >
        <header className="mb-4 flex items-center gap-2">
          <Thermometer
            className="h-4 w-4 text-fairy-400"
            aria-hidden="true"
          />
          <h2 className="text-heading text-base font-semibold">Environment</h2>
        </header>

        <div
          className="rounded-lg border border-dashed py-8 text-center"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <Thermometer
            className="text-caption mx-auto mb-3 h-7 w-7"
            aria-hidden="true"
          />
          <p className="text-body text-sm">No environment data available.</p>
          <p className="text-caption mt-1 text-xs">
            Temperature sensors and weather will appear here.
          </p>
        </div>
      </section>
    )
  }

  // ── Content ────────────────────────────────────────────────────────────────

  return (
    <section
      aria-label="Environment"
      className={cn('card rounded-xl border p-5')}
    >
      <header className="mb-4 flex items-center gap-2">
        <Thermometer
          className="h-4 w-4 text-fairy-400"
          aria-hidden="true"
        />
        <h2 className="text-heading text-base font-semibold">Environment</h2>
      </header>

      {hasWeather && <OutdoorSection weather={weather!} unit={unit} />}

      {hasIndoor && <IndoorSection rooms={rooms} unit={unit} />}

      {hasIndoor && chartRoom && (
        <TempChartSection roomName={chartRoom.name} />
      )}
    </section>
  )
}
