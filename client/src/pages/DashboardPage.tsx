import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import { useDashboardSocket } from '@/hooks/useSocket'
import EnergyCard from '@/components/dashboard/EnergyCard'
import BatteryCard from '@/components/dashboard/BatteryCard'
import EnvironmentCard from '@/components/dashboard/EnvironmentCard'
import SunModeCard from '@/components/dashboard/SunModeCard'

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading dashboard">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="card animate-pulse rounded-xl border p-5"
        >
          <div className="mb-4 h-5 w-32 rounded bg-[var(--bg-tertiary)]" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--bg-tertiary)]" />
            <div className="h-4 w-1/2 rounded bg-[var(--bg-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="card rounded-xl border p-5" role="alert">
      <p className="text-sm text-red-400">
        Could not load dashboard data. {message}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 rounded-lg bg-fairy-500/15 px-4 py-2 text-sm font-medium text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
      >
        Retry
      </button>
    </div>
  )
}

export default function DashboardPage() {
  useDashboardSocket()

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.dashboard.getSummary,
    refetchInterval: 30_000,
  })

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-fairy-400" />
        <h1 className="text-heading text-lg font-semibold">Insights</h1>
      </div>

      {isLoading && <DashboardSkeleton />}

      {error && (
        <DashboardError
          message={error instanceof Error ? error.message : 'Please try again.'}
        />
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <EnergyCard power={data.power} />
          <BatteryCard battery={data.battery} />
          <EnvironmentCard weather={data.weather} rooms={data.rooms} />
          <SunModeCard
            mode={data.mode}
            sunSchedule={data.sunSchedule}
            sunPhase={data.sunPhase}
            sunTimes={data.sunTimes}
          />
        </div>
      )}
    </div>
  )
}
