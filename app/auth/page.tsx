'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthForm from '@/components/auth/AuthForm'
import { useAuth } from '@/contexts/AuthContext'
import { motion } from 'framer-motion'

function AuthPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const redirectingRef = useRef(false)
  
  console.log('🔍 AuthPageContent render:', { 
    hasUser: !!user, 
    loading, 
    mode,
    redirecting: redirectingRef.current,
    url: typeof window !== 'undefined' ? window.location.href : 'server'
  })

  // HIGHEST PRIORITY: Handle authenticated users immediately
  useEffect(() => {
    if (user && !loading && !redirectingRef.current) {
      console.log('✅ User authenticated, initiating redirect to home page')
      console.log('👤 User details:', { id: user.id, email: user.email })
      
      redirectingRef.current = true
      
      // Clear any error parameters since user is authenticated
      if (searchParams.get('error')) {
        console.log('🧹 Clearing error parameters for authenticated user')
        router.replace('/')
      } else {
        router.replace('/')
      }
      
      return
    }
    
    // Reset redirecting flag if user becomes unauthenticated
    if (!user && !loading) {
      redirectingRef.current = false
    }
  }, [user, loading, router, searchParams])

  // LOWER PRIORITY: Handle OAuth errors only for unauthenticated users
  useEffect(() => {
    // Only process errors if user is NOT authenticated and NOT loading
    if (!user && !loading && !redirectingRef.current) {
      const error = searchParams.get('error')
      if (error === 'oauth_failed') {
        setOauthError('Google authentication failed. Please try again.')
        console.log('❌ OAuth authentication failed - showing error to user')
      } else if (error === 'oauth_cancelled') {
        setOauthError('Google authentication was cancelled.')
        console.log('❌ OAuth authentication cancelled - showing error to user')
      } else {
        // Clear error if no error parameter
        setOauthError(null)
      }
    } else {
      // Clear error if user is authenticated or loading
      setOauthError(null)
    }
  }, [searchParams, user, loading])

  // Auto-clear errors and clean URL
  useEffect(() => {
    if (oauthError && !user) {
      const timer = setTimeout(() => {
        setOauthError(null)
        // Clean up the URL only if user is still not authenticated
        if (!user && searchParams.get('error')) {
          router.replace('/auth')
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [oauthError, user, searchParams, router])

  const handleSuccess = () => {
    console.log('✅ Auth form successful, redirecting to home page')
    redirectingRef.current = true
    router.replace('/')
  }

  const handleModeChange = (newMode: 'signin' | 'signup') => {
    setMode(newMode)
  }

  // Show loading state during auth initialization
  if (loading) {
    return (
      <div className="min-h-screen" style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show redirecting state for authenticated users
  if (user || redirectingRef.current) {
    return (
      <div className="min-h-screen" style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <div className="text-lg text-white">Redirecting to home...</div>
          </div>
        </div>
      </div>
    )
  }

  // Show auth form only for unauthenticated users
  return (
    <div className="min-h-screen" style={{ 
      background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Brand Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              VoiceBun
            </h1>
            <p className="text-white/80 text-lg">
              Give your idea a voice
            </p>
          </motion.div>

          {/* OAuth Error Message - only show for unauthenticated users */}
          {oauthError && !user && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg"
            >
              <p className="text-red-400 text-sm text-center">
                {oauthError}
              </p>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full"
          >
            <AuthForm 
              mode={mode} 
              onSuccess={handleSuccess}
              onModeChange={handleModeChange}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return <AuthPageContent />
} 