const USER_AGENT =
  'FamilyShop/1.0 (https://github.com/cortenliving/family-shop; cortenliving@gmail.com)'

const FIELDS =
  'code,product_name,product_name_en,generic_name,generic_name_en,brands,quantity,image_front_url,image_url,categories_tags,categories'

export type ProductLookupResult = {
  found: boolean
  barcode: string
  productName?: string
  brands?: string
  quantity?: string
  imageUrl?: string
  categoriesTags?: string[]
  source?: string
  /** Friendly message for the UI — never a raw HTTP code */
  message?: string
}

/** Generate common barcode variants scanners produce. */
export function barcodeVariants(raw: string): string[] {
  const cleaned = raw.replace(/\D/g, '')
  if (!cleaned) return []
  const set = new Set<string>([cleaned])

  // UPC-A (12) ↔ EAN-13 (leading zero)
  if (cleaned.length === 12) set.add(`0${cleaned}`)
  if (cleaned.length === 13 && cleaned.startsWith('0')) set.add(cleaned.slice(1))

  // Sometimes scanners drop/add a check digit edge case: try without leading zeros
  const stripped = cleaned.replace(/^0+/, '')
  if (stripped && stripped !== cleaned) {
    set.add(stripped)
    if (stripped.length === 12) set.add(`0${stripped}`)
    if (stripped.length <= 12) set.add(stripped.padStart(13, '0'))
  }

  // Prefer longer (EAN-13) first for lookup order
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
  categories?: string
}

function pickName(p: OffProduct): string | undefined {
  const candidates = [
    p.product_name,
    p.product_name_en,
    p.generic_name,
    p.generic_name_en,
    // Brand-only is better than nothing when name missing
    p.brands?.split(',')[0]?.trim(),
  ]
  for (const c of candidates) {
    const t = c?.trim()
    if (t && t.length > 1) return t
  }
  return undefined
}

function mapProduct(
  barcode: string,
  p: OffProduct,
  source: string,
): ProductLookupResult {
  const productName = pickName(p)
  if (!productName) {
    return {
      found: false,
      barcode,
      message: 'Product record incomplete — type a name',
    }
  }
  return {
    found: true,
    barcode: (p.code || barcode).replace(/\D/g, '') || barcode,
    productName,
    brands: p.brands?.trim() || undefined,
    quantity: p.quantity?.trim() || undefined,
    imageUrl: p.image_front_url || p.image_url || undefined,
    categoriesTags: p.categories_tags,
    source,
  }
}

async function fetchJson(
  url: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    })
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

async function tryOpenFacts(
  host: string,
  code: string,
  label: string,
): Promise<ProductLookupResult | null> {
  // v0 is more tolerant; v2 returns hard 404s
  const v0 = await fetchJson(
    `https://${host}/api/v0/product/${encodeURIComponent(code)}.json`,
  )
  if (v0.data && typeof v0.data === 'object') {
    const d = v0.data as { status?: number; product?: OffProduct }
    if (d.status === 1 && d.product) {
      const mapped = mapProduct(code, d.product, label)
      if (mapped.found) return mapped
    }
  }

  const v2 = await fetchJson(
    `https://${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
  )
  // Treat 404 as not found, not error
  if (v2.data && typeof v2.data === 'object') {
    const d = v2.data as { status?: number; product?: OffProduct }
    if ((d.status === 1 || v2.ok) && d.product) {
      const mapped = mapProduct(code, d.product, `${label}-v2`)
      if (mapped.found) return mapped
    }
  }

  return null
}

/**
 * Server-side multi-source product lookup.
 * Open Food Facts is incomplete for NZ/AU packs — we try food, beauty, and general products.
 */
export async function lookupProduct(rawBarcode: string): Promise<ProductLookupResult> {
  const variants = barcodeVariants(rawBarcode)
  if (!variants.length) {
    return {
      found: false,
      barcode: '',
      message: 'Invalid barcode',
    }
  }

  const hosts: { host: string; label: string }[] = [
    { host: 'world.openfoodfacts.org', label: 'openfoodfacts' },
    { host: 'au.openfoodfacts.org', label: 'off-au' },
    { host: 'world.openbeautyfacts.org', label: 'openbeautyfacts' },
    { host: 'world.openproductsfacts.org', label: 'openproductsfacts' },
  ]

  for (const code of variants) {
    for (const { host, label } of hosts) {
      const hit = await tryOpenFacts(host, code, label)
      if (hit?.found) return hit
    }
  }

  // Last resort: OFF search by code (sometimes finds incomplete entries)
  for (const code of variants) {
    const search = await fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(code)}&code=${encodeURIComponent(code)}&json=1&page_size=3&search_simple=1&action=process`,
    )
    if (search.data && typeof search.data === 'object') {
      const d = search.data as { products?: OffProduct[]; count?: number }
      const products = d.products ?? []
      for (const p of products) {
        const pCode = (p.code || '').replace(/\D/g, '')
        if (pCode && variants.includes(pCode)) {
          const mapped = mapProduct(code, p, 'off-search')
          if (mapped.found) return mapped
        }
        // If only one result and has a name, accept it
        if (products.length === 1) {
          const mapped = mapProduct(code, p, 'off-search')
          if (mapped.found) return mapped
        }
      }
    }
  }

  return {
    found: false,
    barcode: variants[0]!,
    message:
      'Not in the product database (common for NZ brands). Type a name once — next scan will remember it.',
  }
}
