import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export const PRODUCT_IMAGES_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_BUCKET || 'product-images'

/** Dashboard "REST URL" includes /rest/v1 — storage needs the project origin only. */
function normalizeSupabaseUrl(raw: string) {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/storage\/v1$/i, '')
}

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
    )
  }

  if (!client) {
    client = createClient(normalizeSupabaseUrl(url), anonKey)
  }

  return client
}
