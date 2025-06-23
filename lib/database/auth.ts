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

// Store the active client
let activeClient: ReturnType<typeof createClient<Database>> | null = null

// Create and return the appropriate client based on environment
const createSupabaseClient = () => {
  // Return existing client if already created
  if (activeClient) {
    console.log('♻️ Returning existing Supabase client')
    return activeClient
  }
  
  console.log('🚀 Creating new Supabase client...', {
    isServer: typeof window === 'undefined',
    isSafariBrowser: typeof window !== 'undefined' ? isSafari() : false,
    url: typeof window !== 'undefined' ? window.location.href : 'server'
  })
  
  // Server-side: use safe defaults
  if (typeof window === 'undefined') {
    console.log('🖥️ Creating server-side Supabase client')
    activeClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'sb-auth-token',
        persistSession: false, // No persistence on server
        flowType: 'pkce' as const,
        autoRefreshToken: false, // No auto-refresh on server
        detectSessionInUrl: false, // No URL detection on server
        debug: false
      }
    })
    console.log('✅ Server client created')
    return activeClient
  }
  
  // Client-side: detect Safari and create appropriate client
  if (isSafari()) {
    console.log('🍎 Creating Safari-compatible Supabase client')
    try {
      activeClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
      console.log('✅ Safari client created successfully')
    } catch (error) {
      console.error('❌ Safari client creation failed:', error)
      throw error
    }
  } else {
    console.log('🌐 Creating standard browser Supabase client')
    try {
      activeClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
      console.log('✅ Standard client created successfully')
    } catch (error) {
      console.error('❌ Standard client creation failed:', error)
      throw error
    }
  }
  
  console.log('✅ Supabase client created successfully')
  return activeClient
}

// Export the client
export const supabase = createSupabaseClient()

// Helper function to handle PKCE code exchange for all browsers
export const handleSafariPKCE = async () => {
  if (typeof window === 'undefined') return null
  
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  
  if (!code) return null
  
  console.log('🔗 PKCE code detected in URL:', code.substring(0, 10) + '...')
  
  try {
    // Use the appropriate client for the current browser
    const client = supabase
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

    console.log('🔗 Initiating Google OAuth:', {
      browser: isSafari() ? 'Safari' : 'Standard',
      environment: process.env.NODE_ENV,
      origin: window.location.origin,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL
    })

    // Ensure we have the correct redirect URL for both dev and production
    let redirectUrl: string
    
    if (process.env.NODE_ENV === 'development') {
      // In development, always use localhost
      redirectUrl = `${window.location.origin}/auth/callback`
    } else {
      // In production, prioritize NEXT_PUBLIC_SITE_URL but with better fallback
      if (process.env.NEXT_PUBLIC_SITE_URL) {
        redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      } else {
        // Fallback to current origin, but log a warning
        redirectUrl = `${window.location.origin}/auth/callback`
        console.warn('⚠️ NEXT_PUBLIC_SITE_URL not set, using current origin:', redirectUrl)
      }
    }

    console.log('🔗 OAuth redirect URL:', redirectUrl)
    console.log('🚨 IMPORTANT: Make sure this URL is added to your Supabase dashboard!')
    console.log('🚨 Go to: Supabase Dashboard → Authentication → URL Configuration → Authorized redirect URLs')
    console.log('🚨 Add this exact URL:', redirectUrl)

    // Additional production debugging
    if (process.env.NODE_ENV === 'production') {
      console.log('🏭 Production OAuth debug:', {
        currentUrl: window.location.href,
        redirectUrl,
        userAgent: navigator.userAgent,
        isSafari: isSafari(),
        protocol: window.location.protocol,
        host: window.location.host
      })
      
      // Alert Safari users about the redirect URL issue
      if (isSafari()) {
        console.log('🍎 Safari Production Check:')
        console.log('🍎 Expected redirect URL in Supabase:', redirectUrl)
        console.log('🍎 If authentication fails, check Supabase redirect URLs!')
      }
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
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
      console.error('Google OAuth initiation error:', {
        error: error.message,
        redirectUrl,
        environment: process.env.NODE_ENV,
        isSafari: isSafari()
      })
      
      // Special Safari error handling
      if (isSafari() && error.message.includes('redirect')) {
        console.error('🍎 Safari Redirect Error - Check Supabase Configuration!')
        console.error('🍎 Required redirect URL:', redirectUrl)
      }
      
      // Return more specific error information
      return { 
        data: null, 
        error: new Error(`Authentication failed: ${error.message}`)
      }
    }
    
    console.log('✅ Google OAuth initiated successfully')
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