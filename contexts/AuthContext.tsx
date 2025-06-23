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
        isSafariBrowser: isSafari()
      })
      
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
      isSafariBrowser: isSafari()
    })
    
    // For all browsers, check for PKCE code in URL first (from server redirect)
    try {
      console.log('🔄 checkOAuthCompletion: Attempting PKCE handling...')
      const pkceResult = await handleSafariPKCE() // This function works for all browsers, not just Safari
      
      console.log('📝 PKCE result:', {
        hasResult: !!pkceResult,
        hasSession: pkceResult?.session ? true : false,
        hasError: pkceResult?.error ? true : false,
        errorMessage: pkceResult?.error
      })
      
      if (pkceResult && pkceResult.session) {
        console.log('✅ PKCE authentication successful')
        debouncedUpdateAuth(pkceResult.session, 'pkce-code')
        return true
      } else if (pkceResult && pkceResult.error) {
        console.error('❌ PKCE authentication failed:', pkceResult.error)
        // Continue to cookie check as fallback
      }
    } catch (error) {
      console.error('❌ PKCE handling exception:', error)
      // Continue to cookie check as fallback
    }
    
    console.log('🍪 checkOAuthCompletion: Checking for cookie-based completion...')
    
    // Fallback: check for cookie-based completion (legacy or backup method)
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
        
        console.log('📝 setSession result:', {
          hasData: !!data,
          hasSession: !!data?.session,
          hasUser: !!data?.user,
          hasError: !!error,
          errorMessage: error?.message
        })
        
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
    console.log('🚀 Auth context mounting...')
    
    // Timeout to prevent infinite loading for Safari
    if (isSafari()) {
      console.log('🍎 Safari detected - setting timeout for auth initialization')
      timeoutRef.current = setTimeout(() => {
        if (loading && !hasInitializedRef.current && isMountedRef.current) {
          console.log('⏰ Safari auth timeout - forcing completion')
          hasInitializedRef.current = true
          setLoading(false)
          setUser(null)
          setSession(null)
        }
      }, 2000) // 2 second timeout for Safari
    } else {
      // For other browsers, use a longer timeout
      timeoutRef.current = setTimeout(() => {
        if (loading && !hasInitializedRef.current && isMountedRef.current) {
          console.log('⏰ Auth timeout - forcing completion')
          hasInitializedRef.current = true
          setLoading(false)
          setUser(null)
          setSession(null)
        }
      }, 5000) // 5 second timeout for other browsers
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
          isSafariBrowser: isSafari()
        })
        
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
      isMountedRef.current = true
      hasInitializedRef.current = false
      
      console.log('🚀 initAuth: Starting authentication initialization', {
        isSafariBrowser: isSafari(),
        url: typeof window !== 'undefined' ? window.location.href : 'server'
      })
      
      // Check for Safari Private Browsing mode first
      if (isSafariPrivateBrowsing()) {
        console.warn('🔒 Safari Private Browsing detected - authentication may not work properly')
        // In Private Browsing, just set loading to false and don't try to authenticate
        debouncedUpdateAuth(null, 'safari-private-browsing')
        return
      }
      
      // Setup auth listener for all browsers
      console.log('👂 initAuth: Setting up auth listener...')
      setupAuthListener()
      
      try {
        // For Safari, try a simplified approach first
        if (isSafari()) {
          console.log('🍎 Safari init - checking for existing session first')
          
          // Quick session check for Safari
          console.log('🔄 Safari: Getting existing session...')
          const { session, error } = await auth.getSession()
          
          console.log('📝 Safari session check result:', {
            hasSession: !!session,
            userId: session?.user?.id,
            hasError: !!error,
            errorMessage: error?.message
          })
          
          if (!isMountedRef.current) {
            console.log('⚠️ Safari: Component unmounted during session check')
            return
          }
          
          if (session) {
            console.log('✅ Safari found existing session')
            debouncedUpdateAuth(session, 'safari-existing-session')
            return
          } else if (error) {
            console.warn('⚠️ Safari session check error:', error)
          }
          
          // Check for OAuth completion only if no existing session
          console.log('🍎 Safari checking OAuth completion...')
          const oauthHandled = await checkOAuthCompletion()
          console.log('📝 Safari OAuth completion result:', oauthHandled)
          
          if (oauthHandled) {
            console.log('✅ Safari OAuth completion handled')
            return
          }
          
          // If nothing found, complete initialization
          console.log('🍎 Safari no auth found, completing init')
          debouncedUpdateAuth(null, 'safari-no-auth')
        } else {
          // Standard flow for other browsers
          console.log('🌐 Standard browser init')
          
          // Check for OAuth completion first
          console.log('🔄 Standard: Checking OAuth completion...')
          const oauthHandled = await checkOAuthCompletion()
          console.log('📝 Standard OAuth completion result:', oauthHandled)
          
          if (oauthHandled) {
            console.log('✅ OAuth completion handled successfully')
            return
          }
          
          // Get initial session
          console.log('🔄 Standard: Getting initial session...')
          await getInitialSession()
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