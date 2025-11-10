/**
 * Production Test Script
 * Tests the authentication flow on Render deployment
 */

require('dotenv').config();
const axios = require('axios');
const admin = require('firebase-admin');

const API_BASE_URL = 'https://backend-32fd.onrender.com';

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    const firebaseConfig = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig)
    });
  }
  console.log('✅ Firebase Admin SDK initialized\n');
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  process.exit(1);
}

const auth = admin.auth();

// Test data - using unique email with timestamp
const timestamp = Date.now();
const testUser = {
  name: 'Production Test User',
  email: `xeboxyly@forexzig.com`,
  password: 'TestPassword123'
};

console.log('🚀 Production Deployment Test\n');
console.log('API URL:', API_BASE_URL);
console.log('Test Email:', testUser.email);
console.log('========================================\n');

/**
 * Step 1: Test Signup on Production
 */
async function testSignup() {
  console.log('📝 Step 1: Testing Signup on Production...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/signup`, {
      name: testUser.name,
      email: testUser.email,
      password: testUser.password
    }, {
      timeout: 30000
    });

    console.log('✅ Signup successful!');
    console.log('Status:', response.status);
    console.log('Firebase UID:', response.data.firebaseUid);
    console.log('Email:', response.data.user.email);
    console.log('\n📧 Verification email sent to:', testUser.email);
    console.log('\n========================================\n');

    return response.data;
  } catch (error) {
    console.log('❌ Signup failed!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Connection refused - Is the server running on Render?');
    } else if (error.code === 'ENOTFOUND') {
      console.log('❌ Domain not found - Check the URL');
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Step 2: Verify Email in Firebase
 */
async function verifyEmailInFirebase() {
  console.log('✉️  Step 2: Checking Firebase verification status...\n');
  console.log('⏰ Waiting for email verification...');
  console.log('Please click the verification link in your email: ', testUser.email);
  console.log('\nWaiting 5 seconds before checking...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const userRecord = await auth.getUserByEmail(testUser.email);
    console.log('Firebase user status:');
    console.log('Firebase UID:', userRecord.uid);
    console.log('Email Verified:', userRecord.emailVerified);
    
    if (!userRecord.emailVerified) {
      console.log('\n❌ Email not verified yet in Firebase');
      console.log('Please click the verification link in your email and try again.\n');
      process.exit(1);
    }
    
    console.log('\n✅ Email verified in Firebase!');
    console.log('\n========================================\n');
    return userRecord;
  } catch (error) {
    console.log('❌ Error checking Firebase user:', error.message);
    process.exit(1);
  }
}

/**
 * Step 3: Sync Verification to MongoDB on Production
 */
async function syncVerificationToProduction(firebaseUid, userEmail) {
  console.log('🔄 Step 3: Syncing verification to Production MongoDB...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/verify-email`, {
      firebaseUid: firebaseUid,
      email: userEmail
    }, {
      timeout: 30000
    });

    console.log('✅ Verification synced to Production!');
    console.log('Status:', response.status);
    console.log('Message:', response.data.message);
    console.log('\n========================================\n');

    return response.data;
  } catch (error) {
    console.log('❌ Verification sync failed!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Step 4: Test Login on Production
 */
async function testLoginOnProduction() {
  console.log('🔐 Step 4: Testing Login on Production...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/login`, {
      email: testUser.email,
      password: testUser.password
    }, {
      timeout: 30000
    });

    console.log('✅ Login successful on Production!');
    console.log('Status:', response.status);
    console.log('Message:', response.data.message);
    console.log('User Email:', response.data.user.email);
    console.log('\n📝 JWT Token received:');
    console.log(response.data.token.substring(0, 50) + '...');
    console.log('\n========================================');
    console.log('✅ All Production Tests Passed!\n');

    return response.data.token;
  } catch (error) {
    console.log('❌ Login failed on Production!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Main test execution
 */
async function runProductionTests() {
  try {
    console.log('🧪 Starting Production Authentication Flow Tests\n');
    
    // Step 1: Signup
    const signupData = await testSignup();

    // Step 2: Verify Email
    const firebaseUser = await verifyEmailInFirebase();

    // Step 3: Sync Verification
    await syncVerificationToProduction(firebaseUser.uid, firebaseUser.email);

    // Step 4: Login
    await testLoginOnProduction();

    console.log('🎉 Production Deployment is Working Perfectly!\n');
  } catch (error) {
    console.log('\n❌ Production test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runProductionTests();
