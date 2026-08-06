import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

interface Props {
  onResult: (barcode: string) => void
  onClose: () => void
}

/**
 * Camera barcode scanner optimised for iOS Safari:
 * - playsInline + muted for autoplay policy
 * - rear camera preferred
 * - proper cleanup of tracks on unmount
 */
export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const handled = useRef(false)

  onResultRef.current = onResult

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let active = true
    let controls: { stop: () => void } | null = null

    const start = async () => {
      try {
        if (!videoRef.current) return
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, _err, ctrl) => {
            if (!active) return
            controls = ctrl
            if (result && !handled.current) {
              const text = result.getText()
              if (text) {
                handled.current = true
                onResultRef.current(text)
              }
            }
          },
        )
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'Camera permission denied or unavailable'
        setError(
          msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Camera access denied. Allow camera in Safari settings, or type the barcode below.'
            : 'Could not start camera. You can type the barcode instead.',
        )
      }
    }

    void start()

    return () => {
      active = false
      try {
        controls?.stop()
      } catch {
        /* ignore */
      }
      // Extra safety for iOS track cleanup
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div
        className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white"
      >
        <h2 className="text-base font-semibold">Scan barcode</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-[80%] max-w-sm rounded-2xl border-2 border-teal-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      <div
        className="space-y-2 bg-slate-950 px-4 pt-3 text-white"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {error ? <p className="text-sm text-amber-300">{error}</p> : (
          <p className="text-center text-sm text-slate-300">
            Align the barcode inside the frame
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) onResult(manual.trim())
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Or type barcode"
            className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 text-base text-white outline-none ring-teal-500 focus:ring-2"
          />
          <button
            type="submit"
            className="min-h-12 rounded-2xl bg-teal-600 px-4 font-semibold"
          >
            Go
          </button>
        </form>
      </div>
    </div>
  )
}
