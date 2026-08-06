import type { BarcodeCacheEntry, CategoryId } from '../types'
import { apiUrl, hasRemoteApi } from './sync'

const USER_AGENT =
  'FamilyShop/1.0 (https://github.com/cortenliving/family-shop; cortenliving@gmail.com)'
const FIELDS =
  'code,product_name,product_name_en,generic_name,generic_name_en,brands,quantity,image_front_url,image_url,categories_tags'

export interface OffLookupResult {
  found: boolean
  entry?: BarcodeCacheEntry
  /** Friendly message — never show raw HTTP status codes to users */
  message?: string
}

/** Map Open Food Facts category tags → our CategoryId. */
export function mapOffCategories(tags: string[] | undefined): CategoryId {
  if (!tags?.length) return 'other'
  const joined = tags.join(' ').toLowerCase()
  if (/vegetable|fruit|produce|salad/.test(joined)) return 'fruit-veg'
  if (/dairy|milk|cheese|yogurt|yoghurt|butter|cream/.test(joined)) return 'dairy'
  if (/meat|poultry|fish|seafood|beef|chicken|pork/.test(joined)) return 'meat'
  if (/bread|bakery|pastry|biscuit/.test(joined)) return 'bakery'
  if (/frozen|ice-cream|ice cream/.test(joined)) return 'freezer'
  if (/beverage|drink|juice|soda|water|beer|wine/.test(joined)) return 'drinks'
  if (/cleaning|household|hygiene|soap|detergent|beauty|care/.test(joined))
    return 'household'
  if (/snack|sauce|pasta|rice|cereal|canned|spread|condiment/.test(joined))
    return 'pantry'
  return 'other'
}

export function barcodeVariants(raw: string): string[] {
  const cleaned = raw.replace(/\D/g, '')
  if (!cleaned) return []
  const set = new Set<string>([cleaned])
  if (cleaned.length === 12) set.add(`0${cleaned}`)
  if (cleaned.length === 13 && cleaned.startsWith('0')) set.add(cleaned.slice(1))
  const stripped = cleaned.replace(/^0+/, '')
  if (stripped && stripped !== cleaned) {
    set.add(stripped)
    if (stripped.length === 12) set.add(`0${stripped}`)
    if (stripped.length <= 12) set.add(stripped.padStart(13, '0'))
  }
  return [...set].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

type OffProduct = {
  code?: string
  product_name?: string
  product_name_en?: string
  generic_name?: string
  generic_name_en?: string
  brands?: string
  quantity?: string
  image_front_url?: string
  image_url?: string
  categories_tags?: string[]
}

function pickName(p: OffProduct): string | undefined {
  for (const c of [
    p.product_name,
    p.product_name_en,
    p.generic_name,
    p.generic_name_en,
    p.brands?.split(',')[0]?.trim(),
  ]) {
    const t = c?.trim()
    if (t && t.length > 1) return t
  }
  return undefined
}

function toEntry(
  barcode: string,
  p: OffProduct,
): BarcodeCacheEntry | null {
  const productName = pickName(p)
  if (!productName) return null
  return {
    barcode: (p.code || barcode).replace(/\D/g, '') || barcode,
    productName,
    brands: p.brands?.trim() || undefined,
    quantity: p.quantity?.trim() || undefined,
    imageUrl: p.image_front_url || p.image_url || undefined,
    categoriesTags: p.categories_tags,
    cachedAt: Date.now(),
  }
}

async function lookupViaWorker(barcode: string): Promise<OffLookupResult | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(
      apiUrl(`/api/product/${encodeURIComponent(barcode)}`),
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      found?: boolean
      barcode?: string
      productName?: string
      brands?: string
      quantity?: string
      imageUrl?: string
      categoriesTags?: string[]
      message?: string
    }
    if (data.found && data.productName) {
      return {
        found: true,
        entry: {
          barcode: (data.barcode || barcode).replace(/\D/g, ''),
          productName: data.productName,
          brands: data.brands,
          quantity: data.quantity,
          imageUrl: data.imageUrl,
          categoriesTags: data.categoriesTags,
          cachedAt: Date.now(),
        },
      }
    }
    return {
      found: false,
      message:
        data.message ||
        'Not in the product database. Type a name once — next scan will remember it.',
    }
  } catch {
    return null
  }
}

async function tryDirectOff(
  host: string,
  code: string,
): Promise<BarcodeCacheEntry | null> {
  // Prefer v0 — returns 200 with status:0 instead of hard 404
  try {
    const res = await fetch(
      `https://${host}/api/v0/product/${encodeURIComponent(code)}.json`,
      {
        headers: {
          Accept: 'application/json',
          // Browsers often ignore User-Agent; harmless to set when allowed
          'User-Agent': USER_AGENT,
        },
      },
    )
    // Parse body even on 404 (v2)
    const data = (await res.json().catch(() => null)) as {
      status?: number
      product?: OffProduct
    } | null
    if (data?.status === 1 && data.product) {
      return toEntry(code, data.product)
    }
  } catch {
    /* try next */
  }

  try {
    const res = await fetch(
      `https://${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
      { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } },
    )
    if (res.status === 404) return null
    const data = (await res.json().catch(() => null)) as {
      status?: number
      product?: OffProduct
    } | null
    if (data?.product && (data.status === 1 || res.ok)) {
      return toEntry(code, data.product)
    }
  } catch {
    /* try next */
  }
  return null
}

async function lookupDirect(barcode: string): Promise<OffLookupResult> {
  const variants = barcodeVariants(barcode)
  if (!variants.length) {
    return { found: false, message: 'Invalid barcode' }
  }

  const hosts = [
    'world.openfoodfacts.org',
    'au.openfoodfacts.org',
    'world.openbeautyfacts.org',
    'world.openproductsfacts.org',
  ]

  for (const code of variants) {
    for (const host of hosts) {
      const entry = await tryDirectOff(host, code)
      if (entry) return { found: true, entry }
    }
  }

  return {
    found: false,
    message:
      'Not in the product database (common for NZ brands). Type a name once — next scan will remember it.',
  }
}

/**
 * Look up a grocery barcode.
 * Prefers our Cloudflare proxy (better success + no scary error codes),
 * falls back to direct Open Food Facts family of APIs.
 */
export async function lookupBarcode(
  barcode: string,
  cache: Record<string, BarcodeCacheEntry>,
): Promise<OffLookupResult> {
  const cleaned = barcode.replace(/\D/g, '')
  if (!cleaned) return { found: false, message: 'Invalid barcode' }

  // Cache hit (any variant)
  for (const v of barcodeVariants(cleaned)) {
    const cached = cache[v]
    if (cached) return { found: true, entry: cached }
  }

  // Worker proxy first
  const viaWorker = await lookupViaWorker(cleaned)
  if (viaWorker) return viaWorker

  // Direct multi-source fallback
  return lookupDirect(cleaned)
}
