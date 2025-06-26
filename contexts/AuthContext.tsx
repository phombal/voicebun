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

  // Simple, reliable auth state update
  const updateAuthState = useCallback((newSession: Session | null, source: string) => {
    if (!isMountedRef.current) {
      console.log(`⚠️ Auth update from ${source} ignored - component unmounted`)
      return
    }
    
    console.log(`🔄 Auth update from ${source}:`, {
      hasSession: !!newSession,
      userId: newSession?.user?.id,
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
  }, [])

  // Handle OAuth completion with URL cleanup
  const handleOAuthCompletion = useCallback(async () => {
    if (typeof window === 'undefined') return false
    
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const error = urlParams.get('error')
    
    if (error) {
      console.error('❌ OAuth error in URL:', error)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return false
    }
    
    if (code) {
      console.log('🔗 OAuth code detected, getting session...')
      try {
        // Clean up URL immediately to prevent re-processing
        window.history.replaceState({}, document.title, window.location.pathname)
        
        // Let Supabase handle the OAuth completion automatically
        // It should detect the code and exchange it for a session
        return true
      } catch (error) {
        console.error('❌ OAuth completion error:', error)
        return false
      }
    }
    
    return false
  }, [])

  const signOut = async () => {
    console.log('🚪 Signing out user')
    
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
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
        
        // Check for OAuth completion first
        const oauthHandled = await handleOAuthCompletion()
        if (oauthHandled) {
          console.log('✅ OAuth completion detected, waiting for auth state change...')
          // Don't return here - let the auth state change handler update the state
        }
        
        // Get the current session
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
      
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe()
        authListenerRef.current = null
      }
    }
  }, [updateAuthState, handleOAuthCompletion]) // Remove loading dependency to prevent loops

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