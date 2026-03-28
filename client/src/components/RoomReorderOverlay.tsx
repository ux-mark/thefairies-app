import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { api, type Room } from '@/lib/api'
import { LucideIcon } from '@/components/ui/LucideIcon'
import { useToast } from '@/hooks/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomReorderOverlayProps {
  rooms: Room[]
  open: boolean
  onClose: () => void
}

// ── Sortable room card ────────────────────────────────────────────────────────

interface SortableRoomCardProps {
  room: Room
}

function SortableRoomCard({ room }: SortableRoomCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 rounded-lg border border-[var(--border-primary)] bg-slate-800/80 px-3 py-2.5 select-none',
        isDragging
          ? 'scale-[1.02] shadow-lg shadow-black/40 opacity-95 z-10 relative'
          : 'shadow-sm',
      ].join(' ')}
    >
      {/* Room icon */}
      <span className="shrink-0 text-fairy-400" aria-hidden="true">
        <LucideIcon name={room.icon} className="h-4 w-4" />
      </span>

      {/* Room name */}
      <span className="flex-1 text-sm font-medium text-heading">{room.name}</span>

      {/* Drag handle — 44x44 touch target */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 hover:text-slate-300 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
        aria-label={`Drag to reorder ${room.name}`}
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  )
}

// ── Inner content (remounted on each open to reset drag state) ────────────────

interface RoomReorderContentProps {
  initialRooms: Room[]
  onDone: (rooms: Room[]) => void
  onCancel: () => void
  isSaving: boolean
  firstFocusRef: React.RefObject<HTMLButtonElement | null>
}

function RoomReorderContent({
  initialRooms,
  onDone,
  onCancel,
  isSaving,
  firstFocusRef,
}: RoomReorderContentProps) {
  // Initialising state directly from props is the correct React pattern when
  // the component is remounted (via key) each time the session starts.
  const [orderedRooms, setOrderedRooms] = useState(initialRooms)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedRooms(prev => {
      const oldIndex = prev.findIndex(r => r.name === active.id)
      const newIndex = prev.findIndex(r => r.name === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-primary)] px-4 py-3">
        <button
          ref={firstFocusRef}
          onClick={onCancel}
          disabled={isSaving}
          className="min-h-[44px] min-w-[44px] text-sm text-slate-400 hover:text-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:opacity-50"
        >
          Cancel
        </button>

        <h2 className="text-sm font-semibold text-heading">Reorder rooms</h2>

        <button
          onClick={() => onDone(orderedRooms)}
          disabled={isSaving}
          className="min-h-[44px] min-w-[44px] text-sm font-semibold text-fairy-400 hover:text-fairy-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Done'}
        </button>
      </div>

      {/* Instruction hint */}
      <p className="shrink-0 px-4 pt-3 pb-1 text-xs text-caption">
        Drag the handle on the right to reorder rooms.
      </p>

      {/* Sortable list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedRooms.map(r => r.name)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2" aria-label="Rooms — drag to reorder">
              {orderedRooms.map(room => (
                <SortableRoomCard key={room.name} room={room} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export default function RoomReorderOverlay({ rooms, open, onClose }: RoomReorderOverlayProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null)

  // Each time the overlay opens we generate a new key so RoomReorderContent
  // remounts and its useState re-initialises from the latest sorted rooms.
  // We track the previous open value in state to detect the open transition
  // without using a ref during render or setState inside an effect.
  const [sessionKey, setSessionKey] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSessionKey(k => k + 1)
    }
  }

  const sortedRooms = [...rooms].sort((a, b) => a.display_order - b.display_order)

  // Move focus into the overlay when it opens
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => firstFocusableRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [open])

  // Keyboard: Escape closes, Tab traps focus within the overlay
  useEffect(() => {
    if (!open) return
    const el = overlayRef.current
    if (!el) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (reorderedRooms: Room[]) => {
      const items = reorderedRooms.map((room, i) => ({
        name: room.name,
        display_order: i,
      }))
      return api.rooms.reorder(items)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast({ message: 'Room order saved' })
      onClose()
    },
    onError: () => {
      toast({ message: 'Failed to save room order. Please try again.', type: 'error' })
    },
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reorder rooms"
        className={[
          'fixed inset-x-0 bottom-0 z-50 flex flex-col bg-slate-900 transition-transform duration-300 ease-out',
          // Respect the bottom nav bar (~64px) and limit height to usable viewport
          'max-h-[calc(100dvh-4rem)]',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ borderRadius: '1rem 1rem 0 0' }}
      >
        <RoomReorderContent
          key={sessionKey}
          initialRooms={sortedRooms}
          onDone={reorderedRooms => saveMutation.mutate(reorderedRooms)}
          onCancel={onClose}
          isSaving={saveMutation.isPending}
          firstFocusRef={firstFocusableRef}
        />
      </div>
    </>
  )
}
