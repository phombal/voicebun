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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      if (!isMountedRef.current) return
      
      console.log(`🔄 Auth update from ${source}:`, newSession ? 'session found' : 'no session')
      
      setSession(newSession)
      setUser(newSession?.user || null)
      
      // Only set loading to false after we've initialized
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        console.log('✅ Auth initialized')
      }
      setLoading(false)
      
      // Clear timeout since we got a result
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      // Ensure user plan exists (non-blocking)
      if (newSession?.user?.id) {
        clientDb.getUserPlan().catch(err => 
          console.warn('Failed to ensure user plan:', err)
        )
      }
    }, 50) // Reduced debounce time for faster response
  }, [])

  // Check for OAuth completion via PKCE code (Safari) or cookies (all browsers)
  const checkOAuthCompletion = useCallback(async () => {
    if (typeof window === 'undefined') return false
    
    // For Safari, check for PKCE code in URL (from server redirect)
    if (isSafari()) {
      try {
        const pkceResult = await handleSafariPKCE()
        if (pkceResult && pkceResult.session) {
          console.log('✅ Safari PKCE authentication successful')
          debouncedUpdateAuth(pkceResult.session, 'safari-pkce-code')
          return true
        } else if (pkceResult && pkceResult.error) {
          console.error('❌ Safari PKCE authentication failed:', pkceResult.error)
          // Continue to cookie check as fallback
        }
      } catch (error) {
        console.error('❌ Safari PKCE handling exception:', error)
        // Continue to cookie check as fallback
      }
    }
    
    // For all browsers, check for cookie-based completion (from server-side exchange)
    const authComplete = getCookie('sb-auth-complete')
    const accessToken = getCookie('sb-access-token')
    const refreshToken = getCookie('sb-refresh-token')
    
    console.log('🍪 Cookie-based auth check:', { authComplete: !!authComplete, accessToken: !!accessToken, refreshToken: !!refreshToken })
    
    if (authComplete && accessToken) {
      console.log('🍪 OAuth completion detected, setting session from cookies')
      
      try {
        // Clean up the completion flag immediately
        deleteCookie('sb-auth-complete')
        
        // For Safari, we need to manually manage the session refresh
        // since autoRefreshToken is disabled
        const sessionData = {
          access_token: accessToken,
          refresh_token: refreshToken || '',
          expires_in: 3600, // Default to 1 hour
          token_type: 'bearer',
          user: null as any // Will be populated by setSession
        }
        
        console.log('🔧 Setting session from OAuth cookies...')
        const { data, error } = await supabase.auth.setSession(sessionData)
        
        if (error) {
          console.error('❌ Error setting session from cookies:', error)
          // Clean up cookies on error
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
          
          // For Safari, set up manual token refresh since autoRefreshToken is disabled
          if (isSafari() && data.session.expires_at) {
            const expiresAt = data.session.expires_at * 1000 // Convert to milliseconds
            const now = Date.now()
            const timeUntilExpiry = expiresAt - now
            const refreshAt = Math.max(timeUntilExpiry - 60000, 30000) // Refresh 1 minute early, minimum 30 seconds
            
            console.log(`🔄 Safari manual refresh scheduled in ${refreshAt}ms`)
            setTimeout(async () => {
              try {
                console.log('🔄 Safari manual token refresh...')
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
                if (refreshError) {
                  console.error('❌ Safari manual refresh failed:', refreshError)
                } else if (refreshData.session) {
                  console.log('✅ Safari manual refresh successful')
                  debouncedUpdateAuth(refreshData.session, 'safari-manual-refresh')
                }
              } catch (error) {
                console.error('❌ Safari manual refresh exception:', error)
              }
            }, refreshAt)
          }
          
          return true
        }
      } catch (error) {
        console.error('❌ Exception setting session from cookies:', error)
        // Clean up cookies on error
        deleteCookie('sb-auth-complete')
        deleteCookie('sb-access-token')
        deleteCookie('sb-refresh-token')
      }
    }
    
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

  // Initialize authentication
  useEffect(() => {
    isMountedRef.current = true
    hasInitializedRef.current = false
    
    console.log('🚀 Initializing auth...')
    
    // Ensure we have the right Supabase client for the current browser
    if (typeof window !== 'undefined') {
      const currentIsSafari = isSafari()
      console.log('🔍 Current browser is Safari:', currentIsSafari)
      
      // For Safari, verify the client configuration
      if (currentIsSafari) {
        console.log('🍎 Safari detected - verifying client configuration')
        try {
          // Check if auto-refresh is properly disabled for Safari
          const authInstance = (supabase.auth as any)
          console.log('🔧 Safari auth config:', {
            autoRefreshToken: authInstance.autoRefreshToken,
            detectSessionInUrl: authInstance.detectSessionInUrl,
            storageKey: authInstance.storageKey
          })
        } catch (error) {
          console.warn('Could not verify Safari client config:', error)
        }
      }
    }
    
    // Safari gets a much shorter timeout due to its stricter policies
    const timeoutDuration = isSafari() ? 500 : 2000 // 0.5 seconds for Safari, 2 seconds for others
    console.log(`⏰ Setting auth timeout: ${timeoutDuration}ms (Safari: ${isSafari()})`)
    
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current) {
        console.warn(`⏰ Auth timeout reached (${timeoutDuration}ms), setting loading to false`)
        
        // For Safari, force loading to false immediately
        if (isSafari()) {
          console.log('🍎 Safari timeout - forcing auth to complete')
          
          // Force stop any lingering auth processes
          try {
            if (authListenerRef.current?.subscription) {
              authListenerRef.current.subscription.unsubscribe()
              authListenerRef.current = null
            }
            
            // Clean up any Safari auth cookies
            deleteCookie('sb-auth-complete')
            deleteCookie('sb-access-token')
            deleteCookie('sb-refresh-token')
          } catch (error) {
            console.warn('Safari cleanup error:', error)
          }
          
          setLoading(false)
          hasInitializedRef.current = true
          setSession(null)
          setUser(null)
        } else {
          setLoading(false)
          hasInitializedRef.current = true
        }
      }
    }, timeoutDuration)

    // Set up auth listener first
    const setupAuthListener = () => {
      if (authListenerRef.current) {
        console.log('🎧 Auth listener already exists, cleaning up...')
        authListenerRef.current.subscription?.unsubscribe()
        authListenerRef.current = null
      }
      
      console.log('🎧 Setting up auth state listener...')
      const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
        if (!isMountedRef.current) return
        
        console.log(`🔔 Auth state changed: ${event}`)
        
        // Handle different auth events
        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            debouncedUpdateAuth(session, `auth-event-${event}`)
            break
          case 'SIGNED_OUT':
            debouncedUpdateAuth(null, 'auth-event-signed-out')
            break
          case 'INITIAL_SESSION':
            // Always update on initial session, regardless of initialization state
            debouncedUpdateAuth(session, 'auth-event-initial')
            break
          default:
            // For other events, get current session
            try {
              const { session: currentSession } = await auth.getSession()
              debouncedUpdateAuth(currentSession, `auth-event-${event}`)
            } catch (error) {
              console.error('Error getting session after auth event:', error)
              debouncedUpdateAuth(null, `auth-event-${event}-error`)
            }
        }
      })
      
      authListenerRef.current = { subscription }
      return subscription
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('🔍 Getting initial session...')
        
        // First check for OAuth completion (PKCE for Safari, cookies for all)
        const oauthHandled = await checkOAuthCompletion()
        if (oauthHandled) {
          console.log('✅ OAuth completion handled successfully')
          return // Session was set, no need to continue
        }
        
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (error) {
          console.error('❌ Error getting initial session:', error)
          debouncedUpdateAuth(null, 'initial-session-error')
        } else {
          console.log('✅ Initial session:', session ? 'found' : 'not found')
          debouncedUpdateAuth(session, 'initial-session')
        }
      } catch (error) {
        console.error('❌ Exception getting initial session:', error)
        if (isMountedRef.current) {
          debouncedUpdateAuth(null, 'initial-session-exception')
        }
      }
    }

    // Initialize authentication
    const initAuth = async () => {
      // Check for Safari Private Browsing mode first
      if (isSafariPrivateBrowsing()) {
        console.warn('🔒 Safari Private Browsing detected - authentication may not work properly')
        // In Private Browsing, just set loading to false and don't try to authenticate
        debouncedUpdateAuth(null, 'safari-private-browsing')
        return
      }
      
      // For Safari, use simplified initialization to avoid hanging
      if (isSafari()) {
        console.log('🍎 Safari detected - using simplified initialization')
        
        // Set up auth listener but with minimal processing
        setupAuthListener()
        
        // Check for any pending OAuth completion (PKCE or cookies)
        try {
          console.log('🔍 Safari checking for OAuth completion...')
          const oauthHandled = await checkOAuthCompletion()
          if (oauthHandled) {
            console.log('✅ Safari OAuth completion handled successfully')
            return
          }
        } catch (error) {
          console.error('❌ Safari OAuth completion check failed:', error)
        }
        
        // If no OAuth completion found, complete initialization
        console.log('🍎 Safari - no pending auth, completing initialization')
        debouncedUpdateAuth(null, 'safari-no-pending-auth')
        return
      }
      
      // Setup auth listener first for non-Safari
      setupAuthListener()
      
      // Standard initialization for non-Safari browsers
      await getInitialSession()
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
      
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      
      if (authListenerRef.current?.subscription) {
        authListenerRef.current.subscription.unsubscribe()
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