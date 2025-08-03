#!/usr/bin/env node

/**
 * MongoDB Atlas Connection Test Script
 * This script tests the connection to MongoDB Atlas and validates the database setup
 */

const mongoose = require('mongoose');
// Load production environment
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.production');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.log(`❌ Error loading .env.production: ${result.error.message}`);
    process.exit(1);
}

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAtlasConnection() {
    try {
        log('🚀 Testing MongoDB Atlas Connection...', 'cyan');
        
        // Check if MONGODB_URI is set
        if (!process.env.MONGODB_URI) {
            log('❌ MONGODB_URI not found in .env.production', 'red');
            log('Please update your .env.production file with your Atlas connection string', 'yellow');
            process.exit(1);
        }

        // Validate connection string format
        if (!process.env.MONGODB_URI.includes('mongodb+srv://')) {
            log('⚠️  Warning: Connection string should use mongodb+srv:// for Atlas', 'yellow');
        }

        log(`🔗 Connecting to: ${process.env.MONGODB_URI.replace(/:([^:@]{8})[^:@]*@/, ':****@')}`, 'blue');

        // Configure connection options for Atlas
        const options = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 // Use IPv4
        };

        // Connect to Atlas
        await mongoose.connect(process.env.MONGODB_URI, options);
        
        log('✅ Successfully connected to MongoDB Atlas!', 'green');
        
        // Test database operations
        log('📊 Testing database operations...', 'cyan');
        
        // Get database info
        const dbName = mongoose.connection.name;
        const dbState = mongoose.connection.readyState;
        const dbHost = mongoose.connection.host;
        
        log(`📦 Database Name: ${dbName}`, 'blue');
        log(`🌐 Database Host: ${dbHost}`, 'blue');
        log(`🔄 Connection State: ${dbState === 1 ? 'Connected' : 'Not Connected'}`, dbState === 1 ? 'green' : 'red');
        
        // Test creating a simple document
        const TestSchema = new mongoose.Schema({
            name: String,
            createdAt: { type: Date, default: Date.now }
        });
        
        const TestModel = mongoose.model('ConnectionTest', TestSchema);
        
        // Create test document
        const testDoc = new TestModel({ name: 'Atlas Connection Test' });
        await testDoc.save();
        log('✅ Successfully created test document', 'green');
        
        // Read test document
        const foundDoc = await TestModel.findById(testDoc._id);
        if (foundDoc) {
            log('✅ Successfully read test document', 'green');
        }
        
        // Clean up test document
        await TestModel.findByIdAndDelete(testDoc._id);
        log('✅ Successfully deleted test document', 'green');
        
        // Drop the test collection
        await mongoose.connection.db.dropCollection('connectiontests');
        log('✅ Cleaned up test collection', 'green');
        
        // Display cluster statistics
        const admin = mongoose.connection.db.admin();
        const serverStatus = await admin.serverStatus();
        
        log('📈 Cluster Information:', 'cyan');
        log(`   MongoDB Version: ${serverStatus.version}`, 'blue');
        log(`   Uptime: ${Math.floor(serverStatus.uptime / 3600)} hours`, 'blue');
        log(`   Connections: ${serverStatus.connections.current}/${serverStatus.connections.available}`, 'blue');
        
        log('🎉 MongoDB Atlas connection test completed successfully!', 'green');
        log('Your database is ready for production deployment.', 'green');
        
    } catch (error) {
        log('❌ Connection test failed:', 'red');
        log(error.message, 'red');
        
        // Provide helpful error messages
        if (error.message.includes('authentication failed')) {
            log('💡 Check your database username and password in the connection string', 'yellow');
        } else if (error.message.includes('network error')) {
            log('💡 Check your network access settings in MongoDB Atlas', 'yellow');
        } else if (error.message.includes('timeout')) {
            log('💡 Check if your IP address is whitelisted in MongoDB Atlas', 'yellow');
        }
        
        process.exit(1);
    } finally {
        // Close connection
        await mongoose.connection.close();
        log('🔌 Connection closed', 'blue');
    }
}

// Run the test
testAtlasConnection();