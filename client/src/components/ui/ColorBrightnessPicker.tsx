import { useCallback, useRef, useEffect, useMemo } from 'react'
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
  // Debounced live change (300ms) for API calls
  const debouncedLiveChange = useMemo(() => {
    if (!onLiveChange) return undefined
    return debounce(
      (update: { color?: HslColor; kelvin?: number; brightness?: number }) => {
        onLiveChange(update)
      },
      300,
    )
  }, [onLiveChange])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      debouncedLiveChange?.cancel()
    }
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

  // Compute preview color
  const previewHex = hasColor
    ? hsbToHex(color.h, color.s / 100, brightness / 100)
    : kelvinToHex(kelvin)

  // Brightness gradient: black to current colour
  const brightnessGradient = `linear-gradient(to right, #0f172a, ${previewHex})`

  // Kelvin gradient: warm amber to cool blue-white
  const kelvinGradient = `linear-gradient(to right, #ff8a00, ${kelvinToHex(Math.round((minKelvin + maxKelvin) / 2))}, #b4d7ff)`

  return (
    <div className="space-y-5">
      {/* Colour preview */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-700 shadow-inner"
          style={{
            backgroundColor: previewHex,
            opacity: brightness / 100 || 0.05,
          }}
          aria-hidden="true"
        />
        <div className="text-sm text-slate-400">
          {hasColor
            ? `HSL ${Math.round(color.h)}\u00B0 ${Math.round(color.s)}% \u00B7 ${brightness}%`
            : `${kelvin}K \u00B7 ${brightness}%`}
        </div>
      </div>

      {/* Colour picker or kelvin slider */}
      {hasColor ? (
        <div className="color-picker-fullrange overflow-hidden rounded-xl">
          <HslColorPicker
            color={{ h: color.h, s: color.s, l: color.l }}
            onChange={handleColorChange}
          />
          <style>{`
            .color-picker-fullrange .react-colorful {
              width: 100% !important;
              min-width: 240px;
            }
            .color-picker-fullrange .react-colorful__hue {
              border-radius: 8px;
              height: 24px;
            }
            .color-picker-fullrange .react-colorful__saturation {
              border-radius: 12px 12px 0 0;
              min-height: 200px;
            }
            .color-picker-fullrange .react-colorful__pointer {
              width: 24px;
              height: 24px;
              border-width: 3px;
            }
          `}</style>
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
              className={cn(
                'slider-touch relative z-10 h-11 w-full cursor-pointer appearance-none rounded-lg bg-transparent',
              )}
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
        <div className="relative">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brightness}
            onChange={handleBrightnessChange}
            className={cn(
              'slider-touch h-11 w-full cursor-pointer appearance-none rounded-lg',
            )}
            style={{ background: brightnessGradient }}
            aria-label="Brightness"
          />
        </div>
      </div>

      {/* Touch-friendly slider styles */}
      <style>{`
        .slider-touch::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 2px solid rgba(148, 163, 184, 0.5);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }
        .slider-touch::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          border: 2px solid rgba(148, 163, 184, 0.5);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }
        .slider-touch::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        .slider-touch::-moz-range-track {
          height: 8px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  )
}
