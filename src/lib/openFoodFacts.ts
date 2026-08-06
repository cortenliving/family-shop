import type { BarcodeCacheEntry, CategoryId } from '../types'

const USER_AGENT = 'FamilyShop/1.0 (https://github.com/family-shop; family@example.com)'
const FIELDS = 'product_name,brands,quantity,image_front_url,categories_tags'

export interface OffLookupResult {
  found: boolean
  entry?: BarcodeCacheEntry
  error?: string
}

/** Map Open Food Facts category tags → our CategoryId. */
export function mapOffCategories(tags: string[] | undefined): CategoryId {
  if (!tags?.length) return 'other'
  const joined = tags.join(' ').toLowerCase()
  if (/vegetable|fruit|produce|salad/.test(joined)) return 'fruit-veg'
  if (/dairy|milk|cheese|yogurt|butter|cream/.test(joined)) return 'dairy'
  if (/meat|poultry|fish|seafood|beef|chicken|pork/.test(joined)) return 'meat'
  if (/bread|bakery|pastry|biscuit/.test(joined)) return 'bakery'
  if (/frozen|ice-cream/.test(joined)) return 'freezer'
  if (/beverage|drink|juice|soda|water|beer|wine/.test(joined)) return 'drinks'
  if (/cleaning|household|hygiene|soap|detergent/.test(joined)) return 'household'
  if (/snack|sauce|pasta|rice|cereal|canned|spread|condiment/.test(joined))
    return 'pantry'
  return 'other'
}

export async function lookupBarcode(
  barcode: string,
  cache: Record<string, BarcodeCacheEntry>,
): Promise<OffLookupResult> {
  const cleaned = barcode.replace(/\D/g, '')
  if (!cleaned) return { found: false, error: 'Invalid barcode' }

  const cached = cache[cleaned]
  if (cached) {
    return { found: true, entry: cached }
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleaned)}.json?fields=${FIELDS}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      return { found: false, error: `Lookup failed (${res.status})` }
    }

    const data = (await res.json()) as {
      status?: number
      product?: {
        product_name?: string
        brands?: string
        quantity?: string
        image_front_url?: string
        categories_tags?: string[]
      }
    }

    if (data.status !== 1 || !data.product?.product_name) {
      return { found: false }
    }

    const entry: BarcodeCacheEntry = {
      barcode: cleaned,
      productName: data.product.product_name.trim(),
      brands: data.product.brands?.trim() || undefined,
      quantity: data.product.quantity?.trim() || undefined,
      imageUrl: data.product.image_front_url || undefined,
      categoriesTags: data.product.categories_tags,
      cachedAt: Date.now(),
    }

    return { found: true, entry }
  } catch {
    return {
      found: false,
      error: 'Network error — you can still name the item manually',
    }
  }
}
