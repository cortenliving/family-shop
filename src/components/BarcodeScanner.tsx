import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser'
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
  ChecksumException,
  FormatException,
} from '@zxing/library'

interface Props {
  onResult: (barcode: string) => void
  onClose: () => void
}

/** Formats most supermarket packaging uses. */
const GROCERY_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]

function buildHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, GROCERY_FORMATS)
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

/**
 * Reliable grocery barcode scanner using @zxing/browser continuous decode.
 * Much more stable on iPhone/Safari than a hand-rolled canvas loop.
 */
export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  const controlsRef = useRef<IScannerControls | null>(null)
  const handled = useRef(false)
  const lastCandidate = useRef<{ code: string; count: number } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [manual, setManual] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [scanning, setScanning] = useState(false)

  onResultRef.current = onResult

  const acceptCode = useCallback((raw: string) => {
    if (handled.current) return
    const code = raw.trim()
    if (!code || code.length < 4) return

    const prev = lastCandidate.current
    if (prev && prev.code === code) {
      prev.count += 1
    } else {
      lastCandidate.current = { code, count: 1 }
    }

    // Require 2 consecutive same reads to avoid flaky false positives
    if ((lastCandidate.current?.count ?? 0) < 2) {
      setStatus(`Hold steady… ${code}`)
      return
    }

    handled.current = true
    setStatus(`Got it: ${code}`)
    // Stop the scanner immediately
    try {
      controlsRef.current?.stop()
    } catch {
      /* ignore */
    }
    controlsRef.current = null
    // Tiny delay so user sees confirmation
    window.setTimeout(() => onResultRef.current(code), 120)
  }, [])

  useEffect(() => {
    let active = true
    // hints + timeBetweenScansMillis (works across @zxing/browser versions)
    const reader = new BrowserMultiFormatReader(buildHints(), 100)

    const start = async () => {
      try {
        setStatus('Requesting camera…')

        const video = videoRef.current
        if (!video) return

        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.muted = true
        video.playsInline = true

        // Prefer rear camera with decent resolution
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }

        const controls = await reader.decodeFromConstraints(
          constraints,
          video,
          (result, err) => {
            if (!active || handled.current) return

            if (result) {
              const text = result.getText()
              if (text) acceptCode(text)
              return
            }

            // Expected "nothing found" errors — ignore
            if (
              err instanceof NotFoundException ||
              err instanceof ChecksumException ||
              err instanceof FormatException
            ) {
              return
            }
            if (err && typeof err === 'object' && 'name' in err) {
              const name = String((err as { name: string }).name)
              if (
                name === 'NotFoundException' ||
                name === 'ChecksumException' ||
                name === 'FormatException' ||
                (typeof (err as { message?: string }).message === 'string' &&
                  (err as { message: string }).message.includes(
                    'No MultiFormat Readers were able',
                  ))
              ) {
                return
              }
            }
          },
        )

        if (!active) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setScanning(true)
        setStatus('Point at the barcode — hold steady')

        // Probe torch support after stream is live
        try {
          const stream = video.srcObject as MediaStream | null
          const track = stream?.getVideoTracks()?.[0]
          if (track) {
            const caps = track.getCapabilities?.() as
              | { torch?: boolean }
              | undefined
            setTorchSupported(Boolean(caps && 'torch' in caps && caps.torch))
            // Prefer continuous autofocus when available
            try {
              await track.applyConstraints({
                // @ts-expect-error focusMode is not in all TS DOM libs
                advanced: [{ focusMode: 'continuous' }],
              })
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          /Permission|NotAllowed|denied/i.test(msg)
            ? 'Camera access denied. In iPhone Settings → Safari → Camera, allow access — or type the barcode below.'
            : 'Could not start camera. Type the barcode below instead.',
        )
        setStatus('Camera unavailable')
      }
    }

    void start()

    return () => {
      active = false
      handled.current = true
      try {
        controlsRef.current?.stop()
      } catch {
        /* ignore */
      }
      controlsRef.current = null
      try {
        reader.reset()
      } catch {
        /* ignore */
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [acceptCode])

  const toggleTorch = async () => {
    const video = videoRef.current
    const stream = video?.srcObject as MediaStream | null
    const track = stream?.getVideoTracks()?.[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        // @ts-expect-error torch is not in all TS DOM libs
        advanced: [{ torch: next }],
      })
      setTorchOn(next)
    } catch {
      setStatus('Torch not available on this device')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <h2 className="text-base font-semibold">Scan barcode</h2>
        <div className="flex items-center gap-2">
          {torchSupported ? (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                torchOn ? 'bg-amber-400 text-black' : 'bg-white/15'
              }`}
            >
              {torchOn ? 'Flash on' : 'Flash'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />

        {/* Wide viewfinder for 1D grocery barcodes */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative w-[92%] max-w-md">
            <div
              className="h-28 w-full rounded-2xl border-2 border-teal-400"
              style={{
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              }}
            />
            {/* Scan line animation */}
            {scanning && !handled.current ? (
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-teal-300/90" />
            ) : null}
          </div>
          <p className="mt-4 max-w-xs px-4 text-center text-sm font-medium text-white drop-shadow">
            Fill the box with the barcode (sideways is fine)
          </p>
        </div>
      </div>

      <div
        className="space-y-2 bg-slate-950 px-4 pt-3 text-white"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {error ? (
          <p className="text-sm text-amber-300">{error}</p>
        ) : (
          <p className="text-center text-sm text-slate-300">{status}</p>
        )}
        <p className="text-center text-[11px] text-slate-500">
          Tip: good light, hold 10–20 cm away, keep the whole barcode in the box
        </p>
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
            placeholder="Or type barcode numbers"
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
