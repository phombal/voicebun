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
  
  // Add synchronization locks to prevent race conditions
  const authUpdateLockRef = useRef(false)
  const sessionValidationLockRef = useRef(false)
  const oauthCheckLockRef = useRef(false)

  // Enhanced Safari token validation helper with lock
  const validateSafariSession = useCallback(async () => {
    if (!isSafari() || typeof window === 'undefined') return null
    
    // Prevent concurrent validation
    if (sessionValidationLockRef.current) {
      console.log('🍎 Safari session validation already in progress, skipping...')
      return null
    }
    
    sessionValidationLockRef.current = true
    
    try {
      console.log('🍎 Validating Safari session...')
      
      // Check if we have tokens in storage
      const storageKey = 'sb-auth-token'
      const accessTokenKey = `${storageKey}-access-token`
      const refreshTokenKey = `${storageKey}-refresh-token`
      
      try {
        // Check localStorage first
        let accessToken = window.localStorage.getItem(accessTokenKey)
        let refreshToken = window.localStorage.getItem(refreshTokenKey)
        
        // If not found, check sessionStorage
        if (!accessToken) {
          accessToken = window.sessionStorage.getItem(accessTokenKey)
          refreshToken = window.sessionStorage.getItem(refreshTokenKey)
        }
        
        console.log('🍎 Safari token check:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          accessTokenLength: accessToken?.length || 0,
          refreshTokenLength: refreshToken?.length || 0
        })
        
        if (accessToken) {
          // Try to validate the session with Supabase
          console.log('🍎 Attempting to restore session from tokens...')
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          })
          
          if (error) {
            console.error('🍎 Safari session restoration failed:', error)
            // Clear invalid tokens
            try {
              window.localStorage.removeItem(accessTokenKey)
              window.localStorage.removeItem(refreshTokenKey)
              window.sessionStorage.removeItem(accessTokenKey)
              window.sessionStorage.removeItem(refreshTokenKey)
            } catch (cleanupError) {
              console.warn('🍎 Token cleanup failed:', cleanupError)
            }
            return null
          }
          
          if (data.session) {
            console.log('✅ Safari session restored successfully')
            return data.session
          }
        }
        
        return null
      } catch (error) {
        console.error('🍎 Safari session validation error:', error)
        return null
      }
    } finally {
      sessionValidationLockRef.current = false
    }
  }, [])

  // Synchronized auth state update to prevent race conditions
  const updateAuthState = useCallback((newSession: Session | null, source: string) => {
    // Prevent concurrent auth updates
    if (authUpdateLockRef.current) {
      console.log(`🔒 Auth update from ${source} blocked - update in progress`)
      return
    }
    
    authUpdateLockRef.current = true
    
    try {
      console.log(`🔄 Auth update from ${source}:`, {
        hasSession: !!newSession,
        userId: newSession?.user?.id,
        isSafariBrowser: isSafari(),
        currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        sessionExpiresAt: newSession?.expires_at,
        accessTokenPresent: !!newSession?.access_token,
        refreshTokenPresent: !!newSession?.refresh_token
      })
      
      // Only update if there's an actual change
      const hasChanged = (
        (session?.user?.id !== newSession?.user?.id) ||
        (!!session !== !!newSession) ||
        (session?.access_token !== newSession?.access_token)
      )
      
      if (!hasChanged && hasInitializedRef.current) {
        console.log(`🔄 Auth state unchanged for ${source}, skipping update`)
        authUpdateLockRef.current = false
        return
      }
      
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
    } finally {
      authUpdateLockRef.current = false
    }
  }, [session])

  // Debounced version with improved logic
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
      
      updateAuthState(newSession, source)
    }, 50) // Reduced debounce time for faster response
  }, [updateAuthState, loading])

  // Check for OAuth completion via PKCE code (all browsers) or cookies (fallback) with lock
  const checkOAuthCompletion = useCallback(async () => {
    if (typeof window === 'undefined') {
      return false
    }
    
    // Prevent concurrent OAuth checks
    if (oauthCheckLockRef.current) {
      console.log('🔒 OAuth completion check already in progress, skipping...')
      return false
    }
    
    oauthCheckLockRef.current = true
    
    try {
      // For Safari, first try to validate existing session (only if not already validating)
      if (isSafari() && !sessionValidationLockRef.current) {
        console.log('🍎 Safari detected - checking existing session first...')
        const existingSession = await validateSafariSession()
        if (existingSession) {
          console.log('✅ Safari: Found valid existing session')
          debouncedUpdateAuth(existingSession, 'safari-existing-session')
          return true
        }
        console.log('🍎 Safari: No valid existing session found, checking OAuth...')
      }
      
      // Simplified approach: let Supabase handle OAuth detection automatically
      // Only check for manual PKCE if there's a code in the URL
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      
      if (code) {
        console.log('🔗 OAuth code detected, attempting PKCE exchange...')
        try {
          const pkceResult = await handleSafariPKCE()
          
          if (pkceResult && pkceResult.session) {
            console.log('✅ PKCE authentication successful')
            debouncedUpdateAuth(pkceResult.session, 'pkce-code')
            return true
          } else if (pkceResult && pkceResult.error) {
            console.error('❌ PKCE authentication failed:', pkceResult.error)
            
            // For Safari PKCE failures, try alternative method
            if (isSafari() && pkceResult.error.message?.includes('code_verifier')) {
              console.log('🍎 Safari PKCE failed - this might be a storage issue')
              console.log('🍎 Clearing URL and letting user retry authentication')
              window.history.replaceState({}, document.title, window.location.pathname)
            }
          }
        } catch (error) {
          console.error('❌ PKCE handling exception:', error)
          
          // Clear the code from URL if PKCE failed
          if (isSafari()) {
            console.log('🍎 Safari: Clearing failed OAuth code from URL')
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        }
      }
      
      // Skip cookie fallback if we already have a session or are validating one
      if (session || sessionValidationLockRef.current) {
        console.log('🍪 Skipping cookie check - session exists or validation in progress')
        return false
      }
      
      // Fallback: check for cookie-based completion (legacy method)
      const authComplete = getCookie('sb-auth-complete')
      const accessToken = getCookie('sb-access-token')
      const refreshToken = getCookie('sb-refresh-token')
      
      if (authComplete && accessToken) {
        console.log('🍪 Cookie-based authentication detected')
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
            console.log('✅ Cookie-based authentication successful')
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
      
      return false
    } finally {
      oauthCheckLockRef.current = false
    }
  }, [debouncedUpdateAuth, validateSafariSession, session])

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
    
    // Clear locks to prevent stuck states
    authUpdateLockRef.current = false
    sessionValidationLockRef.current = false
    oauthCheckLockRef.current = false
    
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

  // Debug utility to reset auth state (for Safari debugging)
  const resetAuthState = useCallback(() => {
    console.log('🔧 Resetting auth state - clearing all locks and timeouts')
    
    // Clear all locks
    authUpdateLockRef.current = false
    sessionValidationLockRef.current = false
    oauthCheckLockRef.current = false
    
    // Clear all timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    
    // Clear any OAuth cookies
    deleteCookie('sb-auth-complete')
    deleteCookie('sb-access-token')
    deleteCookie('sb-refresh-token')
    
    // Reset state
    hasInitializedRef.current = false
    setLoading(true)
    
    // Restart auth initialization
    console.log('🔧 Restarting auth initialization after reset...')
    checkOAuthCompletion().then((handled) => {
      if (!handled) {
        auth.getSession().then(({ session, error }) => {
          if (error) {
            console.error('🔧 Session check after reset failed:', error)
            updateAuthState(null, 'reset-error')
          } else {
            updateAuthState(session, 'reset-session')
          }
        })
      }
    }).catch((error) => {
      console.error('🔧 OAuth check after reset failed:', error)
      updateAuthState(null, 'reset-oauth-error')
    })
  }, [updateAuthState, checkOAuthCompletion])

  // Expose reset function in development mode
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      // @ts-ignore - Global debug function
      window.resetAuthState = resetAuthState
      console.log('🔧 Debug: resetAuthState() is available in console')
    }
  }, [resetAuthState])

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
      console.log('🍎 Safari detected - setting aggressive timeout for auth initialization')
      // Reduced timeout for Safari to prevent hanging
      const safariTimeout = process.env.NODE_ENV === 'production' ? 2000 : 3000
      console.log(`🍎 Safari timeout set to ${safariTimeout}ms`)
      
      timeoutRef.current = setTimeout(() => {
        if (loading && !hasInitializedRef.current && isMountedRef.current) {
          console.log('⏰ Safari auth timeout - forcing completion with fallback check')
          console.log('🔍 Safari timeout state:', {
            loading,
            hasInitialized: hasInitializedRef.current,
            isMounted: isMountedRef.current,
            environment: process.env.NODE_ENV,
            currentUrl: typeof window !== 'undefined' ? window.location.href : 'unknown'
          })
          
          // Before giving up, try one last session validation for Safari
          if (typeof window !== 'undefined') {
            console.log('🍎 Safari timeout: Attempting final session validation...')
            validateSafariSession().then((session) => {
              if (session && isMountedRef.current) {
                console.log('✅ Safari timeout: Found session on final check')
                hasInitializedRef.current = true
                setSession(session)
                setUser(session.user)
                setLoading(false)
              } else {
                console.log('❌ Safari timeout: No session found, completing with null state')
                hasInitializedRef.current = true
                setLoading(false)
                setUser(null)
                setSession(null)
              }
            }).catch((error) => {
              console.error('❌ Safari timeout: Final validation failed:', error)
              hasInitializedRef.current = true
              setLoading(false)
              setUser(null)
              setSession(null)
            })
          } else {
            hasInitializedRef.current = true
            setLoading(false)
            setUser(null)
            setSession(null)
          }
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
      
      // Ensure we don't have multiple listeners
      if (authListenerRef.current) {
        console.log('👂 Auth listener already exists, unsubscribing first...')
        authListenerRef.current.unsubscribe()
        authListenerRef.current = null
      }
      
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
        
        // Use direct update for auth state changes to avoid conflicts
        updateAuthState(session, `auth-change-${event}`)
      })

      authListenerRef.current = subscription
      console.log('✅ Auth listener setup complete')
      return subscription
    }

    // Initialize authentication with better sequencing
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
        updateAuthState(null, 'safari-private-browsing')
        return
      }
      
      // Setup auth listener for all browsers FIRST
      console.log('👂 initAuth: Setting up auth listener...')
      setupAuthListener()
      
      try {
        // For Safari, try OAuth completion check first (most likely to succeed)
        if (isSafari()) {
          console.log('🍎 Safari detected - checking OAuth completion first...')
          const oauthHandled = await checkOAuthCompletion()
          if (oauthHandled) {
            console.log('✅ Safari: OAuth completion handled successfully')
            return
          }
          console.log('🍎 Safari: No OAuth completion, proceeding with session check...')
        } else {
          // For other browsers, check OAuth completion first too
          console.log('🔄 Checking for OAuth completion...')
          const oauthHandled = await checkOAuthCompletion()
          if (oauthHandled) {
            console.log('✅ OAuth completion handled successfully')
            return
          }
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
          
          // For Safari, if session fails, clear any stale tokens
          if (isSafari()) {
            console.log('🍎 Safari session error - clearing potentially stale tokens')
            try {
              const storageKey = 'sb-auth-token'
              const suffixes = ['access-token', 'refresh-token', 'code-verifier']
              suffixes.forEach(suffix => {
                const key = `${storageKey}-${suffix}`
                try {
                  window.localStorage.removeItem(key)
                  window.sessionStorage.removeItem(key)
                } catch (removeError) {
                  console.warn(`🍎 Failed to remove ${key}:`, removeError)
                }
              })
            } catch (cleanupError) {
              console.warn('🍎 Token cleanup failed:', cleanupError)
            }
          }
          
          updateAuthState(null, 'session-error')
        } else {
          console.log('✅ Session check complete:', session ? 'found' : 'not found')
          updateAuthState(session, 'initial-session')
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error)
        if (isMountedRef.current) {
          updateAuthState(null, 'auth-init-error')
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