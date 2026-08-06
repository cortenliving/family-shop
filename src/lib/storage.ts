import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AppSnapshot } from '../types'

interface FamilyShopDB extends DBSchema {
  meta: {
    key: string
    value: unknown
  }
}

const DB_NAME = 'family-shop'
const DB_VERSION = 1
const SNAPSHOT_KEY = 'snapshot'

let dbPromise: Promise<IDBPDatabase<FamilyShopDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<FamilyShopDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

export async function loadSnapshot(): Promise<AppSnapshot | null> {
  try {
    const db = await getDb()
    const value = await db.get('meta', SNAPSHOT_KEY)
    if (!value || typeof value !== 'object') return null
    return value as AppSnapshot
  } catch {
    return null
  }
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  const db = await getDb()
  await db.put('meta', snapshot, SNAPSHOT_KEY)
}

export async function clearSnapshot(): Promise<void> {
  const db = await getDb()
  await db.delete('meta', SNAPSHOT_KEY)
}
