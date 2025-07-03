# Google Authentication Setup Guide

## Step 1: Configure Google OAuth in Supabase

1. **Go to your Supabase Dashboard**
   - Navigate to `Authentication > Providers` in your Supabase project dashboard

2. **Enable Google Provider**
   - Find "Google" in the list of providers
   - Toggle it to "Enabled"

3. **Configure Google OAuth Settings**
   - **Client ID**: Use the value from your `.env` file: `34921648870-glkks6c7q3v8u0nru0pocpdvt128jq0c.apps.googleusercontent.com`
   - **Client Secret**: Use the value from your `.env` file: `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`

4. **⚠️ CRITICAL: Set Redirect URLs in Supabase**
   - **Site URL**: `https://www.voicebun.com` (for production)
   - **Redirect URLs**: Add both of these URLs:
     - `http://localhost:3000/auth/callback` (for development)
     - `https://www.voicebun.com/auth/callback` (for production)
   
   **Note**: These redirect URLs must match exactly what's configured in Google Cloud Console (next step).

## Step 2: Update Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project

2. **Configure OAuth 2.0 Client**
   - Go to "APIs & Services" > "Credentials"
   - Find your OAuth 2.0 client ID
   - Add the following to "Authorized redirect URIs":
     - `https://kewyqwirvvwghejezeyl.supabase.co/auth/v1/callback` (your Supabase URL + /auth/v1/callback)
     - `http://localhost:3000/auth/callback` (for development testing)
     - `https://www.voicebun.com/auth/callback` (for production)

## Step 3: Test the Integration

1. **Start your development server**
   ```bash
   npm run dev
   ```

2. **Navigate to the auth page**
   - Go to `http://localhost:3000/auth`
   - You should see the "Sign in with Google" button

3. **Test Google Sign-in**
   - Click the Google button
   - Complete the OAuth flow
   - You should be redirected back to the home page as an authenticated user

## Troubleshooting

- **Error: "redirect_uri_mismatch"**: 
  - Check that redirect URIs in Google Cloud Console match exactly
  - Ensure Supabase redirect URLs are configured properly
  - Verify the Supabase URL format: `https://[your-project].supabase.co/auth/v1/callback`

- **Error: "invalid_client"**: 
  - Check that your Client ID and Secret are correctly set in Supabase
  - Verify the credentials match what's in Google Cloud Console

- **Error: "access_denied"**: 
  - The user cancelled the OAuth flow
  - Your app may need verification in Google Cloud Console

- **Redirected back to login page**: 
  - Check browser console for authentication errors
  - Verify Supabase Site URL is set correctly
  - Ensure cookies are enabled in browser

## Features Added

- ✅ Google OAuth sign-in button on auth page
- ✅ Automatic redirect handling
- ✅ Unified home page (works for both authenticated and unauthenticated users)
- ✅ Beautiful Google button with official branding
- ✅ Error handling for failed authentication
- ✅ Enhanced debugging and logging

The Google authentication is now fully integrated into your VoiceBun application! 