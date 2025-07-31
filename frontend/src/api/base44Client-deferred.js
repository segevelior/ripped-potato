// Deferred SDK initialization to avoid module-scope issues
let base44 = null;

export function getBase44Client() {
  if (!base44) {
    const { createClient } = require('@base44/sdk');
    base44 = createClient({
      appId: "68812e1c2e9d8fc3dd971bc6", 
      requiresAuth: true
    });
  }
  return base44;
}

// For backward compatibility
export { getBase44Client as base44 };