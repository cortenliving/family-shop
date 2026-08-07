import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'

interface Props {
  onResult: (barcode: string) => void
  onClose: () => void
}

const GROCERY_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]

/** Basic EAN/UPC check digit (works for EAN-13 / UPC-A). */
function looksLikeProductCode(code: string): boolean {
  const digits = code.replace(/\D/g, '')
  if (digits.length === 8 || digits.length === 12 || digits.length === 13) {
    return true
  }
  // CODE-128 etc.
  return code.trim().length >= 6
}

function eanChecksumOk(code: string): boolean {
  const d = code.replace(/\D/g, '')
  if (d.length !== 8 && d.length !== 12 && d.length !== 13) return true
  const body = d.slice(0, -1)
  const check = Number(d.slice(-1))
  let sum = 0
  // right-to-left: odd positions *3, even *1 (GS1)
  const chars = body.split('').reverse()
  for (let i = 0; i < chars.length; i++) {
    const n = Number(chars[i])
    sum += i % 2 === 0 ? n * 3 : n
  }
  return (10 - (sum % 10)) % 10 === check
}

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
}

function getNativeDetector(): NativeBarcodeDetector | null {
  // Chrome/Android — excellent. Not on iOS Safari yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (window as any).BarcodeDetector
  if (!BD) return null
  try {
    return new BD({
      formats: [
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'code_128',
        'code_39',
        'itf',
        'qr_code',
      ],
    }) as NativeBarcodeDetector
  } catch {
    try {
      return new BD() as NativeBarcodeDetector
    } catch {
      return null
    }
  }
}

/**
 * Mobile-first barcode scanner.
 * - Native BarcodeDetector when available (Android Chrome)
 * - ZXing continuous video decode (iOS Safari / PWA)
 * - Full-frame decode (no crop mismatch with object-cover)
 * - Single confirmed read for valid EAN checksums
 */
