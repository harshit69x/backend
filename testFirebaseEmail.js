/**
 * Test Script for Email Verification and Login Flow
 * Tests verify-email and login endpoints for a verified email
 */

require('dotenv').config();
const axios = require('axios');
const admin = require('firebase-admin');

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Initialize Firebase Admin SDK to get user info
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

// Test data - use the email you just verified
const testUser = {
  email: 'zatelogy@denipl.net',
  password: 'TestPassword123'
};

console.log('🔐 Testing Email Verification and Login Flow\n');
console.log('API URL:', API_BASE_URL);
console.log('Test Email:', testUser.email);
console.log('----------------------------------------\n');

/**
 * Step 1: Get Firebase UID and verify email status
 */
async function getFirebaseUserAndVerify() {
  console.log('📋 Step 1: Getting Firebase user info...\n');
  try {
    const userRecord = await auth.getUserByEmail(testUser.email);
    console.log('✅ Firebase user found!');
    console.log('Firebase UID:', userRecord.uid);
    console.log('Email Verified in Firebase:', userRecord.emailVerified);
    console.log('\n----------------------------------------\n');
    return userRecord;
  } catch (error) {
    console.log('❌ Firebase user not found!');
    console.log('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Step 2: Call verify-email endpoint to sync verification status to MongoDB
 */
async function testVerifyEmail(firebaseUid, userEmail) {
  console.log('✉️  Step 2: Calling /api/verify-email endpoint...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/verify-email`, {
      firebaseUid: firebaseUid,
      email: userEmail
    });

    console.log('✅ Email verification synced to MongoDB!');
    console.log('Status:', response.status);
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n----------------------------------------\n');

    return response.data;
  } catch (error) {
    console.log('❌ Verify email endpoint failed!');
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
 * Step 3: Test Login endpoint
 */
async function testLogin() {
  console.log('🔐 Step 3: Testing /api/login endpoint...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/login`, {
      email: testUser.email,
      password: testUser.password
    });

    console.log('✅ Login successful!');
    console.log('Status:', response.status);
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n----------------------------------------');
    console.log('✅ JWT Token received! You can now use this token for authenticated requests.\n');

    return response.data.token;
  } catch (error) {
    console.log('❌ Login failed!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
      console.log('\n💡 Possible reasons:');
      console.log('- Email not verified in Firebase');
      console.log('- User not found in MongoDB');
      console.log('- Incorrect password');
      console.log('- Email not in the system\n');
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Main test execution
 */
async function runTests() {
  try {
    // Step 1: Get Firebase user
    const firebaseUser = await getFirebaseUserAndVerify();

    // Step 2: Call verify-email to sync to MongoDB
    await testVerifyEmail(firebaseUser.uid, firebaseUser.email);

    // Step 3: Login
    await testLogin();

    console.log('✅ All tests completed successfully!\n');
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
