'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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

  const signOut = async () => {
    console.log('Signing out user')
    await auth.signOut()
    setUser(null)
    setSession(null)
  }

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { session, error } = await auth.getSession()
        if (error) {
          console.error('Error getting initial session:', error)
        } else {
          console.log('Initial session:', session ? 'found' : 'not found')
          setSession(session)
          setUser(session?.user ?? null)
        }
      } catch (err) {
        console.error('Exception getting initial session:', err)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session ? 'session exists' : 'no session')
      setSession(session)
      setUser(session?.user ?? null)
      
      // Create user plan if user is authenticated and doesn't have one
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        try {
          console.log('🔄 Ensuring user plan exists for:', session.user.id)
          await clientDb.getUserPlan()
          console.log('✅ User plan check completed')
        } catch (error) {
          console.error('❌ Failed to ensure user plan:', error)
        }
      }
      
      setLoading(false)
    })

    return () => {
      console.log('Unsubscribing from auth state changes')
      subscription.unsubscribe()
    }
  }, [])

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