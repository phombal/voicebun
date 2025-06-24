'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { auth, supabase, handleSafariPKCE } from '@/lib/database/auth'
import { clientDb } from '@/lib/database/client-service'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Simple Safari detection - updated to match auth.ts
const isSafari = () => {
  if (typeof window === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
         /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.vendor && navigator.vendor.indexOf('Apple') > -1)
}

// Check if Safari is in Private Browsing mode
const isSafariPrivateBrowsing = () => {
  if (!isSafari()) return false
  try {
    // In Safari Private Browsing, localStorage throws an error
    window.localStorage.setItem('test', 'test')
    window.localStorage.removeItem('test')
    return false
  } catch (e) {
    return true
  }
}

// Helper function to get cookie value
const getCookie = (name: string): string | null => {
  if (typeof window === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

// Helper function to delete cookie
const deleteCookie = (name: string) => {
  if (typeof window === 'undefined') return
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  
  const isMountedRef = useRef(true)
  const hasInitializedRef = useRef(false)
  const authListenerRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced auth state update to prevent rapid state changes
  const debouncedUpdateAuth = useCallback((newSession: Session | null, source: string) => {
    console.log(`🔄 debouncedUpdateAuth called from ${source}:`, {
      hasSession: !!newSession,
      userId: newSession?.user?.id,
      isSafariBrowser: isSafari(),
      currentLoading: loading,
      hasInitialized: hasInitializedRef.current
    })
    
    if (debounceRef.current) {
      console.log('🧹 Clearing existing debounce timeout')
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      if (!isMountedRef.current) {
        console.log('⚠️ Component unmounted, skipping auth update')
        return
      }
      
      console.log(`🔄 Auth update from ${source}:`, {
        hasSession: !!newSession,
        userId: newSession?.user?.id,
        isSafariBrowser: isSafari(),
        currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        sessionExpiresAt: newSession?.expires_at,
        accessTokenPresent: !!newSession?.access_token,
        refreshTokenPresent: !!newSession?.refresh_token
      })
      
      setSession(newSession)
      setUser(newSession?.user || null)
      
      // Safari-specific debugging for session updates
      if (isSafari()) {
        console.log('🍎 Safari session update details:', {
          source,
          hadSessionBefore: !!session,
          hasSessionNow: !!newSession,
          userIdBefore: session?.user?.id,
          userIdNow: newSession?.user?.id,
          currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
          timestamp: new Date().toISOString()
        });
      }
      
      // Only set loading to false after we've initialized
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        console.log('✅ Auth initialized')
      }
      setLoading(false)
      
      // Clear timeout since we got a result
      if (timeoutRef.current) {
        console.log('🧹 Clearing auth timeout since we got a result')
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      // Ensure user plan exists (non-blocking)
      if (newSession?.user?.id) {
        console.log('👤 Ensuring user plan exists for:', newSession.user.id)
        clientDb.getUserPlan().catch(err => 
          console.warn('Failed to ensure user plan:', err)
        )
      }
    }, 50) // Reduced debounce time for faster response
  }, [loading])

  // Check for OAuth completion via PKCE code (all browsers) or cookies (fallback)
  const checkOAuthCompletion = useCallback(async () => {
    if (typeof window === 'undefined') {
      console.log('🌐 checkOAuthCompletion: Running on server, skipping')
      return false
    }
    
    console.log('🔍 checkOAuthCompletion: Starting OAuth completion check', {
      url: window.location.href,
      isSafariBrowser: isSafari(),
      environment: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === 'production'
    })
    
    // Simplified approach: let Supabase handle OAuth detection automatically
    // Only check for manual PKCE if there's a code in the URL
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    
    if (code) {
      console.log('🔗 OAuth code detected in URL, attempting PKCE exchange')
      try {
        const pkceResult = await handleSafariPKCE()
        
        if (pkceResult && pkceResult.session) {
          console.log('✅ PKCE authentication successful')
          debouncedUpdateAuth(pkceResult.session, 'pkce-code')
          return true
        } else if (pkceResult && pkceResult.error) {
          console.error('❌ PKCE authentication failed:', pkceResult.error)
        }
      } catch (error) {
        console.error('❌ PKCE handling exception:', error)
      }
    }
    
    // Fallback: check for cookie-based completion (legacy method)
    const authComplete = getCookie('sb-auth-complete')
    const accessToken = getCookie('sb-access-token')
    const refreshToken = getCookie('sb-refresh-token')
    
    if (authComplete && accessToken) {
      console.log('🍪 OAuth completion detected via cookies, setting session')
      
      try {
        // Clean up the completion flag immediately
        deleteCookie('sb-auth-complete')
        
        const sessionData = {
          access_token: accessToken,
          refresh_token: refreshToken || '',
          expires_in: 3600,
          token_type: 'bearer',
          user: null as any
        }
        
        const { data, error } = await supabase.auth.setSession(sessionData)
        
        if (error) {
          console.error('❌ Error setting session from cookies:', error)
          deleteCookie('sb-access-token')
          deleteCookie('sb-refresh-token')
          return false
        }
        
        if (data.session && data.user) {
          console.log('✅ Session set successfully from OAuth cookies')
          debouncedUpdateAuth(data.session, 'oauth-cookies')
          
          // Clean up cookies after successful session restoration
          deleteCookie('sb-access-token')
          deleteCookie('sb-refresh-token')
          return true
        }
      } catch (error) {
        console.error('❌ Exception setting session from cookies:', error)
        deleteCookie('sb-auth-complete')
        deleteCookie('sb-access-token')
        deleteCookie('sb-refresh-token')
      }
    }
    
    console.log('❌ checkOAuthCompletion: No OAuth completion found')
    return false
  }, [debouncedUpdateAuth])

  const signOut = async () => {
    console.log('🚪 Signing out user')
    
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    
    // Clean up any leftover OAuth cookies
    deleteCookie('sb-auth-complete')
    deleteCookie('sb-access-token')
    deleteCookie('sb-refresh-token')
    
    // Sign out from Supabase
    await auth.signOut()
    
    if (isMountedRef.current) {
      setUser(null)
      setSession(null)
      setLoading(false)
    }
  }

  // Main auth initialization useEffect
  useEffect(() => {
    console.log('🚀 Auth context mounting...', {
      environment: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === 'production',
      isSafari: isSafari(),
      url: typeof window !== 'undefined' ? window.location.href : 'server'
    })
    
    // More aggressive timeout to prevent infinite loading
    const maxTimeout = process.env.NODE_ENV === 'production' ? 8000 : 10000 // 8s prod, 10s dev
    console.log(`⏰ Setting maximum auth timeout to ${maxTimeout}ms`)
    
    const maxTimeoutId = setTimeout(() => {
      if (loading && isMountedRef.current) {
        console.error('🚨 MAXIMUM AUTH TIMEOUT REACHED - forcing completion')
        console.log('🔍 Final timeout state:', {
          loading,
          hasInitialized: hasInitializedRef.current,
          isMounted: isMountedRef.current,
          user: !!user,
          session: !!session,
          environment: process.env.NODE_ENV,
          url: typeof window !== 'undefined' ? window.location.href : 'server'
        })
        
        // Force completion
        hasInitializedRef.current = true
        setLoading(false)
        
        // If we're on a page with an OAuth code, try one more time to handle it
        if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
          console.log('🔄 Final attempt to handle OAuth code...')
          checkOAuthCompletion().then((handled) => {
            console.log('📝 Final OAuth attempt result:', handled)
            if (!handled) {
              console.log('❌ Final OAuth attempt failed, clearing loading state')
              setUser(null)
              setSession(null)
            }
          }).catch((error) => {
            console.error('❌ Final OAuth attempt error:', error)
            setUser(null)
            setSession(null)
          })
        } else {
          setUser(null)
          setSession(null)
        }
      }
    }, maxTimeout)
    
    // Timeout to prevent infinite loading for Safari
    if (isSafari()) {
      console.log('🍎 Safari detected - setting timeout for auth initialization')
      // Use longer timeout since we're now relying on Supabase's built-in OAuth detection
      const safariTimeout = process.env.NODE_ENV === 'production' ? 3000 : 4000
      console.log(`🍎 Safari timeout set to ${safariTimeout}ms`)
      
      timeoutRef.current = setTimeout(() => {
        if (loading && !hasInitializedRef.current && isMountedRef.current) {
          console.log('⏰ Safari auth timeout - forcing completion')
          console.log('🔍 Safari timeout state:', {
            loading,
            hasInitialized: hasInitializedRef.current,
            isMounted: isMountedRef.current,
            environment: process.env.NODE_ENV
          })
          hasInitializedRef.current = true
          setLoading(false)
          setUser(null)
          setSession(null)
        }
      }, safariTimeout)
    } else {
      // For other browsers, use a longer timeout but shorter in production
      const standardTimeout = process.env.NODE_ENV === 'production' ? 4000 : 6000
      console.log(`🌐 Standard browser timeout set to ${standardTimeout}ms`)
      
      timeoutRef.current = setTimeout(() => {
        if (loading && !hasInitializedRef.current && isMountedRef.current) {
          console.log('⏰ Auth timeout - forcing completion')
          console.log('🔍 Timeout state:', {
            loading,
            hasInitialized: hasInitializedRef.current,
            isMounted: isMountedRef.current,
            environment: process.env.NODE_ENV
          })
          hasInitializedRef.current = true
          setLoading(false)
          setUser(null)
          setSession(null)
        }
      }, standardTimeout)
    }

    const setupAuthListener = () => {
      console.log('👂 Setting up auth state listener...')
      
      const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
        if (!isMountedRef.current) {
          console.log('⚠️ Auth state change ignored - component unmounted')
          return
        }
        
        console.log('🔔 Auth state change:', event, {
          hasSession: !!session,
          userId: session?.user?.id,
          isSafariBrowser: isSafari(),
          currentUrl: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
        })
        
        // Safari-specific debugging for session persistence
        if (isSafari()) {
          console.log('🍎 Safari auth state change details:', {
            event,
            hasSession: !!session,
            userId: session?.user?.id,
            currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
            sessionExpiresAt: session?.expires_at,
            accessTokenLength: session?.access_token?.length || 0
          });
          
          // Check if we're losing session during navigation
          if (event === 'SIGNED_OUT' && typeof window !== 'undefined' && window.location.pathname !== '/') {
            console.warn('🍎 Safari: Session lost during navigation to:', window.location.pathname);
            console.warn('🍎 This might be a Safari session persistence issue');
          }
        }
        
        // Clear timeout on any auth state change
        if (timeoutRef.current) {
          console.log('🧹 Clearing auth timeout due to state change')
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        
        // Update auth state
        debouncedUpdateAuth(session, `auth-change-${event}`)
      })

      authListenerRef.current = subscription
      console.log('✅ Auth listener setup complete')
      return subscription
    }

    // Initialize authentication
    const initAuth = async () => {
      isMountedRef.current = true
      hasInitializedRef.current = false
      
      console.log('🚀 initAuth: Starting authentication initialization', {
        isSafariBrowser: isSafari(),
        url: typeof window !== 'undefined' ? window.location.href : 'server'
      })
      
      // Check for Safari Private Browsing mode first
      if (isSafariPrivateBrowsing()) {
        console.warn('🔒 Safari Private Browsing detected - authentication may not work properly')
        debouncedUpdateAuth(null, 'safari-private-browsing')
        return
      }
      
      // Setup auth listener for all browsers
      console.log('👂 initAuth: Setting up auth listener...')
      setupAuthListener()
      
      try {
        // Simplified flow: check for OAuth completion first, then get session
        console.log('🔄 Checking for OAuth completion...')
        const oauthHandled = await checkOAuthCompletion()
        
        if (oauthHandled) {
          console.log('✅ OAuth completion handled successfully')
          return
        }
        
        // If no OAuth completion, get the current session
        console.log('🔄 Getting current session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) {
          console.log('⚠️ Component unmounted during session check')
          return
        }
        
        if (error) {
          console.error('❌ Error getting session:', error)
          debouncedUpdateAuth(null, 'session-error')
        } else {
          console.log('✅ Session check complete:', session ? 'found' : 'not found')
          debouncedUpdateAuth(session, 'initial-session')
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error)
        if (isMountedRef.current) {
          debouncedUpdateAuth(null, 'auth-init-error')
        }
      }
      
      console.log('🏁 initAuth: Initialization process completed')
    }

    initAuth()

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up auth context...')
      isMountedRef.current = false
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId)
      }
      
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe()
        authListenerRef.current = null
      }
    }
  }, [debouncedUpdateAuth, checkOAuthCompletion])

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 