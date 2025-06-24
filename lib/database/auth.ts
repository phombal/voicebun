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
      // Enhanced Safari storage with PKCE code verifier handling
      const safariStorage = {
        getItem: (key: string) => {
          try {
            // First try localStorage
            const value = window.localStorage.getItem(key)
            console.log(`🍎 Safari storage getItem(${key}):`, value ? 'found' : 'null')
            
            // Special handling for PKCE code verifier
            if (!value && key.includes('code-verifier')) {
              console.log('🔑 PKCE code verifier not found in localStorage, checking sessionStorage')
              const sessionValue = window.sessionStorage.getItem(key)
              if (sessionValue) {
                console.log('✅ Found PKCE code verifier in sessionStorage')
                return sessionValue
              }
            }
            
            return value
          } catch (error) {
            console.warn('🍎 Safari localStorage access failed, trying sessionStorage:', error)
            try {
              const sessionValue = window.sessionStorage.getItem(key)
              console.log(`🍎 Safari sessionStorage getItem(${key}):`, sessionValue ? 'found' : 'null')
              return sessionValue
            } catch (sessionError) {
              console.warn('🍎 Safari sessionStorage also failed:', sessionError)
              return null
            }
          }
        },
        setItem: (key: string, value: string) => {
          try {
            window.localStorage.setItem(key, value)
            console.log(`🍎 Safari storage setItem(${key}): success`)
            
            // For PKCE code verifier, also store in sessionStorage as backup
            if (key.includes('code-verifier')) {
              console.log('🔑 Storing PKCE code verifier backup in sessionStorage')
              try {
                window.sessionStorage.setItem(key, value)
                console.log('✅ PKCE code verifier backup stored')
              } catch (sessionError) {
                console.warn('⚠️ Failed to store PKCE backup:', sessionError)
              }
            }
          } catch (error) {
            console.warn('🍎 Safari localStorage write failed, trying sessionStorage:', error)
            try {
              window.sessionStorage.setItem(key, value)
              console.log(`🍎 Safari sessionStorage setItem(${key}): success`)
            } catch (sessionError) {
              console.warn('🍎 Safari sessionStorage write also failed:', sessionError)
            }
          }
        },
        removeItem: (key: string) => {
          try {
            window.localStorage.removeItem(key)
            console.log(`🍎 Safari storage removeItem(${key}): success`)
            
            // Also remove from sessionStorage if it's a PKCE key
            if (key.includes('code-verifier')) {
              try {
                window.sessionStorage.removeItem(key)
                console.log('🔑 Removed PKCE code verifier backup from sessionStorage')
              } catch (sessionError) {
                console.warn('⚠️ Failed to remove PKCE backup:', sessionError)
              }
            }
          } catch (error) {
            console.warn('🍎 Safari localStorage remove failed, trying sessionStorage:', error)
            try {
              window.sessionStorage.removeItem(key)
              console.log(`🍎 Safari sessionStorage removeItem(${key}): success`)
            } catch (sessionError) {
              console.warn('🍎 Safari sessionStorage remove also failed:', sessionError)
            }
          }
        }
      }

      activeClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          storageKey: 'sb-auth-token',
          persistSession: true,
          flowType: 'pkce' as const,
          autoRefreshToken: true, // Enable auto-refresh for Safari - this is needed for OAuth
          detectSessionInUrl: true, // Enable URL detection for Safari - this is critical for OAuth callbacks
          debug: process.env.NODE_ENV === 'development',
          storage: safariStorage
        }
      })
      console.log('✅ Safari client created successfully with enhanced PKCE storage')
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
  console.log('🔍 PKCE Debug Info:', {
    isSafari: isSafari(),
    environment: process.env.NODE_ENV,
    currentUrl: window.location.href,
    hasLocalStorage: (() => {
      try {
        window.localStorage.setItem('test', 'test')
        window.localStorage.removeItem('test')
        return true
      } catch (e) {
        return false
      }
    })(),
    hasSessionStorage: (() => {
      try {
        window.sessionStorage.setItem('test', 'test')
        window.sessionStorage.removeItem('test')
        return true
      } catch (e) {
        return false
      }
    })()
  })
  
  try {
    // Use the appropriate client for the current browser
    const client = supabase
    console.log('🔄 Exchanging PKCE code for session...')
    
    // Check if we have the code verifier before attempting exchange
    const storageKey = 'sb-auth-token'
    const codeVerifierKey = `${storageKey}-code-verifier`
    
    // Try to find the code verifier
    let codeVerifier = null
    try {
      codeVerifier = window.localStorage.getItem(codeVerifierKey)
      if (!codeVerifier && isSafari()) {
        console.log('🔑 Code verifier not in localStorage, checking sessionStorage...')
        codeVerifier = window.sessionStorage.getItem(codeVerifierKey)
      }
    } catch (storageError) {
      console.warn('⚠️ Storage access failed while checking code verifier:', storageError)
    }
    
    console.log('🔑 Code verifier status:', {
      found: !!codeVerifier,
      inLocalStorage: !!window.localStorage.getItem(codeVerifierKey),
      inSessionStorage: isSafari() ? !!window.sessionStorage.getItem(codeVerifierKey) : 'not checked'
    })
    
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('❌ PKCE code exchange failed:', error)
      console.error('🔍 Exchange error details:', {
        message: error.message,
        status: error.status,
        code: error.code,
        isSafari: isSafari(),
        hasCodeVerifier: !!codeVerifier
      })
      
      // Special handling for Safari PKCE errors
      if (isSafari() && error.message?.includes('code_verifier')) {
        console.error('🍎 Safari PKCE Error: Code verifier missing or invalid')
        console.error('🍎 This usually means Safari lost the code verifier during the OAuth redirect')
        console.error('🍎 Possible solutions: Check Safari settings, try incognito mode, or use another browser')
      }
      
      return { error }
    }
    
    if (data.session) {
      console.log('✅ PKCE code exchange successful')
      console.log('🎉 Session established:', {
        userId: data.user?.id,
        email: data.user?.email,
        expiresAt: data.session.expires_at
      })
      
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return { session: data.session, user: data.user }
    }
    
    return null
  } catch (error) {
    console.error('❌ PKCE code exchange exception:', error)
    console.error('🔍 Exception details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      isSafari: isSafari()
    })
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