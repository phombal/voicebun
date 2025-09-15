'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { auth, supabase } from '@/lib/database/auth'
import { clientDb } from '@/lib/database/client-service'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Simple Safari detection
const isSafari = () => {
  if (typeof window === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
         /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.vendor && navigator.vendor.indexOf('Apple') > -1)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  
  const isMountedRef = useRef(true)
  const hasInitializedRef = useRef(false)
  const authListenerRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Single lock to prevent race conditions
  const initializingRef = useRef(false)
  const initializationAttemptRef = useRef(0) // Track initialization attempts
  const maxInitializationAttempts = 3 // Prevent infinite retry loops
  
  // Token refresh handling
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Simple, reliable auth state update
  const updateAuthState = useCallback((newSession: Session | null, source: string) => {
    if (!isMountedRef.current) {
      console.log(`⚠️ Auth update from ${source} ignored - component unmounted`)
      return
    }
    
    // Validate session if it exists
    if (newSession) {
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = newSession.expires_at || 0
      
      if (expiresAt <= now) {
        console.log(`❌ Session from ${source} is expired, signing out`)
        console.log(`🕐 Session expired at: ${new Date(expiresAt * 1000).toISOString()}`)
        console.log(`🕐 Current time: ${new Date(now * 1000).toISOString()}`)
        
        // Clear the expired session
        auth.signOut().catch(err => console.warn('Failed to sign out expired session:', err))
        newSession = null
      }
    }
    
    console.log(`🔄 Auth update from ${source}:`, {
      hasSession: !!newSession,
      userId: newSession?.user?.id,
      expiresAt: newSession?.expires_at ? new Date(newSession.expires_at * 1000).toISOString() : 'N/A',
      currentPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      attempt: initializationAttemptRef.current
    })
    
    setSession(newSession)
    setUser(newSession?.user || null)
    
    // Only set loading to false after we've initialized
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      console.log('✅ Auth initialized successfully')
    }
    setLoading(false)
    
    // Clear timeout since we got a result
    if (timeoutRef.current) {
      console.log('🧹 Clearing auth timeout since we got a result')
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    // Reset initialization lock since we completed successfully
    initializingRef.current = false
    
    // Ensure user plan exists (non-blocking)
    if (newSession?.user?.id) {
      console.log('👤 Ensuring user plan exists for:', newSession.user.id)
      clientDb.getUserPlan().catch(err => 
        console.warn('Failed to ensure user plan:', err)
      )
    }
    
    // Set up proactive token refresh (JWT best practice)
    if (newSession?.expires_at) {
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = newSession.expires_at
      const refreshBuffer = 300 // 5 minutes before expiry
      const timeUntilRefresh = (expiresAt - now - refreshBuffer) * 1000
      
      if (timeUntilRefresh > 0) {
        // Clear any existing refresh timeout
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current)
        }
        
        console.log(`⏰ Setting token refresh in ${Math.floor(timeUntilRefresh / 1000 / 60)} minutes`)
        refreshTimeoutRef.current = setTimeout(async () => {
          console.log('🔄 Proactively refreshing token...')
          try {
            const { data, error } = await auth.getSession()
            if (error) {
              console.warn('⚠️ Proactive refresh failed:', error)
            } else {
              console.log('✅ Token refreshed proactively')
              updateAuthState(data.session, 'proactive-refresh')
            }
          } catch (err) {
            console.warn('⚠️ Proactive refresh error:', err)
          }
        }, timeUntilRefresh)
      }
    }
  }, [])

  const signOut = async () => {
    console.log('🚪 Signing out user')
    
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    // Clear refresh timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
    
    // Reset flags
    initializingRef.current = false
    hasInitializedRef.current = false
    
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
      isSafari: isSafari(),
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      attempt: initializationAttemptRef.current + 1
    })
    
    // Prevent multiple initializations
    if (initializingRef.current) {
      console.log('🔒 Auth already initializing, skipping...')
      return
    }
    
    // Prevent infinite retry loops
    initializationAttemptRef.current += 1
    if (initializationAttemptRef.current > maxInitializationAttempts) {
      console.error('🚫 Max auth initialization attempts reached, forcing completion')
      setLoading(false)
      setUser(null)
      setSession(null)
      return
    }
    
    initializingRef.current = true
    isMountedRef.current = true
    
    // Set a reasonable timeout to prevent infinite loading
    const timeoutDuration = 5000 // 5 seconds for all browsers
    console.log(`⏰ Setting auth timeout to ${timeoutDuration}ms (attempt ${initializationAttemptRef.current})`)
    
    timeoutRef.current = setTimeout(() => {
      if (loading && !hasInitializedRef.current && isMountedRef.current) {
        console.log('⏰ Auth timeout reached - forcing completion')
        hasInitializedRef.current = true
        setLoading(false)
        setUser(null)
        setSession(null)
        initializingRef.current = false
      }
    }, timeoutDuration)

    const setupAuthListener = () => {
      console.log('👂 Setting up auth state listener...')
      
      // Ensure we don't have multiple listeners
      if (authListenerRef.current) {
        console.log('👂 Cleaning up existing auth listener')
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
          userId: session?.user?.id
        })
        
        // Use direct update for auth state changes
        updateAuthState(session, `auth-change-${event}`)
      })

      authListenerRef.current = subscription
      console.log('✅ Auth listener setup complete')
    }

    // Initialize authentication
    const initAuth = async () => {
      console.log('🚀 Starting authentication initialization')
      
      try {
        // Setup auth listener first
        setupAuthListener()
        
        // Always get the current session - Supabase will handle OAuth detection automatically
        console.log('🔄 Getting current session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) {
          console.log('⚠️ Component unmounted during session check')
          return
        }
        
        if (error) {
          console.error('❌ Error getting session:', error)
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
      
      console.log('🏁 Auth initialization process completed')
    }

    // Set up periodic session validation (every minute)
    const sessionValidationInterval = setInterval(() => {
      if (!isMountedRef.current || !hasInitializedRef.current) {
        return
      }
      
      auth.getSession().then(({ session, error }) => {
        if (error) {
          console.warn('⚠️ Error during periodic session check:', error)
          return
        }
        
        if (session) {
          const now = Math.floor(Date.now() / 1000)
          const expiresAt = session.expires_at || 0
          
          if (expiresAt <= now) {
            console.log('🕐 Periodic check: Session expired, signing out')
            updateAuthState(null, 'periodic-validation-expired')
          }
        }
      }).catch(err => {
        console.warn('⚠️ Periodic session validation error:', err)
      })
    }, 60000) // Check every minute

    initAuth()

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up auth context...')
      isMountedRef.current = false
      initializingRef.current = false
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
      
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe()
        authListenerRef.current = null
      }
      
      if (sessionValidationInterval) {
        clearInterval(sessionValidationInterval)
      }
    }
  }, [updateAuthState]) // Remove loading dependency to prevent loops

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