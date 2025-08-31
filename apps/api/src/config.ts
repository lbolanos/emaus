import 'dotenv/config';

export const config = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'supersecretkey',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
};
