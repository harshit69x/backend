const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using environment variables
try {
  // Check if Firebase is already initialized
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
  console.log('Firebase Admin SDK initialized with environment variables');
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  console.error('Make sure all FIREBASE_* environment variables are set');
}

const auth = admin.auth();
const db = admin.firestore();

/**
 * Create a Firebase user and send verification email
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{uid: string, email: string}>} Firebase user object
 */
const createFirebaseUser = async (email, password) => {
  try {
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: false
    });

    console.log('Firebase user created:', userRecord.uid);

    // Send verification email
    const verificationLink = await auth.generateEmailVerificationLink(email);
    console.log('Verification link generated for:', email);

    // In production, you would send this link via email
    // For now, we return it so the frontend can show it or use it
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      verificationLink: verificationLink
    };
  } catch (error) {
    console.error('Error creating Firebase user:', error.message);
    throw error;
  }
};

/**
 * Check if a Firebase user's email is verified
 * @param {string} uid - Firebase user UID
 * @returns {Promise<boolean>} True if email is verified
 */
const isEmailVerified = async (uid) => {
  try {
    const userRecord = await auth.getUser(uid);
    return userRecord.emailVerified;
  } catch (error) {
    console.error('Error checking email verification:', error.message);
    throw error;
  }
};

/**
 * Get Firebase user by email
 * @param {string} email - User email
 * @returns {Promise<UserRecord>} Firebase user record
 */
const getFirebaseUserByEmail = async (email) => {
  try {
    const userRecord = await auth.getUserByEmail(email);
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    console.error('Error getting Firebase user:', error.message);
    throw error;
  }
};

/**
 * Delete a Firebase user
 * @param {string} uid - Firebase user UID
 * @returns {Promise<void>}
 */
const deleteFirebaseUser = async (uid) => {
  try {
    await auth.deleteUser(uid);
    console.log('Firebase user deleted:', uid);
  } catch (error) {
    console.error('Error deleting Firebase user:', error.message);
    throw error;
  }
};

/**
 * Send verification email using Firebase email template
 * @param {string} email - User email
 * @returns {Promise<string>} Verification link
 */
const sendVerificationEmail = async (email) => {
  try {
    const verificationLink = await auth.generateEmailVerificationLink(email);
    
    // Here you can integrate with your email service (nodemailer, SendGrid, etc.)
    // For now, just return the link
    console.log(`Verification link for ${email}: ${verificationLink}`);
    
    return verificationLink;
  } catch (error) {
    console.error('Error sending verification email:', error.message);
    throw error;
  }
};

/**
 * Verify a user's email using a verification link
 * This validates a verification link without actually changing anything in Firebase
 * (Firebase handles that automatically when user clicks the link in email)
 * @param {string} oobCode - Out of band code from verification link
 * @returns {Promise<string>} User email if successful
 */
const verifyEmailWithCode = async (oobCode) => {
  try {
    const email = await auth.verifyIdToken(oobCode);
    return email;
  } catch (error) {
    console.error('Error verifying email:', error.message);
    throw error;
  }
};

module.exports = {
  auth,
  db,
  createFirebaseUser,
  isEmailVerified,
  getFirebaseUserByEmail,
  deleteFirebaseUser,
  sendVerificationEmail,
  verifyEmailWithCode
};
