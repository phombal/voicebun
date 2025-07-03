'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthForm from '@/components/auth/AuthForm'
import { useAuth } from '@/contexts/AuthContext'
import { motion } from 'framer-motion'
import { auth } from '@/lib/database/auth'

function AuthPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const redirectingRef = useRef(false)
  
  console.log('🔍 AuthPageContent render:', { 
    hasUser: !!user, 
    loading, 
    mode,
    redirecting: redirectingRef.current,
    url: typeof window !== 'undefined' ? window.location.href : 'server'
  })

  // Set mode based on URL parameter
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    if (urlMode === 'signup') {
      console.log('📍 URL parameter detected: setting mode to signup')
      setMode('signup')
    } else if (urlMode === 'signin') {
      console.log('📍 URL parameter detected: setting mode to signin')
      setMode('signin')
    }
  }, [searchParams])

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

  const handleGoogleSignIn = async () => {
    console.log('🔄 Google sign-in button clicked')
    console.log('🌐 Auth page environment:', {
      userAgent: navigator.userAgent,
      isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
      cookiesEnabled: navigator.cookieEnabled,
      url: window.location.href,
      hasUser: !!user,
      isLoading: loading,
      timestamp: new Date().toISOString()
    })
    
    // Safari-specific pre-flight checks
    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
      console.log('🍎 Safari pre-flight checks:')
      
      // Check storage access
      try {
        if ('requestStorageAccess' in document) {
          console.log('🍎 Safari has storage access API')
          const hasAccess = await document.hasStorageAccess()
          console.log('🍎 Current storage access:', hasAccess)
          
          if (!hasAccess) {
            console.log('🍎 Requesting storage access...')
            try {
              await document.requestStorageAccess()
              console.log('✅ Safari storage access granted')
            } catch (accessError) {
              console.warn('⚠️ Safari storage access denied:', accessError)
            }
          }
        } else {
          console.log('🍎 No storage access API available')
        }
      } catch (e) {
        console.warn('🍎 Storage access check failed:', e)
      }
      
      // Check if third-party cookies are blocked
      try {
        document.cookie = 'safari-3p-test=test; path=/; SameSite=None; Secure'
        const has3pCookies = document.cookie.includes('safari-3p-test=test')
        console.log('🍪 Safari 3rd party cookies:', has3pCookies ? 'ALLOWED' : 'BLOCKED')
        if (has3pCookies) {
          document.cookie = 'safari-3p-test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
        }
      } catch (e) {
        console.warn('🍪 Safari 3rd party cookie test failed:', e)
      }
    }
    
    setIsGoogleLoading(true)
    console.log('⏰ Starting Google OAuth flow...')
    
    try {
      const startTime = Date.now()
      const result = await auth.signInWithGoogle()
      const endTime = Date.now()
      
      console.log('📊 Google OAuth initiation result:', {
        duration: endTime - startTime + 'ms',
        hasData: !!result.data,
        hasError: !!result.error,
        errorMessage: result.error?.message,
        dataUrl: result.data?.url ? 'URL present' : 'No URL'
      })
      
      if (result.error) {
        console.error('❌ Google OAuth initiation failed:', result.error)
        console.error('🔍 OAuth error analysis:', {
          name: result.error.name,
          message: result.error.message,
          isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
          cookiesEnabled: navigator.cookieEnabled
        })
        setOauthError('Failed to initiate Google sign-in. Please try again.')
      } else {
        console.log('✅ Google OAuth initiated successfully')
        
        // In Safari, track if the page change actually happens
        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
          console.log('🍎 Safari: Monitoring for page change...')
          
          // Check every 500ms for 5 seconds to see if we're still on the same page
          let checkCount = 0
          const maxChecks = 10
          const pageChangeInterval = setInterval(() => {
            checkCount++
            const currentUrl = window.location.href
            const stillOnAuthPage = currentUrl.includes('/auth') && !currentUrl.includes('/auth/callback')
            
            console.log(`🍎 Safari page check ${checkCount}/${maxChecks}:`, {
              currentUrl: currentUrl,
              stillOnAuthPage,
              timestamp: new Date().toISOString()
            })
            
            if (!stillOnAuthPage || checkCount >= maxChecks) {
              clearInterval(pageChangeInterval)
              if (stillOnAuthPage && checkCount >= maxChecks) {
                console.warn('🍎 Safari: Still on auth page after 5 seconds - possible redirect failure')
              }
            }
          }, 500)
        }
      }
    } catch (err) {
      console.error('❌ Google sign-in exception:', err)
      console.error('🔍 Exception details:', {
        name: (err as Error).name,
        message: (err as Error).message,
        stack: (err as Error).stack?.substring(0, 300),
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      })
      setOauthError('An unexpected error occurred. Please try again.')
    } finally {
      // Don't set loading to false immediately in case of redirect
      setTimeout(() => {
        console.log('⏰ Auth page: Setting loading to false after timeout')
        setIsGoogleLoading(false)
      }, 3000) // Give time for potential redirect
    }
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
              onGoogleSignIn={handleGoogleSignIn}
              isGoogleLoading={isGoogleLoading}
              error={oauthError}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// Loading fallback component
function AuthPageLoading() {
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

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <AuthPageContent />
    </Suspense>
  )
} 