import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Lightbulb, ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'

/**
 * DeviceOnboarding banner
 * Shows on the Home page when there are LIFX lights not assigned to any room.
 * Prompts the user to assign them.
 */
export default function DeviceOnboarding() {
  const [dismissed, setDismissed] = useState(false)

  const { data: lights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
    staleTime: 60_000,
  })

  const { data: assignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
    staleTime: 60_000,
  })

  if (dismissed) return null
  if (!lights || !assignments) return null

  const assignedIds = new Set(assignments.map(a => a.light_id))
  const unassigned = lights.filter(l => !assignedIds.has(l.id))

  if (unassigned.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-fairy-500/30 bg-fairy-500/5 p-4">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-fairy-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200">
            {unassigned.length} light{unassigned.length !== 1 ? 's' : ''} not assigned to a room
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Assign lights to rooms so they can be used in scenes.
          </p>
          <Link
            to="/rooms"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-fairy-400 transition-colors hover:text-fairy-300"
          >
            Go to Rooms
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
