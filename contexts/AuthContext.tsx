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
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasInitializedRef = useRef(false)
  const authListenerSetupRef = useRef(false)

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
      console.log(`🔄 Setting auth state: user=${userVal ? 'present' : 'null'}, loading=${loadingVal}`)
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
      wasInitialized: hasInitializedRef.current
    })
    
    // Update state and mark as no longer loading
    safeSetState(currentUser, currentSession, false)
    hasInitializedRef.current = true
    
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
    
    try {
      console.log('🔄 Force refreshing auth state...')
      const { session, error } = await auth.getSession()
      
      if (error) {
        console.error('❌ Error force refreshing auth state:', error)
        handleAuthStateUpdate(null, 'force-refresh-error')
      } else {
        console.log('✅ Force refresh successful')
        handleAuthStateUpdate(session, 'force-refresh')
      }
    } catch (err) {
      console.error('❌ Exception during force refresh:', err)
      handleAuthStateUpdate(null, 'force-refresh-exception')
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    // Set a shorter timeout to prevent stuck loading
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current) {
        console.warn('⚠️ Loading timeout reached, forcing auth state refresh')
        forceRefreshAuthState()
      }
    }, 2000) // Reduced to 2 seconds for faster fallback

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('🔍 Getting initial session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (error) {
          console.error('❌ Error getting initial session:', error)
          handleAuthStateUpdate(null, 'initial-session-error')
        } else {
          console.log('✅ Initial session result:', session ? 'found' : 'not found')
          handleAuthStateUpdate(session, 'initial-session')
        }
      } catch (err) {
        console.error('❌ Exception getting initial session:', err)
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
          userId: session?.user?.id
        })
        
        handleAuthStateUpdate(session, `auth-change-${event}`)
      })
      
      return subscription
    }

    const subscription = setupAuthListener()

    // Get initial session after setting up the listener
    getInitialSession()

    // Additional fallback: Check auth state again after a short delay
    const fallbackTimeout = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current) {
        console.log('🔄 Fallback: Checking auth state again...')
        forceRefreshAuthState()
      }
    }, 1000) // Check again after 1 second

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up AuthProvider')
      isMountedRef.current = false
      hasInitializedRef.current = false
      authListenerSetupRef.current = false
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
      
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout)
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