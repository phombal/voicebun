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
        console.log('🔄 OAuth callback started')
        console.log('🌐 Callback environment:', {
          userAgent: navigator.userAgent,
          isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
          url: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          cookiesEnabled: navigator.cookieEnabled,
          timestamp: new Date().toISOString()
        })
        
        // Get all URL parameters for debugging
        const allParams = {}
        searchParams.forEach((value, key) => {
          allParams[key] = key === 'code' ? value.substring(0, 10) + '...' : value
        })
        console.log('🔍 All URL parameters:', allParams)
        
        const code = searchParams.get('code')
        const errorParam = searchParams.get('error')
        const state = searchParams.get('state')
        
        console.log('📋 OAuth parameters:', {
          hasCode: !!code,
          codeLength: code?.length || 0,
          hasError: !!errorParam,
          errorParam,
          hasState: !!state,
          stateLength: state?.length || 0
        })

        // Check if there's an error parameter from the OAuth provider
        if (errorParam) {
          console.error('❌ OAuth error from provider:', errorParam)
          console.error('🔍 Provider error details:', {
            error: errorParam,
            description: searchParams.get('error_description'),
            uri: searchParams.get('error_uri')
          })
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('Authentication was cancelled or failed')
          setTimeout(() => router.replace('/auth?error=oauth_cancelled'), 2000)
          return
        }

        // Check if we have an authorization code
        if (!code) {
          console.error('❌ No authorization code found in URL')
          console.error('🔍 Missing code analysis:', {
            searchParamsString: window.location.search,
            hasParams: searchParams.toString().length > 0,
            paramCount: Array.from(searchParams.entries()).length,
            allParamKeys: Array.from(searchParams.keys())
          })
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('No authorization code received')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          return
        }

        console.log('🔄 Processing OAuth callback with code:', code.substring(0, 10) + '...')
        
        // Safari-specific session debugging
        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
          console.log('🍎 Safari callback - checking environment:')
          
          // Check localStorage
          try {
            const lsTest = localStorage.getItem('auth-test') || 'none'
            localStorage.setItem('auth-test', 'callback-' + Date.now())
            console.log('🍎 Safari localStorage test:', { before: lsTest, canWrite: true })
          } catch (e) {
            console.warn('🍎 Safari localStorage issue in callback:', e)
          }
          
          // Check cookies
          const cookiesBefore = document.cookie
          console.log('🍎 Safari cookies in callback:', {
            hasCookies: !!cookiesBefore,
            cookieCount: cookiesBefore.split(';').filter(c => c.trim()).length,
            cookieString: cookiesBefore.substring(0, 200) + (cookiesBefore.length > 200 ? '...' : '')
          })
        }
        
        // First, check if user is already authenticated and validate the session
        console.log('🔍 Checking existing session...')
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession()
        
        console.log('📋 Existing session check result:', {
          hasSession: !!existingSession,
          hasError: !!sessionError,
          errorMessage: sessionError?.message,
          userId: existingSession?.user?.id,
          userEmail: existingSession?.user?.email,
          expiresAt: existingSession?.expires_at,
          accessToken: existingSession?.access_token ? 'present' : 'missing',
          refreshToken: existingSession?.refresh_token ? 'present' : 'missing'
        })
        
        if (existingSession && !sessionError) {
          // Validate that the session is actually valid by checking expiration
          const now = Math.floor(Date.now() / 1000)
          const expiresAt = existingSession.expires_at || 0
          
          console.log('🕐 Session expiration check:', {
            now: new Date(now * 1000).toISOString(),
            expiresAt: new Date(expiresAt * 1000).toISOString(),
            isValid: expiresAt > now,
            timeDiff: expiresAt - now
          })
          
          if (expiresAt > now) {
            console.log('✅ User already has valid session, redirecting to home')
            clearTimeout(maxTimeout)
            router.replace('/')
            return
          } else {
            console.log('⚠️ Existing session is expired, clearing it')
            try {
              await supabase.auth.signOut()
              console.log('✅ Expired session cleared successfully')
            } catch (signOutError) {
              console.warn('⚠️ Error clearing expired session:', signOutError)
            }
          }
        } else if (sessionError) {
          console.warn('⚠️ Error getting existing session:', sessionError)
          console.warn('🔍 Session error details:', {
            name: sessionError.name,
            message: sessionError.message,
            stack: sessionError.stack?.substring(0, 300)
          })
          // Clear any invalid session
          try {
            await supabase.auth.signOut()
            console.log('✅ Invalid session cleared after error')
          } catch (clearError) {
            console.warn('⚠️ Error clearing invalid session:', clearError)
          }
        }

        // Try to exchange the code for a session
        console.log('🔄 Exchanging code for session...')
        console.log('🔑 Exchange parameters:', {
          codeLength: code.length,
          hasCodeVerifier: !!searchParams.get('code_verifier'),
          hasState: !!state
        })
        
        const exchangeStartTime = Date.now()
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        const exchangeEndTime = Date.now()
        
        console.log('📊 Code exchange completed:', {
          duration: exchangeEndTime - exchangeStartTime + 'ms',
          hasData: !!data,
          hasSession: !!data?.session,
          hasUser: !!data?.user,
          hasError: !!exchangeError,
          errorMessage: exchangeError?.message
        })

        if (exchangeError) {
          console.error('❌ Failed to exchange code for session:', exchangeError)
          console.error('🔍 Exchange error analysis:', {
            name: exchangeError.name,
            message: exchangeError.message,
            status: (exchangeError as any).status,
            statusCode: (exchangeError as any).statusCode,
            isPKCE: exchangeError.message?.includes('code verifier') || exchangeError.message?.includes('PKCE'),
            isTimeout: exchangeError.message?.includes('timeout'),
            stack: exchangeError.stack?.substring(0, 300)
          })
          
          // Check if it's a PKCE-related error
          if (exchangeError.message?.includes('code verifier') || exchangeError.message?.includes('PKCE')) {
            console.log('🔄 PKCE error detected, checking if session exists anyway...')
            
            // Wait a moment and check again
            await new Promise(resolve => setTimeout(resolve, 1000))
            const { data: { session: retrySession }, error: retryError } = await supabase.auth.getSession()
            
            console.log('🔄 Retry session check after PKCE error:', {
              hasSession: !!retrySession,
              hasError: !!retryError,
              errorMessage: retryError?.message,
              userId: retrySession?.user?.id
            })
            
            if (retrySession && !retryError) {
              // Validate the retry session
              const now = Math.floor(Date.now() / 1000)
              const expiresAt = retrySession.expires_at || 0
              
              console.log('🕐 Retry session validation:', {
                expiresAt: new Date(expiresAt * 1000).toISOString(),
                isValid: expiresAt > now
              })
              
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
          
          console.log('✅ New session created successfully:', {
            userId: data.user?.id,
            userEmail: data.user?.email,
            expiresAt: new Date(expiresAt * 1000).toISOString(),
            isValid: expiresAt > now,
            hasAccessToken: !!data.session.access_token,
            hasRefreshToken: !!data.session.refresh_token,
            providerToken: !!data.session.provider_token,
            providerRefreshToken: !!data.session.provider_refresh_token
          })
          
          if (expiresAt > now) {
            console.log('✅ OAuth authentication successful for user:', data.user?.email)
            console.log('🔑 Session expires at:', new Date(expiresAt * 1000).toISOString())
            
            // Safari-specific success logging
            if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
              console.log('🍎 Safari OAuth success - final checks:')
              
              // Check if session is actually stored
              setTimeout(async () => {
                const { data: { session: finalCheck } } = await supabase.auth.getSession()
                console.log('🍎 Safari final session check:', {
                  hasSession: !!finalCheck,
                  sameUser: finalCheck?.user?.id === data.user?.id
                })
              }, 500)
            }
            
            clearTimeout(maxTimeout)
            // Redirect immediately without showing success page
            router.replace('/')
          } else {
            console.error('❌ New session is already expired')
            console.error('🕐 Session timestamp analysis:', {
              createdAt: new Date(now * 1000).toISOString(),
              expiresAt: new Date(expiresAt * 1000).toISOString(),
              difference: expiresAt - now
            })
            await supabase.auth.signOut()
            clearTimeout(maxTimeout)
            setStatus('error')
            setError('Session expired immediately')
            setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
          }
        } else {
          console.error('❌ No session created after code exchange')
          console.error('🔍 Exchange result analysis:', {
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            hasUser: !!data?.user,
            userKeys: data?.user ? Object.keys(data.user) : []
          })
          clearTimeout(maxTimeout)
          setStatus('error')
          setError('No session was created')
          setTimeout(() => router.replace('/auth?error=oauth_failed'), 2000)
        }
      } catch (err) {
        console.error('❌ OAuth callback exception:', err)
        console.error('🔍 Callback exception details:', {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack?.substring(0, 500),
          isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
        })
        clearTimeout(maxTimeout)
        // Clear any potentially corrupted session
        try {
          await supabase.auth.signOut()
          console.log('✅ Session cleared after exception')
        } catch (clearError) {
          console.warn('⚠️ Failed to clear session after exception:', clearError)
        }
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