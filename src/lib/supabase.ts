import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createMockClient } from './mock'

// Public, browser-safe values. Data is protected by row-level security on every table.
export const SUPABASE_URL = 'https://ivicgwjratcfcbmyrnld.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_Ikf9bS82eaFOe4QA-H0zEQ_34cBGjZS'

const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

export const supabase: SupabaseClient<any, 'public', any> = DEMO
  ? createMockClient()
  : createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'masar-auth' },
    realtime: { params: { eventsPerSecond: 5 } },
  })
