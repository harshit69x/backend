/**
 * Check Email Verification Status
 * Run this after clicking the verification link in your email
 */

require('dotenv').config();
const admin = require('firebase-admin');

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

// Email to check
const testEmail = 'harshit69x@gmail.com'; // Replace with your email

async function checkVerificationStatus() {
  try {
    console.log('🔍 Checking email verification status for:', testEmail);
    console.log('');

    const userRecord = await auth.getUserByEmail(testEmail);

    console.log('📊 Firebase User Status:');
    console.log('UID:', userRecord.uid);
    console.log('Email:', userRecord.email);
    console.log('Email Verified:', userRecord.emailVerified ? '✅ YES' : '❌ NO');
    console.log('Account Created:', userRecord.metadata.creationTime);
    console.log('Last Sign In:', userRecord.metadata.lastSignInTime || 'Never');

    if (userRecord.emailVerified) {
      console.log('');
      console.log('🎉 SUCCESS! Email is verified in Firebase!');
      console.log('✅ Your Firebase SMTP configuration is working!');
      console.log('✅ Users will receive verification emails!');
    } else {
      console.log('');
      console.log('⏳ Email not verified yet.');
      console.log('💡 Make sure you clicked the verification link in the email.');
      console.log('🔄 Try running this script again in a few seconds.');
    }

  } catch (error) {
    console.error('❌ Error checking verification status:', error.message);
  }
}

checkVerificationStatus();