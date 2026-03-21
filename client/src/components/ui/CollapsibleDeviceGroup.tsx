import { useState, useRef, useEffect } from 'react'
import { ChevronRight, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CollapsibleDeviceGroupProps {
  title: string
  count: number
  totalInGroup: number
  defaultOpen?: boolean
  onAssignAll?: () => void
  fullyAssigned?: boolean
  children: React.ReactNode
}

export function CollapsibleDeviceGroup({
  title,
  count,
  totalInGroup,
  defaultOpen = false,
  onAssignAll,
  fullyAssigned = false,
  children,
}: CollapsibleDeviceGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number>(0)

  // Sync defaultOpen changes (e.g. when search auto-expands)
  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height)
        }
      })
      observer.observe(contentRef.current)
      return () => observer.disconnect()
    }
  }, [])

  return (
    <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3 hover:surface transition-colors">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="flex flex-1 items-center gap-2 min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500 rounded"
          aria-expanded={open}
          aria-controls={`group-${title}`}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-caption transition-transform duration-200',
              open && 'rotate-90',
            )}
          />
          <span className="text-sm font-medium text-heading">{title}</span>
          <span className="rounded-full bg-[var(--border-secondary)] px-2 py-0.5 text-[10px] font-medium text-body">
            {count}
          </span>
          {fullyAssigned && (
            <Check className="h-3.5 w-3.5 text-fairy-400" aria-label="All assigned" />
          )}
        </button>

        {onAssignAll && count > 0 && !fullyAssigned && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAssignAll()
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-[11px] font-medium text-fairy-400 transition-colors hover:bg-fairy-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairy-500"
            aria-label={`Assign all ${count} from ${title}`}
          >
            <Plus className="h-3 w-3" />
            Assign all
          </button>
        )}
      </div>

      {/* Content with animated height */}
      <div
        id={`group-${title}`}
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: open ? contentHeight + 16 : 0 }}
        aria-hidden={!open}
      >
        <div ref={contentRef} className="px-3 pb-3 pt-1">
          {children}
        </div>
      </div>
    </div>
  )
}
