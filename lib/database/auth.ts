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

// Safari detection function
const isSafari = () => {
  if (typeof window === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
         /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.vendor && navigator.vendor.indexOf('Apple') > -1)
}

// Store clients to avoid recreation
let serverClient: ReturnType<typeof createClient<Database>> | null = null
let safariClient: ReturnType<typeof createClient<Database>> | null = null
let standardClient: ReturnType<typeof createClient<Database>> | null = null

// Server-side client (safe defaults)
const createServerClient = () => {
  if (serverClient) return serverClient
  
  console.log('🖥️ Creating server-side Supabase client')
  serverClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'sb-auth-token',
      persistSession: false, // No persistence on server
      flowType: 'pkce' as const,
      autoRefreshToken: false, // No auto-refresh on server
      detectSessionInUrl: false, // No URL detection on server
      debug: false
    }
  })
  return serverClient
}

// Safari client with strict compatibility settings
const createSafariClient = () => {
  if (safariClient) return safariClient
  
  console.log('🍎 Creating Safari-compatible Supabase client')
  safariClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'sb-auth-token',
      persistSession: true,
      flowType: 'pkce' as const,
      autoRefreshToken: false, // Critical: disable auto-refresh for Safari
      detectSessionInUrl: false, // Handle manually for better Safari control
      debug: process.env.NODE_ENV === 'development',
      storage: {
        getItem: (key: string) => {
          try {
            const value = window.localStorage.getItem(key)
            console.log(`🍎 Safari storage getItem(${key}):`, value ? 'found' : 'null')
            return value
          } catch (error) {
            console.warn('🍎 Safari localStorage access failed:', error)
            return null
          }
        },
        setItem: (key: string, value: string) => {
          try {
            window.localStorage.setItem(key, value)
            console.log(`🍎 Safari storage setItem(${key}): success`)
          } catch (error) {
            console.warn('🍎 Safari localStorage write failed:', error)
          }
        },
        removeItem: (key: string) => {
          try {
            window.localStorage.removeItem(key)
            console.log(`🍎 Safari storage removeItem(${key}): success`)
          } catch (error) {
            console.warn('🍎 Safari localStorage remove failed:', error)
          }
        }
      }
    }
  })
  return safariClient
}

// Standard browser client
const createStandardClient = () => {
  if (standardClient) return standardClient
  
  console.log('🌐 Creating standard browser Supabase client')
  standardClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'sb-auth-token',
      persistSession: true,
      flowType: 'pkce' as const,
      autoRefreshToken: true, // Enable for standard browsers
      detectSessionInUrl: true, // Enable for standard browsers
      debug: process.env.NODE_ENV === 'development',
      storage: window.localStorage
    }
  })
  return standardClient
}

// Dynamic client getter that always returns the right client
const getSupabaseClient = () => {
  // Server-side: use safe defaults
  if (typeof window === 'undefined') {
    return createServerClient()
  }
  
  // Client-side: detect Safari and return appropriate client
  if (isSafari()) {
    console.log('🍎 Safari detected - using Safari-compatible client')
    return createSafariClient()
  } else {
    console.log('🌐 Standard browser detected - using standard client')
    return createStandardClient()
  }
}

// Export the dynamic client
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    const client = getSupabaseClient()
    return (client as any)[prop]
  }
})

// Helper function to handle PKCE code exchange specifically for Safari
export const handleSafariPKCE = async () => {
  if (typeof window === 'undefined') return null
  
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  
  if (!code) return null
  
  console.log('🔗 PKCE code detected in URL:', code.substring(0, 10) + '...')
  
  try {
    // Get the Safari client directly for PKCE exchange
    const client = createSafariClient()
    console.log('🔄 Exchanging PKCE code for session...')
    
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('❌ PKCE code exchange failed:', error)
      return { error }
    }
    
    if (data.session) {
      console.log('✅ PKCE code exchange successful')
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return { session: data.session, user: data.user }
    }
    
    return null
  } catch (error) {
    console.error('❌ PKCE code exchange exception:', error)
    return { error }
  }
}

// Auth helper functions
export const auth = {
  // Sign up new user
  async signUp(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split('@')[0]
        }
      }
    })
    return { data, error }
  },

  // Sign in existing user
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Sign in with Google (PKCE flow for enhanced security)
  async signInWithGoogle() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return { data: null, error: new Error('OAuth can only be initiated in browser') }
    }

    // For Safari, use the Safari client directly
    const client = isSafari() ? createSafariClient() : getSupabaseClient()
    console.log('🔗 Using client for OAuth:', isSafari() ? 'Safari' : 'Standard')

    // Ensure we have the correct redirect URL for both dev and production
    let redirectUrl: string
    
    if (process.env.NODE_ENV === 'development') {
      // In development, always use localhost
      redirectUrl = `${window.location.origin}/auth/callback`
    } else if (process.env.NEXT_PUBLIC_SITE_URL) {
      // In production, use the configured site URL
      redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    } else {
      // Fallback to current origin
      redirectUrl = `${window.location.origin}/auth/callback`
    }

    console.log('🔗 OAuth redirect URL:', redirectUrl)

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          hd: undefined, // Remove domain restriction for wider access
        },
        skipBrowserRedirect: false,
      }
    })
    
    if (error) {
      console.error('Google OAuth initiation error:', error)
      // Return more specific error information
      return { 
        data: null, 
        error: new Error(`Authentication failed: ${error.message}`)
      }
    }
    
    return { data, error }
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Get current session
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // Listen to auth changes
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },

  // User profile functions removed (no user_profiles table)
} 