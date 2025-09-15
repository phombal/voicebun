'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/database/auth'
import { Eye, EyeOff, RefreshCw, X } from 'lucide-react'

interface DebugAuthState {
  // Session data
  hasSession: boolean
  sessionValid: boolean
  sessionExpiry: string | null
  timeUntilExpiry: number | null
  timeUntilRefresh: number | null
  userId: string | null
  userEmail: string | null
  accessToken: string | null
  refreshToken: string | null
  
  // Cookie data
  cookieCount: number
  hasSupabaseCookies: boolean
  cookieDetails: string
  
  // Storage data
  localStorageAvailable: boolean
  supabaseKeys: string[]
  
  // Environment
  environment: string
  timestamp: string
}

export default function DebugAuthPanel() {
  const { user, session, loading } = useAuth()
  const [isVisible, setIsVisible] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [debugState, setDebugState] = useState<DebugAuthState | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Only show in development mode
  const isDevelopment = process.env.NODE_ENV === 'development'

  const updateDebugState = async () => {
    if (typeof window === 'undefined') return

    try {
      // Get fresh session data
      const { data: { session: freshSession }, error: sessionError } = await supabase.auth.getSession()
      
      // Cookie analysis
      const cookies = document.cookie
      const cookieArray = cookies.split(';').filter(c => c.trim())
      const supabaseCookies = cookieArray.filter(c => 
        c.includes('sb-') || c.includes('supabase') || c.includes('auth')
      )

      // LocalStorage analysis
      let localStorageAvailable = false
      let supabaseKeys: string[] = []
      
      try {
        const test = '__test__'
        localStorage.setItem(test, test)
        localStorage.removeItem(test)
        localStorageAvailable = true
        
        // Get Supabase-related keys
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('sb-') || key.includes('supabase'))) {
            supabaseKeys.push(key)
          }
        }
      } catch (e) {
        localStorageAvailable = false
      }

      // Session validation and timing
      let sessionValid = false
      let timeUntilExpiry: number | null = null
      let timeUntilRefresh: number | null = null
      
      if (freshSession) {
        const now = Math.floor(Date.now() / 1000)
        const expiresAt = freshSession.expires_at || 0
        sessionValid = expiresAt > now
        timeUntilExpiry = Math.max(0, expiresAt - now)
        
        // Calculate time until proactive refresh (5 minutes before expiry)
        const refreshBuffer = 300
        timeUntilRefresh = Math.max(0, expiresAt - now - refreshBuffer)
      }

      setDebugState({
        hasSession: !!freshSession,
        sessionValid,
        sessionExpiry: freshSession?.expires_at ? new Date(freshSession.expires_at * 1000).toISOString() : null,
        timeUntilExpiry,
        timeUntilRefresh,
        userId: freshSession?.user?.id || null,
        userEmail: freshSession?.user?.email || null,
        accessToken: freshSession?.access_token ? `${freshSession.access_token.slice(0, 20)}...` : null,
        refreshToken: freshSession?.refresh_token ? `${freshSession.refresh_token.slice(0, 20)}...` : null,
        cookieCount: cookieArray.length,
        hasSupabaseCookies: supabaseCookies.length > 0,
        cookieDetails: supabaseCookies.join('; ') || 'No auth cookies',
        localStorageAvailable,
        supabaseKeys,
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Debug panel error:', error)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await updateDebugState()
    setTimeout(() => setRefreshing(false), 500)
  }

  useEffect(() => {
    if (isDevelopment) {
      updateDebugState()
      // Auto-refresh every 10 seconds
      const interval = setInterval(updateDebugState, 10000)
      return () => clearInterval(interval)
    }
  }, [user, session, isDevelopment])

  // Don't render in production
  if (!isDevelopment) return null

  const getStatusColor = () => {
    if (loading) return 'bg-yellow-500'
    if (debugState?.hasSession && debugState?.sessionValid) return 'bg-green-500'
    if (debugState?.hasSession && !debugState?.sessionValid) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getStatusText = () => {
    if (loading) return 'Loading...'
    if (debugState?.hasSession && debugState?.sessionValid) return 'Authenticated'
    if (debugState?.hasSession && !debugState?.sessionValid) return 'Session Expired'
    return 'Not Authenticated'
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs">
      {/* Compact indicator */}
      {!isExpanded && (
        <div 
          onClick={() => setIsExpanded(true)}
          className="bg-black/90 border border-gray-600 rounded-lg p-2 cursor-pointer hover:bg-black/95 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <span className="text-white">Auth Debug</span>
            <Eye className="w-3 h-3 text-gray-400" />
          </div>
        </div>
      )}

      {/* Expanded panel */}
      {isExpanded && (
        <div className="bg-black/95 border border-gray-600 rounded-lg p-4 max-w-sm backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-white font-medium">Auth Debug</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {debugState && (
            <div className="space-y-2 text-gray-300">
              <div>
                <span className="text-gray-400">Status:</span> 
                <span className={`ml-1 ${debugState.hasSession && debugState.sessionValid ? 'text-green-400' : 'text-red-400'}`}>
                  {getStatusText()}
                </span>
              </div>
              
              <div>
                <span className="text-gray-400">Session:</span> 
                <span className="ml-1">{debugState.hasSession ? 'Present' : 'None'}</span>
              </div>
              
              {debugState.hasSession && (
                <>
                  <div>
                    <span className="text-gray-400">Valid:</span> 
                    <span className={`ml-1 ${debugState.sessionValid ? 'text-green-400' : 'text-red-400'}`}>
                      {debugState.sessionValid ? 'Yes' : 'No'}
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-gray-400">User:</span> 
                    <span className="ml-1">{debugState.userEmail || 'Unknown'}</span>
                  </div>
                  
                  <div>
                    <span className="text-gray-400">Expires:</span> 
                    <span className="ml-1 text-xs">
                      {debugState.sessionExpiry ? new Date(debugState.sessionExpiry).toLocaleString() : 'Unknown'}
                    </span>
                  </div>
                  
                  {debugState.timeUntilExpiry !== null && (
                    <div>
                      <span className="text-gray-400">Time left:</span> 
                      <span className="ml-1 text-xs">
                        {Math.floor(debugState.timeUntilExpiry / 60)}m {debugState.timeUntilExpiry % 60}s
                      </span>
                    </div>
                  )}
                  
                  {debugState.timeUntilRefresh !== null && debugState.timeUntilRefresh > 0 && (
                    <div>
                      <span className="text-gray-400">Refresh in:</span> 
                      <span className="ml-1 text-xs text-blue-400">
                        {Math.floor(debugState.timeUntilRefresh / 60)}m {debugState.timeUntilRefresh % 60}s
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="border-t border-gray-700 pt-2 mt-2">
                <div>
                  <span className="text-gray-400">Cookies:</span> 
                  <span className="ml-1">{debugState.cookieCount} total</span>
                </div>
                
                <div>
                  <span className="text-gray-400">Auth Cookies:</span> 
                  <span className={`ml-1 ${debugState.hasSupabaseCookies ? 'text-green-400' : 'text-red-400'}`}>
                    {debugState.hasSupabaseCookies ? 'Present' : 'None'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400">LocalStorage:</span> 
                  <span className={`ml-1 ${debugState.localStorageAvailable ? 'text-green-400' : 'text-red-400'}`}>
                    {debugState.localStorageAvailable ? 'Available' : 'Blocked'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400">Auth Keys:</span> 
                  <span className="ml-1">{debugState.supabaseKeys.length} stored</span>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-2 mt-2 text-xs text-gray-500">
                Last updated: {new Date(debugState.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
