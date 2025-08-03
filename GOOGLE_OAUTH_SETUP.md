# Google OAuth Setup Guide

## Prerequisites
1. A Google Cloud Console account
2. A project in Google Cloud Console

## Steps to Configure Google OAuth

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen first:
   - Choose "External" for user type
   - Fill in the required fields (App name, User support email, Developer contact)
   - Add your domain to authorized domains
   - Save and continue

### 2. Configure OAuth Client

1. For Application type, select **Web application**
2. Name your OAuth client (e.g., "SynergyFit Web Client")
3. Add Authorized JavaScript origins:
   - `http://localhost:3000` (for local development)
   - `http://localhost:5173` (for Vite development)
   - Your production frontend URL
4. Add Authorized redirect URIs:
   - `http://localhost:5001/api/v1/auth/google/callback` (for local development)
   - Your production API URL + `/api/v1/auth/google/callback`
5. Click **Create**

### 3. Copy Credentials

After creating, you'll receive:
- **Client ID**: Copy this value
- **Client Secret**: Copy this value (keep it secure!)

### 4. Configure Environment Variables

Add these to your backend `.env` file:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here

# Session Configuration
SESSION_SECRET=your-secure-session-secret-here

# Frontend URL (for redirects)
FRONTEND_URL=http://localhost:5173
```

### 5. Test the Integration

1. Start your backend server: `npm run dev`
2. Start your frontend: `npm run dev`
3. Navigate to the login page
4. Click "Continue with Google"
5. Complete the Google authentication flow
6. You should be redirected back to your app and logged in

## Production Deployment

When deploying to production:

1. Update the OAuth client in Google Cloud Console:
   - Add your production domain to Authorized JavaScript origins
   - Add your production callback URL to Authorized redirect URIs
2. Update your production environment variables
3. Ensure HTTPS is enabled (required for OAuth in production)

## Troubleshooting

### Common Issues

1. **Redirect URI mismatch**: Ensure the redirect URI in your code exactly matches what's configured in Google Cloud Console
2. **Invalid client**: Check that your client ID and secret are correctly set in environment variables
3. **CORS errors**: Make sure your frontend URL is added to the CORS configuration in your backend

### Security Notes

- Never commit your Google Client Secret to version control
- Use environment variables for all sensitive configuration
- In production, ensure all OAuth flows happen over HTTPS
- Regularly rotate your client secret for security