export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  const streamRef = useRef<MediaStream | null>(null)
  const handled = useRef(false)
  const lastCandidate = useRef<{ code: string; count: number } | null>(null)
  const loopRef = useRef(0)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [manual, setManual] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [engine, setEngine] = useState('')

  onResultRef.current = onResult

  const acceptCode = useCallback((raw: string) => {
    if (handled.current) return
    const code = raw.trim()
    if (!looksLikeProductCode(code)) return

    // Prefer valid check-digit codes immediately
    const digits = code.replace(/\D/g, '')
    const strong =
      (digits.length === 8 || digits.length === 12 || digits.length === 13) &&
      eanChecksumOk(digits)

    const prev = lastCandidate.current
    if (prev && prev.code === code) {
      prev.count += 1
    } else {
      lastCandidate.current = { code, count: 1 }
    }

    // 1 hit if checksum OK, else 2 matching hits
    const need = strong ? 1 : 2
    if ((lastCandidate.current?.count ?? 0) < need) {
      setStatus(`Hold steady… ${code}`)
      return
    }

    handled.current = true
    const finalCode = digits.length >= 8 ? digits : code
    setStatus(`Got it: ${finalCode}`)
    try {
      controlsRef.current?.stop()
    } catch {
      /* ignore */
    }
    window.setTimeout(() => onResultRef.current(finalCode), 100)
  }, [])

  useEffect(() => {
    let active = true
    const nativeDetector = getNativeDetector()

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not available')
        }

        setStatus('Requesting camera…')

        // iOS-friendly: don't over-constrain resolution first
        const constraintAttempts: MediaStreamConstraints[] = [
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
        for (const c of constraintAttempts) {
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
        const track = stream.getVideoTracks()[0] ?? null

        if (track) {
          const caps = track.getCapabilities?.() as
            | { torch?: boolean }
            | undefined
          setTorchSupported(Boolean(caps && 'torch' in caps && caps.torch))
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

        // Critical for iOS
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.muted = true
        video.playsInline = true
        video.autoplay = true
        video.srcObject = stream

        // Wait until we have frames
        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(
            () => reject(new Error('Camera timed out')),
            12000,
          )
          const done = () => {
            window.clearTimeout(t)
            resolve()
          }
          if (video.readyState >= 2 && video.videoWidth > 0) {
            done()
            return
          }
          video.onloadedmetadata = () => {
            void video
              .play()
              .then(done)
              .catch(() => done())
          }
          void video.play().catch(() => {
            /* wait for metadata */
          })
        })

        if (!active) return

        setScanning(true)
        setStatus('Point at the barcode — fill the green box')

        // ---------- Path A: Native BarcodeDetector (Android Chrome) ----------
        if (nativeDetector) {
          setEngine('Native')
          const tick = async () => {
            if (!active || handled.current) return
            try {
              if (video.readyState >= 2 && video.videoWidth > 0) {
                const codes = await nativeDetector.detect(video)
                if (codes?.length) {
                  const v = codes[0]?.rawValue
                  if (v) acceptCode(v)
                }
              }
            } catch {
              /* keep scanning */
            }
            if (active && !handled.current) {
              loopRef.current = window.setTimeout(() => void tick(), 80)
            }
          }
          void tick()
          return
        }

        // ---------- Path B: ZXing continuous decode (iOS + others) ----------
        setEngine('ZXing')
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, GROCERY_FORMATS)
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
          delayBetweenScanSuccess: 300,
          tryPlayVideoTimeout: 10000,
        })
        readerRef.current = reader

        // decodeFromStream is reliable when we already have the stream
        // Fall back to decodeFromConstraints / decodeFromVideoDevice
        try {
          controlsRef.current = await reader.decodeFromStream(
            stream,
            video,
            (result, err) => {
              if (!active || handled.current) return
              if (result) {
                acceptCode(result.getText())
                return
              }
              // Swallow NotFound — normal while aiming
              if (err && !(err instanceof NotFoundException)) {
                const name = (err as { name?: string }).name
                if (
                  name &&
                  name !== 'NotFoundException' &&
                  name !== 'ChecksumException' &&
                  name !== 'FormatException'
                ) {
                  // ignore transient decode errors
                }
              }
            },
          )
        } catch {
          // Fallback: decodeFromVideoElement continuous
          controlsRef.current = await reader.decodeFromVideoElement(
            video,
            (result) => {
              if (!active || handled.current) return
              if (result) acceptCode(result.getText())
            },
          )
        }

        setStatus('Scanning… hold barcode steady in the box')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const denied = /Permission|NotAllowed|denied|secure/i.test(msg)
        setError(
          denied
            ? 'Camera blocked. On iPhone: Settings → Safari → Camera → Allow, then reopen the app from the Home Screen icon. Or type the numbers below.'
            : `Camera error: ${msg}. You can type the barcode below.`,
        )
        setStatus('Camera unavailable')
      }
    }

    void start()

    return () => {
      active = false
      window.clearTimeout(loopRef.current)
      try {
        controlsRef.current?.stop()
      } catch {
        /* ignore */
      }
      controlsRef.current = null
      try {
        // @ts-expect-error reset exists on browser reader
        readerRef.current?.reset?.()
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [acceptCode])

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
        <div>
          <h2 className="text-base font-semibold">Scan barcode</h2>
          {engine ? (
            <p className="text-[10px] text-slate-400">{engine} engine</p>
          ) : null}
        </div>
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

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          autoPlay
          {...{ 'webkit-playsinline': 'true' }}
        />

        {/* Guide only — decoding uses full frame so aim doesn't have to be perfect */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative w-[90%] max-w-sm">
            <div
              className="h-36 w-full rounded-2xl border-[3px] border-teal-400"
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }}
            />
            {scanning && !handled.current ? (
              <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-teal-300/90 shadow-[0_0_12px_#5eead4]" />
            ) : null}
          </div>
          <p className="mt-4 max-w-xs px-4 text-center text-sm font-medium text-white drop-shadow">
            Line up the bars inside the box · keep still for a second
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
          Use good light · hold ~15 cm away · try landscape if it won’t lock
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
