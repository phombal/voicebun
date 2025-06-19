import { createClient } from '@supabase/supabase-js'
import { Database } from './types'

// Server-side Supabase client using service role key
// This should ONLY be used in API routes and server-side functions
// NEVER import this in client-side components

// Prevent client-side usage
if (typeof window !== 'undefined') {
  throw new Error(
    'SECURITY ERROR: Server-side Supabase client cannot be used in browser. ' +
    'Use lib/database/auth.ts for client-side operations.'
  )
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Validate required environment variables
if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}
if (!supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Make sure it is set in your .env file.')
}

// Service role client for server-side operations that bypass RLS
export const supabaseServiceRole = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Helper function to verify this is running on server-side
export function ensureServerSide() {
  if (typeof window !== 'undefined') {
    throw new Error('This function can only be used on the server-side (API routes, etc.)')
  }
} 