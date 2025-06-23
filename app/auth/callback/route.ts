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

  // For all browsers, let client-side handle PKCE since code verifier is stored in browser
  if (code) {
    console.log('🔄 OAuth code received - redirecting to client-side for PKCE handling')
    // Redirect to home page with the code intact for client-side processing
    // This avoids the server-side code verifier issue since PKCE stores verifier in browser session
    return NextResponse.redirect(new URL(`/?code=${code}`, baseUrl))
  }

  // For any other case, redirect to auth page
  console.log('OAuth callback: No code or error, redirecting to auth')
  return NextResponse.redirect(new URL('/auth', baseUrl))
} 