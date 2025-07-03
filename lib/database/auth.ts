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
    return { data, error }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // Listen to auth changes
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },

  // Google OAuth authentication
  async signInWithGoogle() {
    try {
      console.log('🔄 Initiating Google OAuth sign-in...')
      console.log('🌐 Browser details:', {
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
        isSafari: typeof window !== 'undefined' ? /^((?!chrome|android).)*safari/i.test(navigator.userAgent) : false,
        cookiesEnabled: typeof window !== 'undefined' ? navigator.cookieEnabled : 'unknown',
        origin: typeof window !== 'undefined' ? window.location.origin : 'server'
      })
      
      // Ensure we're on the client side
      if (typeof window === 'undefined') {
        console.error('❌ Google OAuth can only be initiated on client side')
        return { data: null, error: new Error('Client-side only') }
      }
      
      const redirectUrl = `${window.location.origin}/auth/callback`
      console.log('🔗 Redirect URL will be:', redirectUrl)
      
      // Check current session before OAuth
      console.log('🔍 Checking current session before OAuth...')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      console.log('📋 Pre-OAuth session check:', {
        hasSession: !!sessionData.session,
        sessionError: sessionError?.message,
        userId: sessionData.session?.user?.id,
        expiresAt: sessionData.session?.expires_at
      })
      
      // Safari-specific preparations
      if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
        console.log('🍎 Safari detected - adding Safari-specific handling')
        
        // Check localStorage availability
        try {
          localStorage.setItem('safari-test', 'test')
          localStorage.removeItem('safari-test')
          console.log('✅ Safari localStorage is available')
        } catch (e) {
          console.warn('⚠️ Safari localStorage issue:', e)
        }
        
        // Check if cookies are enabled
        document.cookie = 'safari-cookie-test=test; path=/; SameSite=Lax'
        const cookieTest = document.cookie.includes('safari-cookie-test=test')
        console.log('🍪 Safari cookie test:', cookieTest ? 'PASS' : 'FAIL')
        if (cookieTest) {
          document.cookie = 'safari-cookie-test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
        }
      }
      
      console.log('🚀 Starting OAuth flow...')
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      
      console.log('📤 OAuth initiation result:', {
        hasData: !!data,
        hasError: !!error,
        errorMessage: error?.message,
        dataUrl: data?.url?.substring(0, 100) + '...' || 'none',
        provider: data?.provider || 'none'
      })
      
      if (error) {
        console.error('❌ Google OAuth error:', error)
        console.error('🔍 Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.substring(0, 500)
        })
      } else {
        console.log('✅ Google OAuth initiated successfully')
        console.log('🔍 OAuth data:', {
          url: data?.url ? 'URL generated' : 'No URL',
          provider: data?.provider,
          dataKeys: Object.keys(data || {})
        })
        
        // In Safari, track if the redirect actually happens
        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
          console.log('🍎 Safari: Setting up redirect tracking...')
          setTimeout(() => {
            console.log('🍎 Safari: Checking if still on same page after 2 seconds...')
            console.log('🍎 Current location:', window.location.href)
          }, 2000)
        }
      }
      
      return { data, error }
    } catch (err) {
      console.error('❌ Google OAuth exception:', err)
      console.error('🔍 Exception details:', {
        name: (err as Error).name,
        message: (err as Error).message,
        stack: (err as Error).stack?.substring(0, 500)
      })
      return { data: null, error: err }
    }
  }
} 