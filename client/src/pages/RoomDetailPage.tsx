import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Plus,
  X,
  Zap,
  Save,
  Wifi,
  WifiOff,
  Lightbulb,
  Trash2,
  Search,
  ToggleLeft,
  Activity,
} from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import { api } from '@/lib/api'
import type { Light, LightAssignment, RoomDetail, Sensor, Room } from '@/lib/api'
import { cn, getLightColorHex } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toAssignment(light: Light): LightAssignment {
  return {
    id: light.id,
    label: light.label,
    has_color: light.product.capabilities.has_color,
    min_kelvin: light.product.capabilities.min_kelvin,
    max_kelvin: light.product.capabilities.max_kelvin,
  }
}

// ── Available light card ─────────────────────────────────────────────────────

function AvailableLightRow({
  light,
  onAdd,
  onIdentify,
}: {
  light: Light
  onAdd: () => void
  onIdentify: () => void
}) {
  const isOn = light.power === 'on'
  const colorHex = getLightColorHex(light)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 transition-colors hover:border-slate-700">
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">
          {light.label}
        </p>
        <p className="truncate text-xs text-slate-500">{light.group.name}</p>
      </div>
      {light.connected ? (
        <Wifi className="h-3 w-3 shrink-0 text-fairy-500" />
      ) : (
        <WifiOff className="h-3 w-3 shrink-0 text-red-400" />
      )}
      <button
        onClick={onIdentify}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Identify ${light.label}`}
        title="Flash this light"
      >
        <Zap className="h-4 w-4" />
      </button>
      <button
        onClick={onAdd}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-fairy-500/15 text-fairy-400 transition-colors hover:bg-fairy-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Assign ${light.label} to this room`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Assigned light card ──────────────────────────────────────────────────────

function AssignedLightRow({
  assignment,
  light,
  onRemove,
  onIdentify,
}: {
  assignment: LightAssignment
  light?: Light
  onRemove: () => void
  onIdentify: () => void
}) {
  const isOn = light?.power === 'on'
  const colorHex = light ? getLightColorHex(light) : '#475569'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-fairy-500/20 bg-fairy-500/5 px-3 py-2.5 transition-colors">
      <div
        className={cn('h-4 w-4 shrink-0 rounded-full', !isOn && 'opacity-30')}
        style={{ backgroundColor: isOn ? colorHex : '#475569' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">
          {assignment.label}
        </p>
        <p className="text-xs text-slate-500">
          {isOn ? (
            <span className="text-fairy-400">On</span>
          ) : (
            <span>Off</span>
          )}
          {' \u00B7 '}
          {assignment.has_color ? 'Colour' : 'White only'}
        </p>
      </div>
      <button
        onClick={onIdentify}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-fairy-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Identify ${assignment.label}`}
        title="Flash this light"
      >
        <Zap className="h-4 w-4" />
      </button>
      <button
        onClick={onRemove}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Remove ${assignment.label} from this room`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Search state for lights
  const [lightSearch, setLightSearch] = useState('')

  // Active device tab
  const [activeTab, setActiveTab] = useState('lights')

  // Fetch room detail
  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['rooms', name],
    queryFn: () => api.rooms.get(name!),
    enabled: !!name,
  })

  // Fetch all rooms for parent selector
  const { data: allRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })

  // Fetch all LIFX lights
  const { data: allLights } = useQuery({
    queryKey: ['lifx', 'lights'],
    queryFn: api.lifx.getLights,
  })

  // Fetch all room assignments
  const { data: allAssignments } = useQuery({
    queryKey: ['lights', 'rooms'],
    queryFn: api.lights.getRoomAssignments,
  })

  // Room settings state
  const [displayOrder, setDisplayOrder] = useState<number | null>(null)
  const [timer, setTimer] = useState<number | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [parentRoom, setParentRoom] = useState<string | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)
  const [roomNameEdit, setRoomNameEdit] = useState<string | null>(null)

  // Compute effective values (from state or room data)
  const effectiveOrder = displayOrder ?? room?.display_order ?? 0
  const effectiveTimer = timer ?? room?.timer ?? 0
  const effectiveAuto = autoEnabled ?? room?.auto ?? false
  const effectiveParent = parentRoom ?? room?.parent_room ?? ''
  const effectiveSensors = sensors ?? room?.sensors ?? []
  const effectiveRoomName = roomNameEdit ?? room?.name ?? ''

  // Light assignment state
  const [assigned, setAssigned] = useState<LightAssignment[] | null>(null)
  const [dirty, setDirty] = useState(false)

  // Compute assigned lights (from state or room data)
  const effectiveAssigned: LightAssignment[] = useMemo(() => {
    if (assigned !== null) return assigned
    return (
      room?.lights.map(l => ({
        id: l.light_id,
        label: l.light_label,
        has_color: l.has_color,
        min_kelvin: l.min_kelvin,
        max_kelvin: l.max_kelvin,
      })) ?? []
    )
  }, [assigned, room])

  // IDs already assigned to ANY room
  const assignedToOtherRooms = useMemo(() => {
    if (!allAssignments) return new Set<string>()
    return new Set(
      allAssignments
        .filter(a => a.room_name !== name)
        .map(a => a.light_id),
    )
  }, [allAssignments, name])

  // Lights available to assign (not assigned to any room), grouped by LIFX group
  const availableLights = useMemo(() => {
    if (!allLights) return []
    const assignedIds = new Set(effectiveAssigned.map(a => a.id))
    return allLights.filter(
      l => !assignedIds.has(l.id) && !assignedToOtherRooms.has(l.id),
    )
  }, [allLights, effectiveAssigned, assignedToOtherRooms])

  // Group available lights by LIFX group
  const availableByGroup = useMemo(() => {
    const groups = new Map<string, Light[]>()
    for (const light of availableLights) {
      const groupName = light.group.name || 'Ungrouped'
      if (!groups.has(groupName)) groups.set(groupName, [])
      groups.get(groupName)!.push(light)
    }
    return groups
  }, [availableLights])

  // Filter assigned lights by search
  const filteredAssigned = useMemo(() => {
    if (!lightSearch.trim()) return effectiveAssigned
    const q = lightSearch.toLowerCase()
    return effectiveAssigned.filter(a => a.label.toLowerCase().includes(q))
  }, [effectiveAssigned, lightSearch])

  // Filter available lights by search
  const filteredAvailableByGroup = useMemo(() => {
    if (!lightSearch.trim()) return availableByGroup
    const q = lightSearch.toLowerCase()
    const filtered = new Map<string, Light[]>()
    for (const [group, lights] of availableByGroup) {
      const matching = lights.filter(l => l.label.toLowerCase().includes(q))
      if (matching.length > 0) filtered.set(group, matching)
    }
    return filtered
  }, [availableByGroup, lightSearch])

  // Build a map from light ID to Light object for assigned lights
  const lightById = useMemo(() => {
    if (!allLights) return new Map<string, Light>()
    return new Map(allLights.map(l => [l.id, l]))
  }, [allLights])

  // Other rooms for parent selector (exclude self)
  const parentRoomOptions = useMemo(() => {
    return (allRooms ?? []).filter(r => r.name !== name)
  }, [allRooms, name])

  // Mutations
  const identifyMutation = useMutation({
    mutationFn: (selector: string) => api.lifx.identify(selector),
  })

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      // Save room settings
      await api.rooms.update(name!, {
        display_order: effectiveOrder,
        timer: effectiveTimer,
        auto: effectiveAuto,
        parent_room: effectiveParent,
        sensors: effectiveSensors,
      })
      // Save light assignments
      await api.lights.saveForRoom(name!, effectiveAssigned)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['rooms', name] })
      queryClient.invalidateQueries({ queryKey: ['lights', 'rooms'] })
      setDirty(false)
      toast({ message: 'Room saved successfully' })
    },
    onError: () =>
      toast({ message: 'Failed to save room', type: 'error' }),
  })

  const deleteRoomMutation = useMutation({
    mutationFn: () => api.rooms.delete(name!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      navigate('/rooms')
      toast({ message: 'Room deleted' })
    },
    onError: () =>
      toast({ message: 'Failed to delete room', type: 'error' }),
  })

  // Handlers
  const handleAssign = (light: Light) => {
    const newAssigned = [...effectiveAssigned, toAssignment(light)]
    setAssigned(newAssigned)
    setDirty(true)
  }

  const handleUnassign = (id: string) => {
    const newAssigned = effectiveAssigned.filter(a => a.id !== id)
    setAssigned(newAssigned)
    setDirty(true)
  }

  const handleAddSensor = () => {
    setSensors([...effectiveSensors, { name: '', priority_threshold: 50 }])
    setDirty(true)
  }

  const handleUpdateSensor = (index: number, sensor: Sensor) => {
    const updated = [...effectiveSensors]
    updated[index] = sensor
    setSensors(updated)
    setDirty(true)
  }

  const handleRemoveSensor = (index: number) => {
    setSensors(effectiveSensors.filter((_, i) => i !== index))
    setDirty(true)
  }

  const markDirty = () => setDirty(true)

  if (roomLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-800" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-800" />
        <div className="h-60 animate-pulse rounded-xl bg-slate-800" />
      </div>
    )
  }

  if (!room) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-400">Room not found.</p>
        <Link
          to="/rooms"
          className="mt-2 inline-block text-sm text-fairy-400 hover:underline"
        >
          Back to rooms
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-28">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          to="/rooms"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        >
          <ArrowLeft className="h-4 w-4" />
          All Rooms
        </Link>

        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-100">
            {room.name}
          </h2>
        </div>

        {/* Parent room selector */}
        {parentRoomOptions.length > 0 && (
          <div className="mt-2">
            <label className="mr-2 text-xs font-medium text-slate-500">
              Parent room
            </label>
            <select
              value={effectiveParent}
              onChange={e => {
                setParentRoom(e.target.value)
                markDirty()
              }}
              className="h-9 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-sm text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              aria-label="Parent room"
            >
              <option value="">None</option>
              {parentRoomOptions.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Settings card ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-slate-400">
          Room Settings
        </h3>
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          {/* Auto toggle */}
          <div className="flex items-center justify-between">
            <label
              htmlFor="auto-toggle"
              className="text-sm font-medium text-slate-200"
            >
              Automation
            </label>
            <Switch.Root
              id="auto-toggle"
              checked={effectiveAuto}
              onCheckedChange={c => {
                setAutoEnabled(c)
                markDirty()
              }}
              className={cn(
                'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                effectiveAuto ? 'bg-fairy-500' : 'bg-slate-700',
              )}
            >
              <Switch.Thumb
                className={cn(
                  'block h-5 w-5 rounded-full bg-white shadow transition-transform',
                  effectiveAuto ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </Switch.Root>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Auto-off after inactivity (min)
              </label>
              <input
                type="number"
                min={0}
                value={effectiveTimer}
                onChange={e => {
                  setTimer(Number(e.target.value))
                  markDirty()
                }}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={effectiveOrder}
                onChange={e => {
                  setDisplayOrder(Number(e.target.value))
                  markDirty()
                }}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Devices section with tabs ───────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-slate-400">Devices</h3>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-900 p-1">
            <Tabs.Trigger
              value="lights"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
              )}
            >
              <Lightbulb className="h-4 w-4" />
              Lights
              {effectiveAssigned.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {effectiveAssigned.length}
                </span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="switches"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
              )}
            >
              <ToggleLeft className="h-4 w-4" />
              Switches
            </Tabs.Trigger>
            <Tabs.Trigger
              value="sensors"
              className={cn(
                'min-h-[44px] flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
                'data-[state=active]:bg-fairy-500 data-[state=active]:text-white',
                'data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
              )}
            >
              <Activity className="h-4 w-4" />
              Sensors
            </Tabs.Trigger>
          </Tabs.List>

          {/* ── Lights tab ───────────────────────────────────────────────────── */}
          <Tabs.Content value="lights" className="space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                placeholder="Search lights by name..."
                value={lightSearch}
                onChange={e => setLightSearch(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              />
            </div>

            {/* Assigned lights */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-slate-400">
                Assigned
                {effectiveAssigned.length > 0 && (
                  <span className="ml-1.5 text-slate-500">
                    ({effectiveAssigned.length})
                  </span>
                )}
              </h4>
              {filteredAssigned.length > 0 ? (
                <div className="space-y-2">
                  {filteredAssigned.map(a => (
                    <AssignedLightRow
                      key={a.id}
                      assignment={a}
                      light={lightById.get(a.id)}
                      onRemove={() => handleUnassign(a.id)}
                      onIdentify={() =>
                        identifyMutation.mutate(`id:${a.id}`)
                      }
                    />
                  ))}
                </div>
              ) : effectiveAssigned.length > 0 && lightSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  No assigned lights match "{lightSearch}".
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  No lights assigned to this room yet. Add them from below.
                </p>
              )}
            </div>

            {/* Available lights grouped by LIFX group */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-slate-400">
                Available
                {availableLights.length > 0 && (
                  <span className="ml-1.5 text-slate-500">
                    ({availableLights.length})
                  </span>
                )}
              </h4>
              {filteredAvailableByGroup.size > 0 ? (
                <div className="space-y-4">
                  {Array.from(filteredAvailableByGroup.entries()).map(
                    ([groupName, lights]) => (
                      <div key={groupName}>
                        <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {groupName}
                        </p>
                        <div className="space-y-2">
                          {lights.map(light => (
                            <AvailableLightRow
                              key={light.id}
                              light={light}
                              onAdd={() => handleAssign(light)}
                              onIdentify={() =>
                                identifyMutation.mutate(`id:${light.id}`)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : availableLights.length > 0 && lightSearch.trim() ? (
                <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  No available lights match "{lightSearch}".
                </p>
              ) : availableLights.length === 0 && allLights ? (
                <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  All lights have been assigned to rooms.
                </p>
              ) : !allLights ? (
                <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  No LIFX lights found. Check your LIFX connection.
                </p>
              ) : null}
            </div>
          </Tabs.Content>

          {/* ── Switches tab ─────────────────────────────────────────────────── */}
          <Tabs.Content value="switches" className="space-y-6">
            <div className="rounded-xl border border-dashed border-slate-700 py-10 text-center">
              <ToggleLeft className="mx-auto mb-3 h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">
                Hubitat switch management coming soon.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                You'll be able to assign on/off switches and dimmers to this room.
              </p>
            </div>
          </Tabs.Content>

          {/* ── Sensors tab ──────────────────────────────────────────────────── */}
          <Tabs.Content value="sensors" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Configure motion sensors and their priority thresholds.
              </p>
              <button
                onClick={handleAddSensor}
                className="min-h-[44px] flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Sensor
              </button>
            </div>

            {effectiveSensors.length > 0 ? (
              <div className="space-y-2">
                {effectiveSensors.map((sensor, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
                  >
                    <input
                      type="text"
                      value={sensor.name}
                      onChange={e =>
                        handleUpdateSensor(i, { ...sensor, name: e.target.value })
                      }
                      placeholder="Sensor name"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                    />
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="text-[10px] text-slate-500">
                        Priority
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={sensor.priority_threshold}
                        onChange={e =>
                          handleUpdateSensor(i, {
                            ...sensor,
                            priority_threshold: Number(e.target.value),
                          })
                        }
                        className="h-11 w-20 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-center text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveSensor(i)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
                      aria-label="Remove sensor"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                No sensors configured. Add a sensor to enable motion-based automation.
              </p>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </section>

      {/* ── Danger zone ────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-medium text-red-400">Danger Zone</h3>
        <button
          onClick={() => {
            if (window.confirm(`Delete "${room.name}"? This cannot be undone.`)) {
              deleteRoomMutation.mutate()
            }
          }}
          disabled={deleteRoomMutation.isPending}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          <Trash2 className="h-4 w-4" />
          {deleteRoomMutation.isPending ? 'Deleting...' : 'Delete Room'}
        </button>
      </section>

      {/* ── Sticky save bar ────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 p-4 backdrop-blur-sm md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            to="/rooms"
            className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
          >
            Cancel
          </Link>
          <button
            onClick={() => saveAllMutation.mutate()}
            disabled={saveAllMutation.isPending}
            className={cn(
              'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500',
              dirty
                ? 'bg-fairy-500 hover:bg-fairy-600'
                : 'bg-fairy-500/60 cursor-default',
              'disabled:opacity-50',
            )}
          >
            <Save className="h-4 w-4" />
            {saveAllMutation.isPending ? 'Saving...' : 'Save Room'}
          </button>
        </div>
      </div>
    </div>
  )
}
