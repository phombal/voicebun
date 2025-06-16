import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  console.log('OAuth callback received:', { code: !!code, error, errorDescription })

  // Get the correct base URL for redirects
  const getBaseUrl = () => {
    // In production, use NEXT_PUBLIC_SITE_URL or construct from headers
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL
    }
    
    // Fallback to constructing from request headers
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

  if (code) {
    const cookieStore = cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    try {
      console.log('Attempting to exchange code for session...')
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError) {
        console.error('Code exchange error:', exchangeError)
        return NextResponse.redirect(new URL('/auth?error=exchange_failed', baseUrl))
      }

      if (data.session) {
        console.log('OAuth login successful, redirecting to dashboard')
        return NextResponse.redirect(new URL('/dashboard', baseUrl))
      }
      
      console.error('No session returned after code exchange')
    } catch (err) {
      console.error('OAuth callback exception:', err)
    }
  }

  console.log('OAuth callback failed, redirecting to auth with error')
  return NextResponse.redirect(new URL('/auth?error=oauth_error', baseUrl))
} 