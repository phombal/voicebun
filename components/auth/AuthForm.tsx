'use client'

import React, { useState } from 'react'
import { User, Mail, Lock, AlertCircle } from 'lucide-react'
import { auth } from '@/lib/database/auth'

interface AuthFormProps {
  mode: 'signin' | 'signup'
  onSuccess: () => void
  onModeChange: (mode: 'signin' | 'signup') => void
}

export default function AuthForm({ mode, onSuccess, onModeChange }: AuthFormProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log(`🚀 ${mode} form submitted`)
    console.log('🔍 Form data:', { 
      email: email, 
      hasPassword: !!password, 
      hasFullName: !!fullName 
    })
    
    setLoading(true)
    setError('')

    try {
      if (mode === 'signup') {
        console.log('🔄 Calling auth.signUp()...')
        const { data, error } = await auth.signUp(email, password, fullName)
        
        console.log('📝 Sign-up response:', { 
          hasUser: !!data?.user, 
          hasSession: !!data?.session, 
          hasError: !!error,
          errorMessage: error?.message 
        })
        
        if (error) {
          console.error('❌ Sign-up error:', error)
          setError(error.message)
        } else if (data.user && !data.session) {
          console.log('📧 Sign-up successful - email verification required')
          setTimeout(() => {
            console.log('🔄 Calling onSuccess after email verification message')
            onSuccess()
          }, 2000)
        } else {
          console.log('✅ Sign-up successful with immediate session')
          setTimeout(() => {
            console.log('🔄 Calling onSuccess after successful signup')
            onSuccess()
          }, 1000)
        }
      } else {
        console.log('🔄 Calling auth.signIn()...')
        const { error } = await auth.signIn(email, password)
        
        console.log('📝 Sign-in response:', { hasError: !!error, errorMessage: error?.message })
        
        if (error) {
          console.error('❌ Sign-in error:', error)
          setError(error.message)
        } else {
          console.log('✅ Sign-in successful')
          setTimeout(() => {
            console.log('🔄 Calling onSuccess after successful signin')
            onSuccess()
          }, 1000)
        }
      }
    } catch (err: any) {
      console.error(`❌ ${mode} exception:`, err)
      setError(err.message || 'An error occurred')
    } finally {
      console.log(`🏁 ${mode} process completed, setting loading to false`)
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError('')
    
    try {
      console.log('🔄 Calling auth.signInWithGoogle()...')
      const { error } = await auth.signInWithGoogle()
      
      if (error) {
        console.error('❌ Google sign-in error:', error)
        setError(error.message)
        setLoading(false)
      }
      // If successful, the user will be redirected by OAuth flow
    } catch (err: any) {
      console.error('❌ Google sign-in exception:', err)
      setError(err.message || 'An error occurred with Google sign-in')
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.name === 'fullName') {
      setFullName(e.target.value)
    } else if (e.target.name === 'email') {
      setEmail(e.target.value)
    } else if (e.target.name === 'password') {
      setPassword(e.target.value)
    }
  }

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl p-10 w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="text-gray-300 text-lg">
          {mode === 'signin' 
            ? 'Sign in to continue your voice agent journey' 
            : 'Join the VoiceBun community today'
          }
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'signup' && (
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-2">
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
                value={fullName}
                onChange={handleInputChange}
                className="block w-full pl-12 pr-4 py-4 text-white bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-transparent placeholder-gray-400 text-lg"
                placeholder="Enter your full name"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
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
              value={email}
              onChange={handleInputChange}
              className="block w-full pl-12 pr-4 py-4 text-white bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-transparent placeholder-gray-400 text-lg"
              placeholder="Enter your email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={handleInputChange}
              className="block w-full pl-12 pr-12 py-4 text-white bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-transparent placeholder-gray-400 text-lg"
              placeholder="Enter your password"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black py-4 px-6 rounded-lg font-semibold text-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
              {mode === 'signin' ? 'Signing In...' : 'Creating Account...'}
            </div>
          ) : (
            mode === 'signin' ? 'Sign In' : 'Create Account'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="mt-6 mb-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-900/50 text-gray-400">Or continue with</span>
          </div>
        </div>
      </div>

      {/* Google Sign In Button */}
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full bg-white text-gray-900 py-4 px-6 rounded-lg font-semibold text-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {loading ? 'Signing in...' : `Sign ${mode === 'signin' ? 'in' : 'up'} with Google`}
      </button>

      <div className="mt-8 text-center">
        <p className="text-gray-300">
          {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => onModeChange(mode === 'signin' ? 'signup' : 'signin')}
            className="text-white font-semibold hover:underline"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
} 