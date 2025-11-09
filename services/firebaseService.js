const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

// Setup email transporter for sending verification emails
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 465,
  secure: process.env.SMTP_SECURE !== 'false', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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

    // Generate verification link
    const verificationLink = await auth.generateEmailVerificationLink(email);

    // Send verification email using nodemailer
    try {
      await sendEmailVerificationLinkViaEmail(email, verificationLink);
      console.log('✅ Verification email sent to:', email);
    } catch (emailError) {
      console.warn('⚠️  Email sending warning:', emailError.message);
      console.log('💡 Verification link generated but email not sent. User can verify via link.');
    }

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
 * Send verification email using nodemailer
 * @param {string} email - User email
 * @param {string} verificationLink - Verification link to include in email
 * @returns {Promise<void>}
 */
const sendEmailVerificationLinkViaEmail = async (email, verificationLink) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set');
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your ZEEN Account',
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E5B3F;">Welcome to ZEEN!</h2>
        <p>Thank you for signing up for ZEEN - your personal expense tracker.</p>
        <p>Please click the button below to verify your email address and activate your account:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}"
             style="background-color: #1E5B3F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
          </a>
        </div>

        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationLink}</p>

        <p>This link will expire in 24 hours.</p>

        <p><strong>After verification, please return to the ZEEN app to login.</strong></p>

        <p>If you didn't create an account with ZEEN, please ignore this email.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          ZEEN - Expense Tracker<br>
          © 2025 ZEEN. All rights reserved.
        </p>
      </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', email);
  } catch (error) {
    console.error('Error sending email:', error.message);
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
 * Send verification email using Firebase Email Service
 * Note: Email sending via Firebase requires SMTP configuration in Firebase Console
 * @param {string} email - User email
 * @returns {Promise<string>} Verification link
 */
const sendVerificationEmail = async (email) => {
  try {
    const verificationLink = await auth.generateEmailVerificationLink(email);
    console.log(`Verification link for ${email}: ${verificationLink}`);
    console.log('User must configure Firebase SMTP settings to receive verification emails');
    return verificationLink;
  } catch (error) {
    console.error('Error generating verification link:', error.message);
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
  verifyEmailWithCode,
  sendEmailVerificationLinkViaEmail
};
