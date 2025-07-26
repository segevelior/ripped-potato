import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication disabled for local development
export const base44 = createClient({
  appId: "68812e1c2e9d8fc3dd971bc6", 
  requiresAuth: false // DISABLED for local development - re-enable for production
});
