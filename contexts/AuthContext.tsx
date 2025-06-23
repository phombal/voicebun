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
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
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

  // Check for Safari OAuth completion via cookies
  const checkSafariOAuthCompletion = useCallback(async () => {
    if (typeof window === 'undefined') return false
    
    const authComplete = getCookie('sb-auth-complete')
    const accessToken = getCookie('sb-access-token')
    const refreshToken = getCookie('sb-refresh-token')
    
    if (authComplete && accessToken) {
      console.log('🍪 Safari OAuth completion detected, setting session from cookies')
      
      try {
        // Clean up the completion flag immediately
        deleteCookie('sb-auth-complete')
        
        // Set the session using the tokens from cookies
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || ''
        })
        
        if (error) {
          console.error('Error setting session from cookies:', error)
          // Clean up cookies on error
          deleteCookie('sb-access-token')
          deleteCookie('sb-refresh-token')
          return false
        }
        
        if (data.session) {
          console.log('✅ Session set successfully from Safari OAuth cookies')
          debouncedUpdateAuth(data.session, 'safari-oauth-cookies')
          
          // Clean up cookies after successful session restoration
          deleteCookie('sb-access-token')
          deleteCookie('sb-refresh-token')
          return true
        }
      } catch (error) {
        console.error('Exception setting session from cookies:', error)
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
    
    // Much shorter timeout for faster loading
    const timeoutDuration = 2000 // 2 seconds max timeout
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current) {
        console.warn(`⏰ Auth timeout reached (${timeoutDuration}ms), setting loading to false`)
        setLoading(false)
        hasInitializedRef.current = true
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
        
        // First check for Safari OAuth completion
        const safariOAuthHandled = await checkSafariOAuthCompletion()
        if (safariOAuthHandled) {
          return // Session was set from cookies, no need to continue
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
      // Setup auth listener first
      setupAuthListener()
      
      // For Safari, add a very small delay to handle URL fragments
      // For other browsers, proceed immediately
      if (isSafari()) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Get initial session
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
  }, [debouncedUpdateAuth, checkSafariOAuthCompletion])

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