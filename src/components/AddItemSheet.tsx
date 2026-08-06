import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  categoryLabel,
  detectCategoryFromName,
} from '../lib/detectCategory'
import { CATEGORIES, type CategoryId } from '../types'
import { useShopStore } from '../store/useShopStore'

const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
)

interface Props {
  open: boolean
  onClose: () => void
  defaultAddToWeek?: boolean
  initialPrefill?: {
    name?: string
    brand?: string
    barcode?: string
    sizeLabel?: string
    imageUrl?: string
    category?: CategoryId
  }
}

export function AddItemSheet({
  open,
  onClose,
  defaultAddToWeek = true,
  initialPrefill,
}: Props) {
  const masterItems = useShopStore((s) => s.masterItems)
  const addMasterItem = useShopStore((s) => s.addMasterItem)
  const addToWeek = useShopStore((s) => s.addToWeek)
  const scanBarcode = useShopStore((s) => s.scanBarcode)

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState<CategoryId>('other')
  /** Once user picks a category manually, stop overwriting while they type. */
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [brand, setBrand] = useState('')
  const [barcode, setBarcode] = useState('')
  const [sizeLabel, setSizeLabel] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [addToWeekFlag, setAddToWeekFlag] = useState(defaultAddToWeek)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!open) return
    const prefillName = initialPrefill?.name ?? ''
    const prefillCat =
      initialPrefill?.category ??
      (prefillName ? detectCategoryFromName(prefillName) : 'other')
    setName(prefillName)
    setBrand(initialPrefill?.brand ?? '')
    setBarcode(initialPrefill?.barcode ?? '')
    setSizeLabel(initialPrefill?.sizeLabel ?? '')
    setImageUrl(initialPrefill?.imageUrl ?? '')
    setCategory(prefillCat)
    // Lock if barcode / OFF already chose a non-other category
    setCategoryLocked(Boolean(initialPrefill?.category && initialPrefill.category !== 'other'))
    setQuantity('')
    setNotes('')
    setAddToWeekFlag(defaultAddToWeek)
    setHint('')
  }, [open, initialPrefill, defaultAddToWeek])

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (q.length < 1) return []
    return masterItems
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [name, masterItems])

  const detected = useMemo(() => detectCategoryFromName(name), [name])
  const autoActive = !categoryLocked && name.trim().length > 0 && detected !== 'other'

  const onNameChange = (value: string) => {
    setName(value)
    if (!categoryLocked) {
      setCategory(detectCategoryFromName(value))
    }
  }

  if (!open) return null

  const submit = () => {
    if (!name.trim()) {
      setHint('Enter a product name')
      return
    }
    // Final pass if user never locked and never typed enough earlier
    const finalCategory = categoryLocked
      ? category
      : detectCategoryFromName(name) !== 'other'
        ? detectCategoryFromName(name)
        : category
    addMasterItem({
      name,
      category: finalCategory,
      brand: brand || undefined,
      barcode: barcode || undefined,
      sizeLabel: sizeLabel || undefined,
      imageUrl: imageUrl || undefined,
      quantity: quantity || undefined,
      notes: notes || undefined,
      addToWeek: addToWeekFlag,
    })
    onClose()
  }

  const onScanned = async (code: string) => {
    setScannerOpen(false)
    setScanning(true)
    setHint('Looking up product…')
    const result = await scanBarcode(code)
    setScanning(false)
    if (result.masterItemId) {
      onClose()
      return
    }
    if (result.prefill) {
      setName(result.prefill.name)
      setBrand(result.prefill.brand ?? '')
      setBarcode(result.prefill.barcode)
      setSizeLabel(result.prefill.sizeLabel ?? '')
      setImageUrl(result.prefill.imageUrl ?? '')
      setCategory(result.prefill.category)
      setHint(
        result.prefill.name
          ? 'Product found — confirm & add'
          : result.error ??
              'Not in the online database (common for NZ packs). Type a name — we will remember it next scan.',
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl dark:bg-slate-900 sm:rounded-3xl sm:p-5"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Add item
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => setScannerOpen(true)}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            📷 Scan barcode
          </button>
          <label className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-teal-600"
              checked={addToWeekFlag}
              onChange={(e) => setAddToWeekFlag(e.target.checked)}
            />
            Add to week
          </label>
        </div>

        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="mb-3 h-20 w-20 rounded-xl object-cover"
          />
        ) : null}

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Milk, bananas…"
          className="mb-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {autoActive ? (
          <p className="mb-2 text-xs font-medium text-teal-700 dark:text-teal-300">
            Auto category: {categoryLabel(detected)}
          </p>
        ) : null}

        {suggestions.length > 0 && (
          <ul className="mb-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    addToWeek(s.id, { quantity, notes })
                    onClose()
                  }}
                >
                  <span>
                    <span className="font-medium">{s.name}</span>
                    {s.brand ? (
                      <span className="text-slate-500"> · {s.brand}</span>
                    ) : null}
                  </span>
                  <span className="text-teal-600 font-semibold">+ Week</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Qty
            </label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="2x"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as CategoryId)
                setCategoryLocked(true)
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-800"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            {categoryLocked ? (
              <button
                type="button"
                className="mt-1 text-left text-[11px] font-semibold text-teal-700 dark:text-teal-300"
                onClick={() => {
                  setCategoryLocked(false)
                  setCategory(detectCategoryFromName(name))
                }}
              >
                Use auto-detect again
              </button>
            ) : null}
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="organic, only if on special…"
          className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-800"
        />

        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">
            More details
          </summary>
          <div className="mt-2 grid gap-2">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
              placeholder="Size (e.g. 1L)"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Barcode"
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </details>

        {hint ? (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">{hint}</p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          className="min-h-14 w-full rounded-2xl bg-slate-900 text-base font-bold text-white active:scale-[0.99] dark:bg-teal-600"
        >
          Save item
        </button>
      </div>

      {scannerOpen ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white">
              Starting camera…
            </div>
          }
        >
          <BarcodeScanner
            onResult={onScanned}
            onClose={() => setScannerOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
