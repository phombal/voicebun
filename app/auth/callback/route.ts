import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  console.log('OAuth callback received:', { 
    error, 
    errorDescription,
    url: request.url,
    searchParams: Object.fromEntries(requestUrl.searchParams.entries())
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
    return NextResponse.redirect(new URL(`/auth?error=${error}`, baseUrl))
  }

  // For implicit flow, redirect to auth page where Supabase will automatically detect the session
  console.log('OAuth callback received, redirecting to auth page for implicit flow handling')
  return NextResponse.redirect(new URL('/auth', baseUrl))
} 