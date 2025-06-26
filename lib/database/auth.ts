import { createClient } from '@supabase/supabase-js'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Validate required environment variables
if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}
if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

// Simple, reliable Supabase client creation
let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

const createSupabaseClient = (): ReturnType<typeof createClient<Database>> => {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }
  
  console.log('🚀 Creating Supabase client...', {
    isServer: typeof window === 'undefined',
    url: typeof window !== 'undefined' ? window.location.href : 'server'
  })
  
  // Server-side: use safe defaults
  if (typeof window === 'undefined') {
    console.log('🖥️ Creating server-side Supabase client')
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-auth-token',
        persistSession: false, // No persistence on server
        flowType: 'pkce' as const,
        autoRefreshToken: false, // No auto-refresh on server
        detectSessionInUrl: false, // No URL detection on server
        debug: false
      }
    })
  } else {
    // Client-side: use consistent settings for all browsers
    console.log('🌐 Creating client-side Supabase client')
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-auth-token',
        persistSession: true,
        flowType: 'pkce' as const,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        debug: process.env.NODE_ENV === 'development'
      }
    })
  }
  
  console.log('✅ Supabase client created successfully')
  return supabaseClient
}

// Get the Supabase client
export const supabase = createSupabaseClient()

// Simple session cache to avoid redundant API calls
let sessionCache: { session: any; timestamp: number } | null = null
const CACHE_DURATION = 30000 // 30 seconds

// Auth helper functions
export const auth = {
  async signUp(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: fullName
        }
      }
    })
    return { data, error }
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    // Clear cache on new sign in
    sessionCache = null
    return { data, error }
  },

  async signInWithGoogle() {
    if (typeof window === 'undefined') {
      return { data: null, error: new Error('OAuth can only be initiated in browser') }
    }

    console.log('🔗 Initiating Google OAuth...')
    
    let redirectUrl: string
    
    // Set redirect URL based on environment
    if (process.env.NODE_ENV === 'development') {
      redirectUrl = `${window.location.origin}/auth/callback`
    } else if (process.env.NEXT_PUBLIC_SITE_URL) {
      redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    } else {
      redirectUrl = `${window.location.origin}/auth/callback`
    }

    console.log('🔗 OAuth redirect URL:', redirectUrl)

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          scopes: 'openid email profile'
        }
      })

      if (error) {
        console.error('Google OAuth initiation error:', error)
        return {
          data: null,
          error: new Error(`Authentication failed: ${error.message}`)
        }
      }

      console.log('✅ Google OAuth initiated successfully')
      return { data, error: null }
    } catch (error) {
      console.error('Google OAuth exception:', error)
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown OAuth error')
      }
    }
  },

  async signOut() {
    // Clear session cache on sign out
    sessionCache = null
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  async getSession() {
    // Check cache first for faster response
    if (typeof window !== 'undefined' && sessionCache) {
      const now = Date.now()
      if (now - sessionCache.timestamp < CACHE_DURATION) {
        console.log('⚡ Using cached session for faster response')
        return { session: sessionCache.session, error: null }
      }
    }
    
    const { data: { session }, error } = await supabase.auth.getSession()
    
    // Cache the result for future calls
    if (typeof window !== 'undefined' && !error) {
      sessionCache = {
        session,
        timestamp: Date.now()
      }
    }
    
    return { session, error }
  },

  // Listen to auth changes
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      // Clear cache on auth state changes
      sessionCache = null
      callback(event, session)
    })
  }
} 