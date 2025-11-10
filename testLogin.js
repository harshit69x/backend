/**
 * Test Script for Verified Email Login
 * Use this after you've verified your email via the link
 */

require('dotenv').config();
const axios = require('axios');
const admin = require('firebase-admin');

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

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

// Test data - email that was already signed up
const testUser = {
  email: 'xulicyxu@forexzig.com',
  password: 'TestPassword123'
};

console.log('🔐 Testing Login for Verified Email\n');
console.log('API URL:', API_BASE_URL);
console.log('Test Email:', testUser.email);
console.log('----------------------------------------\n');

/**
 * Step 1: Check Firebase verification status
 */
async function checkFirebaseVerification() {
  console.log('📋 Step 1: Checking Firebase verification status...\n');
  try {
    const userRecord = await auth.getUserByEmail(testUser.email);
    console.log('✅ Firebase user found!');
    console.log('Firebase UID:', userRecord.uid);
    console.log('Email Verified in Firebase:', userRecord.emailVerified);
    
    if (!userRecord.emailVerified) {
      console.log('\n❌ Email is NOT verified in Firebase yet');
      console.log('Please click the verification link in your email first!');
      console.log('\nTo verify:');
      console.log('1. Check your email at:', testUser.email);
      console.log('2. Look for the verification email from noreply@accounts.google.com');
      console.log('3. Click the "Verify email" button or link');
      console.log('4. Once done, run this test again\n');
      process.exit(1);
    }
    
    console.log('\n✅ Email is verified in Firebase!');
    console.log('\n----------------------------------------\n');
    return userRecord;
  } catch (error) {
    console.log('❌ Firebase user not found!');
    console.log('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Step 2: Sync verification to MongoDB
 */
async function syncVerificationToMongoDB(firebaseUid, userEmail) {
  console.log('🔄 Step 2: Syncing verification to MongoDB...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/verify-email`, {
      firebaseUid: firebaseUid,
      email: userEmail
    });

    console.log('✅ Verification synced to MongoDB!');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n----------------------------------------\n');

    return response.data;
  } catch (error) {
    console.log('❌ Failed to sync verification!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 404) {
        console.log('\n💡 User not found in MongoDB. Make sure you signed up first.');
      }
    } else {
      console.log('Error:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Step 3: Login
 */
async function testLogin() {
  console.log('🔐 Step 3: Testing login...\n');
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
    console.log('✅ Authentication flow complete!\n');
    console.log('Your JWT Token:');
    console.log(response.data.token);
    console.log('\nYou can now use this token for authenticated API requests!\n');

    return response.data.token;
  } catch (error) {
    console.log('❌ Login failed!');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error || JSON.stringify(error.response.data, null, 2));
      console.log('\n💡 Possible reasons:');
      console.log('- Email not verified in Firebase');
      console.log('- Email not synced to MongoDB');
      console.log('- Incorrect password\n');
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
    // Step 1: Check Firebase verification
    const firebaseUser = await checkFirebaseVerification();

    // Step 2: Sync to MongoDB
    await syncVerificationToMongoDB(firebaseUser.uid, firebaseUser.email);

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
