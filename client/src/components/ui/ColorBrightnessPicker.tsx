import { useCallback, useEffect, useMemo } from 'react'
import { HslColorPicker, type HslColor } from 'react-colorful'
import { cn, kelvinToHex, hsbToHex, debounce } from '@/lib/utils'

interface ColorBrightnessPickerProps {
  hasColor: boolean
  color: HslColor
  kelvin: number
  brightness: number
  minKelvin?: number
  maxKelvin?: number
  onChange: (update: { color?: HslColor; kelvin?: number; brightness?: number }) => void
  onLiveChange?: (update: { color?: HslColor; kelvin?: number; brightness?: number }) => void
}

export default function ColorBrightnessPicker({
  hasColor,
  color,
  kelvin,
  brightness,
  minKelvin = 2500,
  maxKelvin = 9000,
  onChange,
  onLiveChange,
}: ColorBrightnessPickerProps) {
  const debouncedLiveChange = useMemo(() => {
    if (!onLiveChange) return undefined
    return debounce(
      (update: { color?: HslColor; kelvin?: number; brightness?: number }) => {
        onLiveChange(update)
      },
      300,
    )
  }, [onLiveChange])

  useEffect(() => {
    return () => { debouncedLiveChange?.cancel() }
  }, [debouncedLiveChange])

  const handleColorChange = useCallback(
    (c: HslColor) => {
      onChange({ color: c })
      debouncedLiveChange?.({ color: c })
    },
    [onChange, debouncedLiveChange],
  )

  const handleKelvinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = Number(e.target.value)
      onChange({ kelvin: k })
      debouncedLiveChange?.({ kelvin: k })
    },
    [onChange, debouncedLiveChange],
  )

  const handleBrightnessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const b = Number(e.target.value)
      onChange({ brightness: b })
      debouncedLiveChange?.({ brightness: b })
    },
    [onChange, debouncedLiveChange],
  )

  const previewHex = hasColor
    ? hsbToHex(color.h, color.s / 100, brightness / 100)
    : kelvinToHex(kelvin)

  const brightnessGradient = `linear-gradient(to right, #0f172a, ${previewHex})`
  const kelvinGradient = `linear-gradient(to right, #ff8a00, ${kelvinToHex(Math.round((minKelvin + maxKelvin) / 2))}, #b4d7ff)`

  return (
    <div className="space-y-5">
      {/* Colour preview swatch + label */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-700 shadow-inner"
          style={{ backgroundColor: previewHex, opacity: brightness / 100 || 0.05 }}
          aria-hidden="true"
        />
        <div className="text-sm text-slate-400">
          {hasColor
            ? `HSL ${Math.round(color.h)}° ${Math.round(color.s)}% · ${brightness}%`
            : `${kelvin}K · ${brightness}%`}
        </div>
      </div>

      {/* Colour picker or kelvin slider */}
      {hasColor ? (
        <div className="fairy-picker">
          <HslColorPicker
            color={{ h: color.h, s: color.s, l: color.l }}
            onChange={handleColorChange}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-400">
            Colour Temperature
          </label>
          <div className="relative">
            <input
              type="range"
              min={minKelvin}
              max={maxKelvin}
              step={100}
              value={kelvin}
              onChange={handleKelvinChange}
              className="fairy-slider w-full"
              style={{ background: kelvinGradient }}
              aria-label="Colour temperature"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>Warm {minKelvin}K</span>
              <span>Cool {maxKelvin}K</span>
            </div>
          </div>
        </div>
      )}

      {/* Brightness slider */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Brightness</span>
          <span className="text-slate-300">{brightness}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={brightness}
          onChange={handleBrightnessChange}
          className="fairy-slider w-full"
          style={{ background: brightnessGradient }}
          aria-label="Brightness"
        />
      </div>

      {/*
        Styles for the colour picker and sliders.
        Scoped via .fairy-picker and .fairy-slider class names.
        Key fixes:
        - Hue bar: 28px tall, large 28px pointer, visible border
        - Saturation area: 240px min height, large pointer
        - Sliders: 12px track, 28px thumb, generous touch padding
      */}
      <style>{`
        /* ── react-colorful overrides ─────────────────── */
        .fairy-picker .react-colorful {
          width: 100% !important;
          min-width: 240px;
          gap: 12px;
        }

        /* Saturation/lightness panel */
        .fairy-picker .react-colorful__saturation {
          min-height: 240px;
          border-radius: 12px;
        }

        /* Hue bar — make it tall and easy to grab */
        .fairy-picker .react-colorful__hue {
          height: 28px !important;
          border-radius: 14px;
        }

        /* All pointers (saturation + hue) — big, visible, touch-friendly */
        .fairy-picker .react-colorful__pointer {
          width: 28px !important;
          height: 28px !important;
          border-width: 3px !important;
          border-color: white !important;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.4) !important;
        }

        /* Hue pointer specifically — add a coloured fill to match position */
        .fairy-picker .react-colorful__hue .react-colorful__pointer {
          width: 32px !important;
          height: 32px !important;
        }

        /* Ensure interactive area is large enough for touch (44px) */
        .fairy-picker .react-colorful__interactive {
          min-height: 44px;
        }

        /* ── Range slider overrides ──────────────────── */
        .fairy-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 12px;
          border-radius: 6px;
          outline: none;
          cursor: pointer;
          /* Add vertical padding for touch target without changing visual height */
          padding: 16px 0;
          background-clip: content-box;
          box-sizing: content-box;
        }

        .fairy-slider:focus-visible {
          outline: 2px solid #10b981;
          outline-offset: 2px;
        }

        /* Webkit thumb (Chrome, Safari) */
        .fairy-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgba(148, 163, 184, 0.6);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          margin-top: -8px; /* Centre on the 12px track */
        }
        .fairy-slider:active::-webkit-slider-thumb {
          transform: scale(1.15);
          border-color: #10b981;
        }

        /* Webkit track */
        .fairy-slider::-webkit-slider-runnable-track {
          height: 12px;
          border-radius: 6px;
        }

        /* Firefox thumb */
        .fairy-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 3px solid rgba(148, 163, 184, 0.6);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          cursor: pointer;
        }
        .fairy-slider:active::-moz-range-thumb {
          transform: scale(1.15);
          border-color: #10b981;
        }

        /* Firefox track */
        .fairy-slider::-moz-range-track {
          height: 12px;
          border-radius: 6px;
          background: transparent;
        }
      `}</style>
    </div>
  )
}
