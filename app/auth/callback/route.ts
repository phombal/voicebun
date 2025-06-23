import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Detect Safari
  const userAgent = request.headers.get('user-agent') || ''
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent) ||
                   /iPad|iPhone|iPod/.test(userAgent)

  console.log('OAuth callback received:', { 
    hasCode: !!code,
    error, 
    errorDescription,
    isSafari,
    userAgent: userAgent.substring(0, 50) + '...'
  })

  // Get the correct base URL for redirects
  const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL
    }
    
    const protocol = requestUrl.protocol
    const host = requestUrl.host
    return `${protocol}//${host}`
  }

  const baseUrl = getBaseUrl()

  // If there's an error from the OAuth provider
  if (error) {
    console.error('OAuth provider error:', error, errorDescription)
    return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error)}`, baseUrl))
  }

  // For Safari, let client-side handle PKCE to avoid conflicts
  if (code && isSafari) {
    console.log('🍎 Safari PKCE code - redirecting to client-side handling')
    // Redirect to home page with the code intact for client-side processing
    return NextResponse.redirect(new URL(`/?code=${code}`, baseUrl))
  }

  // For non-Safari browsers, handle PKCE on server-side
  if (code) {
    try {
      console.log('🔄 Processing PKCE code on server-side for standard browser')
      
      // Create a server-side Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            autoRefreshToken: false, // Disable auto-refresh on server
            persistSession: false, // Don't persist on server side
            detectSessionInUrl: false,
            flowType: 'pkce'
          }
        }
      )

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError) {
        console.error('❌ Code exchange error:', exchangeError)
        return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(exchangeError.message)}`, baseUrl))
      }

      if (data.session) {
        console.log('✅ OAuth callback successful - session acquired')
        
        // Create response with redirect to home page
        const response = NextResponse.redirect(new URL('/', baseUrl))
        
        // Set session data in cookies for client-side pickup
        if (data.session.access_token) {
          console.log('🍪 Setting session cookies for client-side pickup')
          
          // Set secure cookies for session data (httpOnly=false so client can read them)
          response.cookies.set('sb-access-token', data.session.access_token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: data.session.expires_in || 3600,
            path: '/'
          })
          
          response.cookies.set('sb-refresh-token', data.session.refresh_token || '', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/'
          })
          
          // Add a flag for the client to know session is ready
          response.cookies.set('sb-auth-complete', 'true', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60, // Short-lived flag
            path: '/'
          })
        }
        
        return response
      } else {
        console.error('❌ No session received after code exchange')
        return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent('No session created')}`, baseUrl))
      }
    } catch (err) {
      console.error('❌ OAuth callback exception:', err)
      return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent('Authentication failed')}`, baseUrl))
    }
  }

  // For any other case, redirect to auth page
  console.log('OAuth callback: No code or error, redirecting to auth')
  return NextResponse.redirect(new URL('/auth', baseUrl))
} 