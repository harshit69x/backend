/**
 * Test Real Email Sending with Firebase SMTP
 * This will actually send verification emails to test addresses
 */

require('dotenv').config();
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

// Test email - use a real email you can check
const testEmail = 'folojifa@forexzig.com'; // Replace with your real email

console.log('📧 Firebase SMTP Email Test');
console.log('===========================');
console.log('Test Email:', testEmail);
console.log('API URL:', API_BASE_URL);
console.log('');

/**
 * Test 1: Create Firebase User and Send Verification Email
 */
async function testFirebaseEmailSending() {
  console.log('🧪 Test 1: Creating Firebase user and sending verification email...\n');

  try {
    // First, try to delete existing user if it exists
    console.log('🧹 Cleaning up existing user...');
    try {
      const existingUser = await auth.getUserByEmail(testEmail);
      await auth.deleteUser(existingUser.uid);
      console.log('✅ Deleted existing user');
    } catch (deleteError) {
      // User doesn't exist, that's fine
      console.log('ℹ️  No existing user to delete');
    }

    // Create a Firebase user
    console.log('👤 Creating Firebase user...');
    const userRecord = await auth.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      emailVerified: false
    });

    console.log('✅ Firebase user created!');
    console.log('UID:', userRecord.uid);
    console.log('');

    // Now generate verification link (Firebase will auto-send email via SMTP)
    console.log('📧 Generating verification link (Firebase will send email)...');
    const verificationLink = await auth.generateEmailVerificationLink(testEmail);

    console.log('✅ Verification link generated successfully!');
    console.log('🔗 Link:', verificationLink);
    console.log('');
    console.log('📧 Firebase should have sent an email to:', testEmail);
    console.log('📬 CHECK YOUR INBOX NOW!');
    console.log('');
    console.log('💡 If you don\'t see the email:');
    console.log('   - Check spam/junk folder');
    console.log('   - Wait 2-3 minutes');
    console.log('   - Verify SMTP settings in Firebase Console');
    console.log('   - Check SendGrid/Mailgun dashboard for delivery status');
    console.log('');

    return { userRecord, verificationLink };
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('');
    console.log('🔧 Possible issues:');
    console.log('   - SMTP settings not configured correctly');
    console.log('   - SendGrid/Mailgun API key invalid');
    console.log('   - Sender email not verified');
    console.log('   - Check Firebase Console → Authentication → SMTP settings');
    console.log('   - Check SendGrid/Mailgun API key validity');
    process.exit(1);
  }
}

/**
 * Test 2: Simulate clicking the verification link
 */
async function testEmailVerification() {
  console.log('🧪 Test 2: Simulating email verification...\n');
  console.log('⏳ Waiting for you to click the verification link in your email...');
  console.log('Once you click it, Firebase will mark the email as verified.');
  console.log('');
  console.log('After clicking the link, run this command to check:');
  console.log('node checkVerification.js');
  console.log('');
}

/**
 * Main test execution
 */
async function runEmailTests() {
  try {
    console.log('🚀 Starting Firebase SMTP Email Tests\n');

    // Test 1: Generate link and send email
    const link = await testFirebaseEmailSending();

    // Test 2: Instructions for verification
    await testEmailVerification();

    console.log('🎉 Email sending test completed!');
    console.log('');
    console.log('📧 Check your inbox for the verification email from Firebase!');
    console.log('🔄 Next step: Click the link and run verification check.');

  } catch (error) {
    console.log('\n❌ Email test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runEmailTests();