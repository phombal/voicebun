'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { auth } from '@/lib/database/auth'
import { clientDb } from '@/lib/database/client-service'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Safari detection utility
const isSafari = () => {
  if (typeof window === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

// Safari-specific session cleanup
const clearSafariAuthState = () => {
  if (typeof window === 'undefined') return
  
  try {
    // Clear all Supabase-related localStorage items
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-') || key.includes('auth'))) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => {
      console.log('🧹 Clearing Safari localStorage key:', key)
      localStorage.removeItem(key)
    })
    
    // Also clear sessionStorage
    const sessionKeysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-') || key.includes('auth'))) {
        sessionKeysToRemove.push(key)
      }
    }
    
    sessionKeysToRemove.forEach(key => {
      console.log('🧹 Clearing Safari sessionStorage key:', key)
      sessionStorage.removeItem(key)
    })
  } catch (error) {
    console.warn('⚠️ Error clearing Safari auth state:', error)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Use refs to track component mount state and prevent race conditions
  const isMountedRef = useRef(true)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasInitializedRef = useRef(false)
  const authListenerSetupRef = useRef(false)
  const safariRetryCountRef = useRef(0)
  const isActivelyAuthenticatingRef = useRef(false)
  const recentAuthEventRef = useRef<string | null>(null)
  const safariPollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastAuthCheckRef = useRef<number>(0)
  const safariMaxRetries = 3

  const signOut = async () => {
    console.log('Signing out user')
    
    // Clear Safari polling
    if (safariPollingIntervalRef.current) {
      clearInterval(safariPollingIntervalRef.current)
      safariPollingIntervalRef.current = null
    }
    
    // Clear Safari-specific state before signing out
    if (isSafari()) {
      clearSafariAuthState()
    }
    
    await auth.signOut()
    if (isMountedRef.current) {
      setUser(null)
      setSession(null)
    }
  }

  // Helper function to safely update state only if component is mounted
  const safeSetState = (userVal: User | null, sessionVal: Session | null, loadingVal: boolean) => {
    if (isMountedRef.current) {
      console.log(`🔄 Setting auth state: user=${userVal ? 'present' : 'null'}, loading=${loadingVal}, source=safeSetState`)
      setUser(userVal)
      setSession(sessionVal)
      setLoading(loadingVal)
    }
  }

  // Helper function to ensure user plan exists (non-blocking)
  const ensureUserPlan = async (userId: string) => {
    try {
      console.log('🔄 Ensuring user plan exists for:', userId)
      await clientDb.getUserPlan()
      console.log('✅ User plan check completed')
    } catch (error) {
      console.error('❌ Failed to ensure user plan:', error)
    }
  }

  // Safari-specific polling mechanism to check auth state
  const startSafariAuthPolling = () => {
    if (!isSafari() || safariPollingIntervalRef.current) return
    
    console.log('🍎 Starting Safari auth polling...')
    safariPollingIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current || hasInitializedRef.current) {
        console.log('🍎 Stopping Safari polling - initialized or unmounted')
        if (safariPollingIntervalRef.current) {
          clearInterval(safariPollingIntervalRef.current)
          safariPollingIntervalRef.current = null
        }
        return
      }
      
      try {
        const now = Date.now()
        if (now - lastAuthCheckRef.current < 500) return // Rate limit checks
        lastAuthCheckRef.current = now
        
        console.log('🍎 Safari polling: Checking auth state...')
        const { session, error } = await auth.getSession()
        
        if (session && session.user) {
          console.log('🍎 Safari polling: Found authenticated session!')
          handleAuthStateUpdate(session, 'safari-polling')
          if (safariPollingIntervalRef.current) {
            clearInterval(safariPollingIntervalRef.current)
            safariPollingIntervalRef.current = null
          }
        } else if (error) {
          console.log('🍎 Safari polling: Error -', error.message)
        }
      } catch (err) {
        console.log('🍎 Safari polling: Exception -', err)
      }
    }, 500) // Check every 500ms
    
    // Stop polling after 10 seconds
    setTimeout(() => {
      if (safariPollingIntervalRef.current) {
        console.log('🍎 Safari polling timeout - stopping')
        clearInterval(safariPollingIntervalRef.current)
        safariPollingIntervalRef.current = null
        
        // If still loading after polling timeout, force resolution
        if (isMountedRef.current && loading && !hasInitializedRef.current) {
          console.log('🍎 Safari polling failed - forcing resolution')
          handleAuthStateUpdate(null, 'safari-polling-timeout')
        }
      }
    }, 10000)
  }

  // Helper function to handle auth state update
  const handleAuthStateUpdate = (currentSession: Session | null, source: string) => {
    if (!isMountedRef.current) {
      console.log(`⚠️ Component unmounted, skipping auth update from ${source}`)
      return
    }
    
    const currentUser = currentSession?.user ?? null
    console.log(`🔄 Auth state update from ${source}:`, {
      hasUser: !!currentUser,
      userId: currentUser?.id,
      sessionExists: !!currentSession,
      wasInitialized: hasInitializedRef.current,
      isSafari: isSafari(),
      isActivelyAuthenticating: isActivelyAuthenticatingRef.current
    })
    
    // Track recent auth events for Safari
    recentAuthEventRef.current = source
    
    // If we have a user, mark as actively authenticated (prevents aggressive fallbacks)
    if (currentUser) {
      isActivelyAuthenticatingRef.current = true
      // Clear this flag after a delay to allow for normal flow
      setTimeout(() => {
        if (isMountedRef.current) {
          isActivelyAuthenticatingRef.current = false
        }
      }, 5000)
    }
    
    // Update state and mark as no longer loading
    safeSetState(currentUser, currentSession, false)
    hasInitializedRef.current = true
    safariRetryCountRef.current = 0 // Reset retry count on successful update
    
    // Stop Safari polling if running
    if (safariPollingIntervalRef.current) {
      console.log('✅ Stopping Safari polling - auth state resolved')
      clearInterval(safariPollingIntervalRef.current)
      safariPollingIntervalRef.current = null
    }
    
    // Clear the timeout since we've successfully loaded
    if (loadingTimeoutRef.current) {
      console.log('✅ Clearing loading timeout')
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
    
    // Ensure user plan exists for authenticated users (non-blocking)
    if (currentUser) {
      ensureUserPlan(currentUser.id)
    }
  }

  // Force refresh auth state (fallback mechanism)
  const forceRefreshAuthState = async () => {
    if (!isMountedRef.current) return
    
    // Don't force refresh if we're actively authenticating
    if (isActivelyAuthenticatingRef.current) {
      console.log('🔄 Skipping force refresh - actively authenticating')
      return
    }
    
    // Don't force refresh if we just had a recent auth event
    if (recentAuthEventRef.current && Date.now() - new Date().getTime() < 2000) {
      console.log('🔄 Skipping force refresh - recent auth event:', recentAuthEventRef.current)
      return
    }
    
    try {
      console.log('🔄 Force refreshing auth state...')
      
      // Safari-specific: Clear potentially corrupted state first
      if (isSafari() && safariRetryCountRef.current > 0) {
        console.log('🍎 Safari detected, clearing potentially corrupted auth state')
        clearSafariAuthState()
        
        // Wait a bit for Safari to process the cleanup
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      const { session, error } = await auth.getSession()
      
      if (error) {
        console.error('❌ Error force refreshing auth state:', error)
        
        // Safari-specific retry logic
        if (isSafari() && safariRetryCountRef.current < safariMaxRetries) {
          safariRetryCountRef.current++
          console.log(`🍎 Safari retry ${safariRetryCountRef.current}/${safariMaxRetries}`)
          
          // Clear state and try again after a delay
          clearSafariAuthState()
          setTimeout(() => {
            if (isMountedRef.current) {
              forceRefreshAuthState()
            }
          }, 500)
          return
        }
        
        handleAuthStateUpdate(null, 'force-refresh-error')
      } else {
        console.log('✅ Force refresh successful')
        handleAuthStateUpdate(session, 'force-refresh')
      }
    } catch (err) {
      console.error('❌ Exception during force refresh:', err)
      
      // Safari-specific error handling
      if (isSafari() && safariRetryCountRef.current < safariMaxRetries) {
        safariRetryCountRef.current++
        console.log(`🍎 Safari exception retry ${safariRetryCountRef.current}/${safariMaxRetries}`)
        clearSafariAuthState()
        setTimeout(() => {
          if (isMountedRef.current) {
            forceRefreshAuthState()
          }
        }, 500)
        return
      }
      
      handleAuthStateUpdate(null, 'force-refresh-exception')
    }
  }

  // Safari-specific initialization
  const initializeSafariAuth = async () => {
    if (!isSafari()) return
    
    console.log('🍎 Safari detected, initializing with special handling')
    
    // Check if we're in a potentially corrupted state
    const hasCorruptedState = (() => {
      try {
        const authToken = localStorage.getItem('sb-auth-token')
        if (authToken) {
          const parsed = JSON.parse(authToken)
          // Check for malformed or expired tokens
          if (!parsed || !parsed.access_token || parsed.expires_at < Date.now() / 1000) {
            return true
          }
        }
        return false
      } catch {
        return true
      }
    })()
    
    // Only clear if we don't have recent auth activity
    if (hasCorruptedState && !isActivelyAuthenticatingRef.current) {
      console.log('🍎 Safari corrupted state detected, clearing...')
      clearSafariAuthState()
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    // Safari-specific timeout (shorter for Safari, but longer if actively authenticating)
    const getTimeoutDuration = () => {
      if (isActivelyAuthenticatingRef.current) return 8000 // Longer timeout during auth
      return isSafari() ? 3000 : 2500 // Longer for Safari to account for login flows
    }
    
    const timeoutDuration = getTimeoutDuration()
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current && !isActivelyAuthenticatingRef.current) {
        console.warn(`⚠️ Loading timeout reached (${timeoutDuration}ms), forcing auth state refresh`)
        forceRefreshAuthState()
      }
    }, timeoutDuration)

    // Get initial session
    const getInitialSession = async () => {
      try {
        // Safari-specific initialization
        await initializeSafariAuth()
        
        console.log('🔍 Getting initial session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (error) {
          console.error('❌ Error getting initial session:', error)
          
          // Start Safari polling if initial session fails
          if (isSafari()) {
            console.log('🍎 Starting Safari polling due to initial session error')
            startSafariAuthPolling()
          }
          
          // Safari-specific error handling (only if not actively authenticating)
          if (isSafari() && safariRetryCountRef.current < safariMaxRetries && !isActivelyAuthenticatingRef.current) {
            safariRetryCountRef.current++
            console.log(`🍎 Safari initial session retry ${safariRetryCountRef.current}/${safariMaxRetries}`)
            clearSafariAuthState()
            setTimeout(() => {
              if (isMountedRef.current) {
                getInitialSession()
              }
            }, 300)
            return
          }
          
          handleAuthStateUpdate(null, 'initial-session-error')
        } else {
          console.log('✅ Initial session result:', session ? 'found' : 'not found')
          
          // Start Safari polling if no session found but we're in Safari
          if (isSafari() && !session) {
            console.log('🍎 Starting Safari polling - no initial session found')
            startSafariAuthPolling()
          }
          
          handleAuthStateUpdate(session, 'initial-session')
        }
      } catch (err) {
        console.error('❌ Exception getting initial session:', err)
        
        // Start Safari polling on exception
        if (isSafari()) {
          console.log('🍎 Starting Safari polling due to initial session exception')
          startSafariAuthPolling()
        }
        
        if (isMountedRef.current) {
          handleAuthStateUpdate(null, 'initial-session-exception')
        }
      }
    }

    // Listen for auth changes FIRST (before getting initial session)
    const setupAuthListener = () => {
      if (authListenerSetupRef.current) {
        console.log('⚠️ Auth listener already set up, skipping')
        return null
      }
      
      console.log('🎧 Setting up auth state listener...')
      authListenerSetupRef.current = true
      
      const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
        if (!isMountedRef.current) {
          console.log('⚠️ Component unmounted, ignoring auth change:', event)
          return
        }
        
        console.log('🎧 Auth state change event:', event, {
          hasSession: !!session,
          userId: session?.user?.id,
          isSafari: isSafari()
        })
        
        // Mark as actively authenticating for login events
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('🔐 Marking as actively authenticating due to:', event)
          isActivelyAuthenticatingRef.current = true
          // Clear this flag after allowing time for the auth flow to complete
          setTimeout(() => {
            if (isMountedRef.current) {
              console.log('🔐 Clearing actively authenticating flag')
              isActivelyAuthenticatingRef.current = false
            }
          }, 3000)
        }
        
        handleAuthStateUpdate(session, `auth-change-${event}`)
      })
      
      return subscription
    }

    const subscription = setupAuthListener()

    // Get initial session after setting up the listener
    getInitialSession()

    // Additional fallback: Check auth state again after a short delay (only if not actively authenticating)
    const fallbackTimeout = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current && !isActivelyAuthenticatingRef.current) {
        console.log('🔄 Fallback: Checking auth state again...')
        
        // Start Safari polling if we're still loading
        if (isSafari()) {
          console.log('🍎 Starting Safari polling from fallback')
          startSafariAuthPolling()
        } else {
          forceRefreshAuthState()
        }
      }
    }, isSafari() ? 1500 : 1500) // Same delay for both

    // Safari-specific: Additional aggressive fallback (only if not actively authenticating)
    let safariAggressiveFallback: NodeJS.Timeout | null = null
    if (isSafari()) {
      safariAggressiveFallback = setTimeout(() => {
        if (isMountedRef.current && loading && !hasInitializedRef.current && !isActivelyAuthenticatingRef.current) {
          console.log('🍎 Safari aggressive fallback: Forcing auth resolution')
          // Don't clear auth state if we might be in the middle of authentication
          if (!recentAuthEventRef.current || !recentAuthEventRef.current.includes('SIGNED_IN')) {
            clearSafariAuthState()
          }
          handleAuthStateUpdate(null, 'safari-aggressive-fallback')
        }
      }, 6000) // Increased to 6 seconds to allow for login flows
    }

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up AuthProvider')
      isMountedRef.current = false
      hasInitializedRef.current = false
      authListenerSetupRef.current = false
      safariRetryCountRef.current = 0
      isActivelyAuthenticatingRef.current = false
      recentAuthEventRef.current = null
      
      if (safariPollingIntervalRef.current) {
        clearInterval(safariPollingIntervalRef.current)
        safariPollingIntervalRef.current = null
      }
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
      
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout)
      }
      
      if (safariAggressiveFallback) {
        clearTimeout(safariAggressiveFallback)
      }
      
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, []) // Empty dependency array is intentional

  const value = {
    user,
    session,
    loading,
    signOut
  }

  return (
    <AuthContext.Provider value={value}>
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