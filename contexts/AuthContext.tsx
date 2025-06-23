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
    if (!isMountedRef.current) return
    
    const currentUser = currentSession?.user ?? null
    console.log(`🔄 Auth state update from ${source}:`, currentUser ? 'user found' : 'no user')
    
    // Update state and mark as no longer loading
    safeSetState(currentUser, currentSession, false)
    hasInitializedRef.current = true
    
    // Clear the timeout since we've successfully loaded
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
    
    // Ensure user plan exists for authenticated users (non-blocking)
    if (currentUser) {
      ensureUserPlan(currentUser.id)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    // Set a shorter timeout to prevent stuck loading (reduced from 10s to 3s)
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading && !hasInitializedRef.current) {
        console.warn('⚠️ Loading timeout reached, forcing loading to false')
        safeSetState(null, null, false)
        hasInitializedRef.current = true
      }
    }, 3000) // 3 second timeout

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('🔍 Getting initial session...')
        const { session, error } = await auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (error) {
          console.error('Error getting initial session:', error)
          handleAuthStateUpdate(null, 'initial-session-error')
        } else {
          console.log('Initial session:', session ? 'found' : 'not found')
          handleAuthStateUpdate(session, 'initial-session')
        }
      } catch (err) {
        console.error('Exception getting initial session:', err)
        if (isMountedRef.current) {
          handleAuthStateUpdate(null, 'initial-session-exception')
        }
      }
    }

    // Listen for auth changes FIRST (before getting initial session)
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return
      
      console.log('Auth state change:', event, session ? 'session exists' : 'no session')
      handleAuthStateUpdate(session, `auth-change-${event}`)
    })

    // Get initial session after setting up the listener
    getInitialSession()

    // Cleanup function
    return () => {
      console.log('Cleaning up AuthProvider')
      isMountedRef.current = false
      hasInitializedRef.current = false
      
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