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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Use refs to track component mount state and prevent race conditions
  const isMountedRef = useRef(true)
  const initialLoadCompleteRef = useRef(false)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const signOut = async () => {
    console.log('Signing out user')
    await auth.signOut()
    if (isMountedRef.current) {
      setUser(null)
      setSession(null)
    }
  }

  // Helper function to safely update state only if component is mounted
  const safeSetState = (userVal: User | null, sessionVal: Session | null, loadingVal: boolean) => {
    if (isMountedRef.current) {
      setUser(userVal)
      setSession(sessionVal)
      setLoading(loadingVal)
    }
  }

  // Helper function to ensure user plan exists
  const ensureUserPlan = async (userId: string) => {
    try {
      console.log('🔄 Ensuring user plan exists for:', userId)
      await clientDb.getUserPlan()
      console.log('✅ User plan check completed')
    } catch (error) {
      console.error('❌ Failed to ensure user plan:', error)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    // Set a timeout to prevent infinite loading (fallback safety mechanism)
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading) {
        console.warn('⚠️ Loading timeout reached, forcing loading to false')
        setLoading(false)
      }
    }, 10000) // 10 second timeout

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('🔍 Getting initial session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (error) {
          console.error('Error getting initial session:', error)
          safeSetState(null, null, false)
        } else {
          console.log('Initial session:', session ? 'found' : 'not found')
          const currentUser = session?.user ?? null
          
          // Update state immediately
          safeSetState(currentUser, session, false)
          initialLoadCompleteRef.current = true
          
          // Ensure user plan exists for authenticated users (don't wait for this)
          if (currentUser) {
            ensureUserPlan(currentUser.id)
          }
        }
      } catch (err) {
        console.error('Exception getting initial session:', err)
        if (isMountedRef.current) {
          safeSetState(null, null, false)
          initialLoadCompleteRef.current = true
        }
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return
      
      console.log('Auth state change:', event, session ? 'session exists' : 'no session')
      
      const currentUser = session?.user ?? null
      
      // Only set loading to false after initial load is complete to prevent race condition
      const shouldStillLoad = !initialLoadCompleteRef.current
      safeSetState(currentUser, session, shouldStillLoad)
      
      // Mark initial load as complete after first auth state change
      if (!initialLoadCompleteRef.current) {
        initialLoadCompleteRef.current = true
        // Ensure loading is false after initial state is set
        setTimeout(() => {
          if (isMountedRef.current) {
            setLoading(false)
          }
        }, 0)
      }
      
      // Create user plan if user is authenticated and doesn't have one
      if (currentUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        // Don't await this to prevent blocking the auth flow
        ensureUserPlan(currentUser.id)
      }
    })

    // Cleanup function
    return () => {
      console.log('Cleaning up AuthProvider')
      isMountedRef.current = false
      initialLoadCompleteRef.current = false
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
      
      subscription.unsubscribe()
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