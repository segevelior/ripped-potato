// MINIMAL POC: Direct MongoDB connection
// This bypasses the mock SDK and connects directly to your MongoDB backend

// Import MongoDB entities (real API)
export * from './mongodb-entities';

// Log only in development
if (import.meta.env.DEV) {
  console.log('🚀 Now using MongoDB backend directly!');
}