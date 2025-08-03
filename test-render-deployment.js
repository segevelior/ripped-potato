#!/usr/bin/env node

/**
 * Test script for Render deployment
 * Usage: node test-render-deployment.js <backend-url> <frontend-url>
 * Example: node test-render-deployment.js https://synergyfit-api.onrender.com https://synergyfit-app.onrender.com
 */

const https = require('https');
const http = require('http');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          url: url
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function testBackendAPI(baseUrl) {
  log('\n=== Testing Backend API ===', 'bright');
  
  const endpoints = [
    { path: '/api/v1/health', name: 'Health Check' },
    { path: '/api/v1/auth/status', name: 'Auth Status' },
    { path: '/api/v1/users', name: 'Users List (should require auth)' },
    { path: '/api/v1/workouts', name: 'Workouts List (should require auth)' },
    { path: '/api/v1/exercises', name: 'Exercises List (should require auth)' }
  ];

  for (const endpoint of endpoints) {
    try {
      log(`\nTesting ${endpoint.name}...`, 'cyan');
      const response = await makeRequest(`${baseUrl}${endpoint.path}`);
      
      log(`URL: ${response.url}`, 'blue');
      log(`Status: ${response.statusCode}`, response.statusCode < 400 ? 'green' : 'yellow');
      log(`Content-Type: ${response.headers['content-type']}`, 'blue');
      
      try {
        const json = JSON.parse(response.body);
        log('Response:', 'blue');
        console.log(JSON.stringify(json, null, 2));
        
        // Special checks for health endpoint
        if (endpoint.path === '/api/v1/health' && response.statusCode === 200) {
          if (json.status === 'healthy' && json.database === 'connected') {
            log('✅ Health check passed!', 'green');
          } else {
            log('⚠️  Health check returned but database might not be connected', 'yellow');
          }
        }
      } catch (e) {
        log('Response body (not JSON):', 'yellow');
        console.log(response.body);
      }
    } catch (error) {
      log(`❌ Error testing ${endpoint.name}: ${error.message}`, 'red');
    }
  }
}

async function testFrontend(baseUrl) {
  log('\n=== Testing Frontend ===', 'bright');
  
  const paths = [
    { path: '/', name: 'Home Page' },
    { path: '/login', name: 'Login Page (SPA route)' },
    { path: '/register', name: 'Register Page (SPA route)' },
    { path: '/workouts', name: 'Workouts Page (SPA route)' },
    { path: '/static/assets/index.js', name: 'Main JS Bundle (approximate path)' }
  ];

  for (const pathObj of paths) {
    try {
      log(`\nTesting ${pathObj.name}...`, 'cyan');
      const response = await makeRequest(`${baseUrl}${pathObj.path}`);
      
      log(`URL: ${response.url}`, 'blue');
      log(`Status: ${response.statusCode}`, response.statusCode < 400 ? 'green' : 'yellow');
      log(`Content-Type: ${response.headers['content-type']}`, 'blue');
      
      if (pathObj.path === '/') {
        // Check if we get the React app HTML
        if (response.body.includes('<!DOCTYPE html>') && 
            (response.body.includes('id="root"') || response.body.includes('id=root'))) {
          log('✅ Frontend index.html served correctly!', 'green');
        } else {
          log('⚠️  Response received but might not be the React app', 'yellow');
          console.log('First 500 chars:', response.body.substring(0, 500));
        }
      } else if (pathObj.path.includes('/static/')) {
        // For static assets, just check if we get a non-404
        if (response.statusCode === 404) {
          log('ℹ️  Static asset path might be different in production build', 'yellow');
        }
      } else {
        // For SPA routes, should still return index.html due to rewrite rule
        if (response.statusCode === 200 && response.headers['content-type']?.includes('text/html')) {
          log('✅ SPA route rewrite working!', 'green');
        } else {
          log('⚠️  SPA route might not be rewriting to index.html', 'yellow');
        }
      }
    } catch (error) {
      log(`❌ Error testing ${pathObj.name}: ${error.message}`, 'red');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    log('Usage: node test-render-deployment.js <backend-url> <frontend-url>', 'yellow');
    log('Example: node test-render-deployment.js https://synergyfit-api.onrender.com https://synergyfit-app.onrender.com', 'yellow');
    process.exit(1);
  }

  const [backendUrl, frontendUrl] = args;
  
  log('🚀 Starting Render Deployment Tests', 'bright');
  log(`Backend URL: ${backendUrl}`, 'blue');
  log(`Frontend URL: ${frontendUrl}`, 'blue');

  try {
    await testBackendAPI(backendUrl);
    await testFrontend(frontendUrl);
    
    log('\n\n📋 Summary:', 'bright');
    log('1. Check the results above for any errors or warnings', 'cyan');
    log('2. Ensure all required environment variables are set in Render dashboard', 'cyan');
    log('3. Frontend should serve index.html for all routes (SPA rewrite)', 'cyan');
    log('4. Backend health check should show database connected', 'cyan');
    log('5. Protected endpoints should return 401 without authentication', 'cyan');
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();