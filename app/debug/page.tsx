'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function DebugPage() {
  const { user, loading, session } = useAuth()
  const [debugInfo, setDebugInfo] = useState<any>({})

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDebugInfo({
        // Environment
        nodeEnv: process.env.NODE_ENV,
        
        // URLs
        currentUrl: window.location.href,
        origin: window.location.origin,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        
        // Browser
        userAgent: navigator.userAgent,
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent),
        
        // Auth state
        hasUser: !!user,
        userId: user?.id,
        hasSession: !!session,
        loading,
        
        // Cookies
        cookies: document.cookie,
        
        // LocalStorage availability
        localStorageAvailable: (() => {
          try {
            const test = '__test__'
            localStorage.setItem(test, test)
            localStorage.removeItem(test)
            return true
          } catch (e) {
            return false
          }
        })(),
        
        // URL params
        urlParams: window.location.search,
        hasCode: window.location.search.includes('code='),
        hasError: window.location.search.includes('error='),
        
        // Timestamp
        timestamp: new Date().toISOString()
      })
    }
  }, [user, loading, session])

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Debug Information</h1>
        
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Current State</h2>
          <pre className="text-sm overflow-auto whitespace-pre-wrap">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
        
        <div className="mt-6 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables (Public)</h2>
          <div className="text-sm space-y-2">
            <div>NODE_ENV: {process.env.NODE_ENV}</div>
            <div>NEXT_PUBLIC_SITE_URL: {process.env.NEXT_PUBLIC_SITE_URL || 'Not set'}</div>
            <div>NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set'}</div>
            <div>NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set'}</div>
          </div>
        </div>
        
        <div className="mt-6 space-x-4">
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              const data = JSON.stringify(debugInfo, null, 2)
              navigator.clipboard.writeText(data)
              alert('Debug info copied to clipboard!')
            }}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
          >
            Copy Debug Info
          </button>
        </div>
      </div>
    </div>
  )
} 