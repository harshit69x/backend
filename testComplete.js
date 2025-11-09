/**
 * Complete Test Script for Signup, Email Verification, and Login Flow
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

// Test data - use a new email for testing
const testUser = {
  name: 'Test User',
  email: 'gozulo@fxzig.com',
  password: 'TestPassword123'
};

console.log('🧪 Complete Authentication Flow Test\n');
console.log('API URL:', API_BASE_URL);
console.log('Test Email:', testUser.email);
console.log('----------------------------------------\n');

/**
 * Step 1: Signup
 */
async function testSignup() {
  console.log('📝 Step 1: Signing up...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/signup`, {
      name: testUser.name,
      email: testUser.email,
      password: testUser.password
    });

    console.log('✅ Signup successful!');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n📧 Verification email has been sent to:', testUser.email);
    console.log('\n----------------------------------------\n');

    return response.data;
  } catch (error) {
    console.log('❌ Signup failed!');
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
 * Step 2: Verify email in Firebase
 */
async function verifyEmailInFirebase() {
  console.log('✉️  Step 2: Verifying email in Firebase...\n');
  console.log('⏰ This requires you to:');
  console.log('1. Check your email at:', testUser.email);
  console.log('2. Click the verification link from Gmail');
  console.log('3. Once done, press Enter to continue...\n');

  // Wait for user to verify email manually
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Check if email is verified in Firebase
  try {
    const userRecord = await auth.getUserByEmail(testUser.email);
    console.log('Firebase user status:');
    console.log('Firebase UID:', userRecord.uid);
    console.log('Email Verified in Firebase:', userRecord.emailVerified);
    
    if (!userRecord.emailVerified) {
      console.log('\n❌ Email not verified yet in Firebase');
      console.log('Please click the verification link in your email and try again.\n');
      process.exit(1);
    }
    
    console.log('\n✅ Email verified in Firebase!');
    console.log('\n----------------------------------------\n');
    return userRecord;
  } catch (error) {
    console.log('❌ Error checking Firebase user:', error.message);
    process.exit(1);
  }
}

/**
 * Step 3: Call verify-email endpoint to sync to MongoDB
 */
async function testVerifyEmail(firebaseUid, userEmail) {
  console.log('🔄 Step 3: Syncing verification to MongoDB...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/verify-email`, {
      firebaseUid: firebaseUid,
      email: userEmail
    });

    console.log('✅ Email verification synced to MongoDB!');
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
 * Step 4: Test Login endpoint
 */
async function testLogin() {
  console.log('🔐 Step 4: Testing login...\n');
  try {
    const response = await axios.post(`${API_BASE_URL}/api/login`, {
      email: testUser.email,
      password: testUser.password
    });

    console.log('✅ Login successful!');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n----------------------------------------');
    console.log('✅ JWT Token received! Authentication flow complete!\n');

    return response.data.token;
  } catch (error) {
    console.log('❌ Login failed!');
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
async function runTests() {
  try {
    // Step 1: Signup
    const signupData = await testSignup();

    // Step 2: Verify email in Firebase (manual step)
    const firebaseUser = await verifyEmailInFirebase();

    // Step 3: Call verify-email endpoint
    await testVerifyEmail(firebaseUser.uid, firebaseUser.email);

    // Step 4: Login
    await testLogin();

    console.log('✅ All tests completed successfully!\n');
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
