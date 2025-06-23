'use client'

import { useState } from 'react'
import { useRef, useEffect } from 'react'
import { Eye, EyeOff, User, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react'
import { auth } from '@/lib/database/auth'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onSuccess: () => void
  onModeChange: (mode: 'login' | 'signup') => void
}

export default function AuthForm({ mode, onSuccess, onModeChange }: AuthFormProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Use ref to track component mount state and prevent race conditions
  const isMountedRef = useRef(true)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper function to safely update state only if component is mounted
  const safeSetState = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    if (isMountedRef.current) {
      setter(value)
    }
  }

  // Cleanup function to clear timeouts and reset loading states
  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      console.log('🧹 Cleaning up AuthForm component')
      isMountedRef.current = false
      
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        console.log('🚫 Cleared pending auth timeout')
      }
    }
  }, [])

  const handleGoogleSignIn = async () => {
    if (!isMountedRef.current) return
    
    safeSetState(setGoogleLoading, true)
    safeSetState(setError, '')
    safeSetState(setSuccess, '')

    try {
      const { error } = await auth.signInWithGoogle()
      
      if (!isMountedRef.current) return
      
      if (error) {
        safeSetState(setError, error.message)
      }
      // Note: If successful, the user will be redirected by Google OAuth flow
    } catch (err: any) {
      if (!isMountedRef.current) return
      safeSetState(setError, err.message || 'An error occurred with Google sign in')
    } finally {
      safeSetState(setGoogleLoading, false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isMountedRef.current) return
    
    safeSetState(setLoading, true)
    safeSetState(setError, '')
    safeSetState(setSuccess, '')

    try {
      if (mode === 'signup') {
        const { data, error } = await auth.signUp(formData.email, formData.password, formData.fullName)
        
        if (!isMountedRef.current) return
        
        if (error) {
          safeSetState(setError, error.message)
        } else if (data.user && !data.session) {
          safeSetState(setSuccess, 'Account created successfully! Please check your email to verify your account.')
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              onSuccess()
            }
          }, 2000)
        } else {
          safeSetState(setSuccess, 'Account created successfully!')
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              onSuccess()
            }
          }, 1000)
        }
      } else {
        const { error } = await auth.signIn(formData.email, formData.password)
        
        if (!isMountedRef.current) return
        
        if (error) {
          safeSetState(setError, error.message)
        } else {
          safeSetState(setSuccess, 'Signed in successfully!')
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              onSuccess()
            }
          }, 1000)
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      safeSetState(setError, err.message || 'An error occurred')
    } finally {
      safeSetState(setLoading, false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isMountedRef.current) return
    
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="text-gray-600 text-lg">
          {mode === 'login' 
            ? 'Sign in to continue your voice agent journey' 
            : 'Join the VoiceBun community today'
          }
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* Google Sign In Button */}
      <button
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="w-full mb-6 bg-white border border-gray-300 text-gray-700 py-4 px-6 rounded-lg font-semibold text-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
      >
        {googleLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700 mr-2"></div>
            Signing in with Google...
          </div>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </>
        )}
      </button>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'signup' && (
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={handleInputChange}
                className="block w-full pl-12 pr-4 py-4 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent placeholder-gray-500 text-lg"
                placeholder="Enter your full name"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="block w-full pl-12 pr-4 py-4 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent placeholder-gray-500 text-lg"
              placeholder="Enter your email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={formData.password}
              onChange={handleInputChange}
              className="block w-full pl-12 pr-12 py-4 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent placeholder-gray-500 text-lg"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
            </div>
          ) : (
            mode === 'login' ? 'Sign In' : 'Create Account'
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
            className="text-black font-semibold hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
} 