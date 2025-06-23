import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  
  console.log('🔄 OAuth callback received:', {
    hasCode: !!code,
    hasError: !!error,
    origin,
    userAgent: request.headers.get('user-agent'),
    environment: process.env.NODE_ENV,
    isSafari: request.headers.get('user-agent')?.includes('Safari') && !request.headers.get('user-agent')?.includes('Chrome'),
    requestUrl: request.url
  })

  // Determine the correct redirect URL based on environment
  let redirectUrl: string
  
  if (process.env.NODE_ENV === 'development') {
    redirectUrl = 'http://localhost:3000'
  } else if (process.env.NEXT_PUBLIC_SITE_URL) {
    redirectUrl = process.env.NEXT_PUBLIC_SITE_URL
  } else {
    redirectUrl = origin
    console.warn('⚠️ NEXT_PUBLIC_SITE_URL not set in production, using origin:', origin)
  }

  console.log('🔗 Callback redirect URL:', redirectUrl)

  if (error) {
    console.error('❌ OAuth error in callback:', error)
    return NextResponse.redirect(`${redirectUrl}/?error=${encodeURIComponent(error)}`)
  }

  if (code) {
    console.log('✅ OAuth code received, redirecting to landing page')
    
    // In production, add additional debugging
    if (process.env.NODE_ENV === 'production') {
      console.log('🏭 Production callback debug:', {
        code: code.substring(0, 10) + '...', // Log first 10 chars only for security
        redirectUrl,
        origin,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL
      })
    }
    
    return NextResponse.redirect(`${redirectUrl}/?code=${code}`)
  }

  console.warn('⚠️ No code or error in callback, redirecting to home')
  return NextResponse.redirect(redirectUrl)
} 