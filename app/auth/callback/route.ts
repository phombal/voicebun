import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (!error && data.session) {
        console.log('✅ OAuth authentication successful for user:', data.user?.email)
        
        // Set a small delay to ensure session is properly set
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Successful authentication, redirect to home page
        return NextResponse.redirect(`${origin}/`)
      } else {
        console.error('❌ OAuth authentication failed:', error)
      }
    } catch (err) {
      console.error('❌ OAuth callback error:', err)
    }
  }

  // Authentication failed, redirect back to auth page
  console.log('🔄 Redirecting to auth page due to failed authentication')
  return NextResponse.redirect(`${origin}/auth`)
} 