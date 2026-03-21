import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, X, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * DeviceOnboarding
 *
 * A notification banner that appears on the HomePage when there are
 * unassigned LIFX lights. Helps users discover new devices and assign
 * them to rooms quickly.
 */
export default function DeviceOnboarding() {
  const [dismissed, setDismissed] = useState(false)

  const { data: allLights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    staleTime: 60_000,
  })

  const { data: allAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
    staleTime: 60_000,
  })

  // Calculate unassigned lights
  const assignedIds = new Set(allAssignments?.map(a => a.light_id) ?? [])
  const unassignedLights = allLights?.filter(l => !assignedIds.has(l.id)) ?? []

  // Don't render if dismissed, still loading, or nothing to show
  if (dismissed || !allLights || !allAssignments || unassignedLights.length === 0) {
    return null
  }

  const count = unassignedLights.length

  return (
    <div
      className={cn(
        'mb-6 rounded-xl border border-fairy-500/30 bg-fairy-500/5 p-4',
        'transition-all duration-150',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fairy-500/15">
          <Lightbulb className="h-5 w-5 text-fairy-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">
            {count} new light{count !== 1 ? 's' : ''} detected
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Assign {count === 1 ? 'it' : 'them'} to rooms so scenes and
            automation can control {count === 1 ? 'it' : 'them'}.
          </p>

          {/* Quick list of unassigned light names (max 3) */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unassignedLights.slice(0, 3).map(light => (
              <span
                key={light.id}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400"
              >
                {light.label}
              </span>
            ))}
            {count > 3 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                +{count - 3} more
              </span>
            )}
          </div>

          <Link
            to="/rooms"
            className={cn(
              'mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-fairy-500 px-4 py-2 text-sm font-medium text-white',
              'transition-colors hover:bg-fairy-600',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
            )}
          >
            Assign to rooms
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className={cn(
            'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400',
            'transition-colors hover:text-slate-200',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
          )}
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
