'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/database/auth'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Set a maximum timeout for the entire OAuth process
    const maxTimeout = setTimeout(() => {
      console.error('❌ OAuth callback timed out after 15 seconds')
      setStatus('error')
      setError('Authentication timed out')
      setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
    }, 15000) // 15 seconds max

    const handleAuthCallback = async () => {
      try {
        const code = searchParams.get('code')
        const errorParam = searchParams.get('error')

        // Check if there's an error parameter from the OAuth provider
        if (errorParam) {
          console.error('❌ OAuth error from provider:', errorParam)
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('Authentication was cancelled or failed')
          setTimeout(() => router.replace('/auth?error=oauth_cancelled'), 2000)
          return
        }

        // Check if we have an authorization code
        if (!code) {
          console.error('❌ No authorization code found in URL')
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('No authorization code received')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          return
        }

        console.log('🔄 Processing OAuth callback with code:', code.substring(0, 10) + '...')
        
        // First, check if user is already authenticated and validate the session
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession()
        
        if (existingSession && !sessionError) {
          // Validate that the session is actually valid by checking expiration
          const now = Math.floor(Date.now() / 1000)
          const expiresAt = existingSession.expires_at || 0
          
          if (expiresAt > now) {
            console.log('✅ User already has valid session, redirecting to home')
            clearTimeout(maxTimeout)
            router.replace('/')
            return
          } else {
            console.log('⚠️ Existing session is expired, clearing it')
            await supabase.auth.signOut()
          }
        } else if (sessionError) {
          console.warn('⚠️ Error getting existing session:', sessionError)
          // Clear any invalid session
          await supabase.auth.signOut()
        }

        // Try to exchange the code for a session
        console.log('🔄 Exchanging code for session...')
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
          console.error('❌ Failed to exchange code for session:', exchangeError)
          
          // Check if it's a PKCE-related error
          if (exchangeError.message?.includes('code verifier') || exchangeError.message?.includes('PKCE')) {
            console.log('🔄 PKCE error detected, checking if session exists anyway...')
            
            // Wait a moment and check again
            await new Promise(resolve => setTimeout(resolve, 1000))
            const { data: { session: retrySession }, error: retryError } = await supabase.auth.getSession()
            
            if (retrySession && !retryError) {
              // Validate the retry session
              const now = Math.floor(Date.now() / 1000)
              const expiresAt = retrySession.expires_at || 0
              
              if (expiresAt > now) {
                console.log('✅ Valid session found after PKCE error, redirecting immediately')
                clearTimeout(maxTimeout)
                router.replace('/')
                return
              } else {
                console.log('❌ Retry session is expired')
                await supabase.auth.signOut()
              }
            }
          }
          
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('Failed to complete authentication')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          return
        }

        if (data?.session) {
          // Validate the new session
          const now = Math.floor(Date.now() / 1000)
          const expiresAt = data.session.expires_at || 0
          
          if (expiresAt > now) {
            console.log('✅ OAuth authentication successful for user:', data.user?.email)
            console.log('🔑 Session expires at:', new Date(expiresAt * 1000).toISOString())
            clearTimeout(maxTimeout)
            // Redirect immediately without showing success page
            router.replace('/')
          } else {
            console.error('❌ New session is already expired')
            await supabase.auth.signOut()
            clearTimeout(maxTimeout)
            setStatus('error')
            setError('Session expired immediately')
            setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          }
        } else {
          console.error('❌ No session created after code exchange')
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('No session was created')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
        }
      } catch (err) {
        console.error('❌ OAuth callback exception:', err)
        clearTimeout(maxTimeout)
        // Clear any potentially corrupted session
        await supabase.auth.signOut().catch(console.warn)
        setStatus('error')
        setError('An unexpected error occurred')
        setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
      }
    }

    handleAuthCallback()

    // Cleanup timeout on unmount
    return () => {
      clearTimeout(maxTimeout)
    }
  }, [searchParams, router])

  return (
    <div className="min-h-screen" style={{ 
      background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white text-lg">Completing authentication...</p>
              <p className="text-white/60 text-xs mt-2">This should only take a few seconds</p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="text-red-400 text-6xl mb-4">✗</div>
              <p className="text-white text-lg">Authentication failed</p>
              <p className="text-white/60 text-sm">{error}</p>
              <p className="text-white/40 text-xs mt-2">Redirecting back to login...</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Loading fallback component
function CallbackLoading() {
  return (
    <div className="min-h-screen" style={{ 
      background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Completing authentication...</p>
        </div>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<CallbackLoading />}>
      <AuthCallbackContent />
    </Suspense>
  )
} 