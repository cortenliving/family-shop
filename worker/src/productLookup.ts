const USER_AGENT =
  'FamilyShop/1.0 (https://github.com/cortenliving/family-shop; cortenliving@gmail.com)'

export type ProductLookupResult = {
  found: boolean
  barcode: string
  productName?: string
  brands?: string
  quantity?: string
  imageUrl?: string
  categoriesTags?: string[]
  source?: string
  message?: string
}

/** Generate common barcode variants scanners produce. */
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

function mapProduct(
  barcode: string,
  p: OffProduct,
  source: string,
): ProductLookupResult | null {
  const productName = pickName(p)
  if (!productName) return null
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

async function fetchOffV0(
  host: string,
  code: string,
  label: string,
): Promise<ProductLookupResult | null> {
  try {
    const res = await fetch(
      `https://${host}/api/v0/product/${encodeURIComponent(code)}.json`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
    )
    const data = (await res.json()) as {
      status?: number
      product?: OffProduct
    }
    if (data.status === 1 && data.product) {
      return mapProduct(code, data.product, label)
    }
  } catch {
    /* ignore */
  }
  return null
}

/** First successful promise, ignore rejections/nulls. */
async function firstHit(
  tasks: Promise<ProductLookupResult | null>[],
): Promise<ProductLookupResult | null> {
  return new Promise((resolve) => {
    let remaining = tasks.length
    if (!remaining) {
      resolve(null)
      return
    }
    for (const t of tasks) {
      void t.then((hit) => {
        if (hit?.found) {
          resolve(hit)
          remaining = -1
          return
        }
        remaining -= 1
        if (remaining === 0) resolve(null)
      })
    }
  })
}

/**
 * Server-side multi-source product lookup.
 * Tries food first (parallel), then beauty/household if needed.
 * Open Food Facts is incomplete for many NZ/AU packs — that's normal.
 */
export async function lookupProduct(rawBarcode: string): Promise<ProductLookupResult> {
  const variants = barcodeVariants(rawBarcode)
  if (!variants.length) {
    return { found: false, barcode: '', message: 'Invalid barcode' }
  }

  // Phase 1: food databases, all variants in parallel (fast path)
  const foodHosts = [
    { host: 'world.openfoodfacts.org', label: 'openfoodfacts' },
    { host: 'au.openfoodfacts.org', label: 'off-au' },
  ]
  const foodTasks: Promise<ProductLookupResult | null>[] = []
  for (const code of variants) {
    for (const { host, label } of foodHosts) {
      foodTasks.push(fetchOffV0(host, code, label))
    }
  }
  const foodHit = await firstHit(foodTasks)
  if (foodHit) return foodHit

  // Phase 2: beauty + general products (soap, detergent, etc.)
  const otherHosts = [
    { host: 'world.openbeautyfacts.org', label: 'openbeautyfacts' },
    { host: 'world.openproductsfacts.org', label: 'openproductsfacts' },
  ]
  const otherTasks: Promise<ProductLookupResult | null>[] = []
  for (const code of variants.slice(0, 2)) {
    for (const { host, label } of otherHosts) {
      otherTasks.push(fetchOffV0(host, code, label))
    }
  }
  const otherHit = await firstHit(otherTasks)
  if (otherHit) return otherHit

  return {
    found: false,
    barcode: variants[0]!,
    message:
      'Not in the product database (common for NZ brands). Type a name once — next scan will remember it.',
  }
}
