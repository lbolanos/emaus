# Google OAuth Setup Guide

This guide explains how to create and configure Google OAuth credentials for the EMAUS project authentication system.

## Prerequisites

- A Google account
- Access to the Google Cloud Console
- A domain or local development setup

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. If you don't have a project yet, click "Create Project"
3. Enter a project name (e.g., "EMAUS Authentication")
4. Choose your organization (if applicable)
5. Click "Create"

![Create Project](https://developers.google.com/workspace/guides/images/create-project.png)

## Step 2: Enable the Google+ API

1. In your Google Cloud Project, navigate to "APIs & Services" → "Library"
2. Search for "Google+ API" (or "Identity Toolkit API" - both work)
3. Click on the API
4. Click "Enable"

> **Note**: Starting from 2023, Google has deprecated the Google+ API. You can alternatively use the "Google Identity Services" or the "People API" for OAuth flows.

## Step 3: Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"

### If this is your first time:

1. Click "Configure consent screen"
2. Choose "External" user type
3. Fill in the required fields:
   - **App name**: EMAUS (or your app name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click "Save and Continue"
5. On the Scopes page, click "Save and Continue" (defaults are fine)
6. On the Test users page, add your email if you want to test, then click "Save and Continue"

### Create the Client ID:

1. Click "Create Credentials" → "OAuth 2.0 Client IDs"
2. Choose "Web application" as the application type
3. Enter a name for your client (e.g., "EMAUS Web App")
4. Under "Authorized JavaScript origins", add:
   - For development: `http://localhost:5173`
   - For production: Your production domain (e.g., `https://yourapp.com`)
5. Under "Authorized redirect URIs", add:
   - For development: `http://localhost:3001/api/auth/google/callback`
   - For production: `https://yourapp.com/api/auth/google/callback`
6. Click "Create"

## Step 4: Get Your Credentials

After creating the OAuth 2.0 client, you'll see a modal with:

- **Client ID**: A long string (starting with something like `123456789-abcdefg.apps.googleusercontent.com`)
- **Client Secret**: Another long string

Copy these values - you'll need them for the next step.

## Step 5: Configure Environment Variables

1. Open your `apps/api/.env` file
2. Replace the placeholder values:

```env
# Replace these with your actual Google OAuth credentials
GOOGLE_CLIENT_ID=your_actual_google_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret_here

# Make sure your frontend URL is set (for redirect after login)
FRONTEND_URL=http://localhost:5173  # For development
# FRONTEND_URL=https://yourdomain.com  # For production
```

### Environment Variables Reference

- `GOOGLE_CLIENT_ID`: The OAuth 2.0 Client ID from Google Console
- `GOOGLE_CLIENT_SECRET`: The OAuth 2.0 Client Secret from Google Console
- `SESSION_SECRET`: Random string for session encryption (already set)
- `FRONTEND_URL`: The URL where your frontend application runs

## Step 6: Verify Configuration

1. Start your API server: `npm run dev` in `apps/api/`
2. Start your web application: `npm run dev` in `apps/web/`
3. Navigate to your application login page
4. Click "Login with Google"
5. You should be redirected to Google's authentication page
6. After successful authentication, you should be redirected back to your application

## Troubleshooting

### Invalid Client Error

- Verify your Client ID is correct and copied in full
- Make sure the OAuth consent screen is configured
- Check that the Google+ API (or alternative) is enabled

### Redirect URI Mismatch

- Ensure your redirect URI in Google Console matches exactly: `{API_BASE_URL}/api/auth/google/callback`
- For local development, it should be `http://localhost:3001/api/auth/google/callback`

### CORS Issues

- Add your domain to the "Authorized JavaScript origins" in Google Console
- For development: `http://localhost:5173`
- For production: `https://yourdomain.com`

### HTTP vs HTTPS

- OAuth requires HTTPS in production
- Development can use HTTP, but production must use HTTPS
- Make sure your `FRONTEND_URL` matches your Google Console configuration

## Production Deployment

### 1. Update Redirect URIs

In Google Cloud Console, update the OAuth client settings:

- Add your production domain to "Authorized JavaScript origins"
- Add your production callback URL to "Authorized redirect URIs"

### 2. Update Environment Variables

Set the production values in your deployment environment:

```env
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
FRONTEND_URL=https://yourdomain.com
```

### 3. Publish Consent Screen (if needed)

If you want to move from "Testing" to "Published" status:

1. Go to "OAuth consent screen"
2. Verify all information is complete
3. Click "Publish App"

> **Note**: Google may require verification for public apps with sensitive scopes.

## Security Best Practices

1. **Never commit credentials**: Store them in environment variables, not in code
2. **Restrict origins**: Only add domains you control to authorized origins
3. **Use HTTPS in production**: OAuth requires secure connections for production
4. **Monitor usage**: Check Google Cloud Console for unusual activity
5. **Regular rotation**: Consider rotating credentials periodically

## Testing the OAuth Flow

1. Clear any existing sessions/cookies
2. Navigate to your login page
3. Click "Sign in with Google"
4. Authenticate with a valid Google account
5. Verify you're redirected back to the application/dashboard

## Code Implementation Details

The OAuth flow uses:

- **Passport.js** with the Google OAuth 2.0 strategy
- **Scopes**: `profile` and `email`
- **Strategy Type**: Authorization Code flow
- **Backend**: Express.js with session management
- **Frontend**: Vue.js application

The authentication process:

1. User clicks "Login with Google"
2. User redirected to Google OAuth page
3. User grants permissions
4. Google redirects back with authorization code
5. Backend exchanges code for access token
6. User profile is fetched and user is created/updated in database
7. Session is established and user is logged in

For more details, check the authentication-related files:

- `apps/api/src/services/authService.ts` - Passport configuration
- `apps/api/src/controllers/authController.ts` - Route handlers
- `apps/api/src/routes/authRoutes.ts` - Route definitions
- `apps/api/src/config.ts` - Configuration loading
