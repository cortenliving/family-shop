import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
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

function buildReader(): MultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, GROCERY_FORMATS)
  hints.set(DecodeHintType.TRY_HARDER, true)
  // Don't require EAN extensions — most grocery packs don't have them
  const reader = new MultiFormatReader()
  reader.setHints(hints)
  return reader
}

/**
 * High-reliability grocery barcode scanner.
 * Crops to a wide centre band (best for EAN/UPC), upscales, and
 * runs continuous decode with confirmation — much better on iPhone
 * than full-frame zxing defaults.
 */
export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onResultRef = useRef(onResult)
  const streamRef = useRef<MediaStream | null>(null)
  const handled = useRef(false)
  const lastCandidate = useRef<{ code: string; count: number } | null>(null)
  const rafRef = useRef<number>(0)
  const lastDecodeAt = useRef(0)

  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [manual, setManual] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [scanning, setScanning] = useState(false)

  onResultRef.current = onResult

  const acceptCode = useCallback((raw: string) => {
    if (handled.current) return
    // Keep digits for product barcodes; allow alphanumeric for CODE128 etc.
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
    // Tiny delay so user sees confirmation
    window.setTimeout(() => onResultRef.current(code), 120)
  }, [])

  const decodeFrame = useCallback(() => {
    if (handled.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const now = performance.now()
    // ~8–12 attempts/sec is enough; keeps CPU cooler on phones
    if (now - lastDecodeAt.current < 90) return
    lastDecodeAt.current = now

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    // Wide horizontal ROI — matches EAN-13 strips better than a square box
    const roiW = Math.floor(vw * 0.88)
    const roiH = Math.floor(vh * 0.28)
    const sx = Math.floor((vw - roiW) / 2)
    const sy = Math.floor((vh - roiH) / 2)

    // Upscale for thin print on packaging
    const scale = 2
    const dw = roiW * scale
    const dh = roiH * scale
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, dw, dh)

    // Try normal + inverted (some packs print light-on-dark / glossy)
    const attempts: ImageData[] = []
    attempts.push(ctx.getImageData(0, 0, dw, dh))

    // Contrast boost into a second buffer
    const boosted = ctx.getImageData(0, 0, dw, dh)
    const d = boosted.data
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
      // stretch contrast
      const v = Math.max(0, Math.min(255, (g - 100) * 1.6 + 128))
      d[i] = d[i + 1] = d[i + 2] = v
    }
    attempts.push(boosted)

    // Inverted
    const inv = ctx.getImageData(0, 0, dw, dh)
    const id = inv.data
    for (let i = 0; i < id.length; i += 4) {
      id[i] = 255 - id[i]!
      id[i + 1] = 255 - id[i + 1]!
      id[i + 2] = 255 - id[i + 2]!
    }
    attempts.push(inv)

    const reader = buildReader()

    for (const imageData of attempts) {
      try {
        const luminances = new Uint8ClampedArray(dw * dh)
        const px = imageData.data
        for (let i = 0, j = 0; i < px.length; i += 4, j++) {
          luminances[j] =
            (px[i]! * 306 + px[i + 1]! * 601 + px[i + 2]! * 117) >> 10
        }
        const source = new RGBLuminanceSource(luminances, dw, dh)
        const bitmap = new BinaryBitmap(new HybridBinarizer(source))
        const result = reader.decodeWithState(bitmap)
        const text = result.getText()
        if (text) {
          acceptCode(text)
          return
        }
      } catch (e) {
        if (
          e instanceof NotFoundException ||
          e instanceof ChecksumException ||
          e instanceof FormatException
        ) {
          // expected when no barcode in frame
        } else if (e && typeof e === 'object' && 'name' in e) {
          const name = String((e as { name: string }).name)
          if (
            name === 'NotFoundException' ||
            name === 'ChecksumException' ||
            name === 'FormatException'
          ) {
            // ignore
          }
        }
      } finally {
        reader.reset()
      }
    }
  }, [acceptCode])

  useEffect(() => {
    let active = true
    let track: MediaStreamTrack | null = null

    const start = async () => {
      try {
        setStatus('Requesting camera…')

        // Prefer rear camera + high res for small barcode print
        const constraintsList: MediaStreamConstraints[] = [
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          {
            audio: false,
            video: { facingMode: 'environment' },
          },
          {
            audio: false,
            video: true,
          },
        ]

        let stream: MediaStream | null = null
        let lastErr: unknown
        for (const c of constraintsList) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c)
            break
          } catch (e) {
            lastErr = e
          }
        }
        if (!stream) throw lastErr ?? new Error('No camera')

        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        track = stream.getVideoTracks()[0] ?? null

        // Torch support
        if (track) {
          const caps = track.getCapabilities?.() as
            | { torch?: boolean; focusMode?: string[] }
            | undefined
          setTorchSupported(Boolean(caps && 'torch' in caps && caps.torch))
          // Try continuous focus (not in standard TS DOM types)
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
          } catch {
            /* ignore */
          }
        }

        const video = videoRef.current
        if (!video) return
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play()

        setScanning(true)
        setStatus('Point at the barcode — hold steady')

        const loop = () => {
          if (!active || handled.current) return
          decodeFrame()
          rafRef.current = window.setTimeout(loop, 50) as unknown as number
        }
        loop()
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
      window.clearTimeout(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [decodeFrame])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
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
        {/* Hidden processing canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Wide viewfinder for 1D grocery barcodes */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative w-[92%] max-w-md">
            <div
              className="h-28 w-full rounded-2xl border-2 border-teal-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
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
