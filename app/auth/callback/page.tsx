'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/database/auth'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const code = searchParams.get('code')
        const errorParam = searchParams.get('error')

        // Check if there's an error parameter from the OAuth provider
        if (errorParam) {
          console.error('❌ OAuth error from provider:', errorParam)
          setStatus('error')
          setError('Authentication was cancelled or failed')
          setTimeout(() => router.replace('/auth?error=oauth_cancelled'), 2000)
          return
        }

        // Check if we have an authorization code
        if (!code) {
          console.error('❌ No authorization code found in URL')
          setStatus('error')
          setError('No authorization code received')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          return
        }

        console.log('🔄 Processing OAuth callback with code:', code.substring(0, 10) + '...')
        
        // First, check if user is already authenticated
        const { data: { session: existingSession } } = await supabase.auth.getSession()
        if (existingSession) {
          console.log('✅ User already has valid session, redirecting to home')
          router.replace('/')
          return
        }

        // Try to exchange the code for a session
        const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

        if (sessionError) {
          console.error('❌ Failed to exchange code for session:', sessionError)
          
          // Check if it's a PKCE-related error
          if (sessionError.message?.includes('code verifier') || sessionError.message?.includes('PKCE')) {
            console.log('🔄 PKCE error detected, checking if session exists anyway...')
            
            // Sometimes the session is created despite the PKCE error
            // Wait a moment and check again
            await new Promise(resolve => setTimeout(resolve, 1000))
            const { data: { session: retrySession } } = await supabase.auth.getSession()
            
            if (retrySession) {
              console.log('✅ Session found after PKCE error, redirecting immediately')
              router.replace('/')
              return
            }
          }
          
          setStatus('error')
          setError('Failed to complete authentication')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          return
        }

        if (data?.session) {
          console.log('✅ OAuth authentication successful for user:', data.user?.email)
          // Redirect immediately without showing success page
          router.replace('/')
        } else {
          console.error('❌ No session created after code exchange')
          setStatus('error')
          setError('No session was created')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
        }
      } catch (err) {
        console.error('❌ OAuth callback exception:', err)
        setStatus('error')
        setError('An unexpected error occurred')
        setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
      }
    }

    handleAuthCallback()
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