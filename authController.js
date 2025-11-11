const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');
const PendingUser = require('./models/pendingUser');
// Import the initialized Firebase Admin SDK from firebaseService
const firebaseService = require('./services/firebaseService');
const admin = require('firebase-admin');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register new user - ONLY create Firebase user, DON'T send email (Client SDK handles it)
const register = async (req, res) => {
  try {
    const { name, email, password, preferences } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists in User collection (verified users)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Check if pending user exists and delete old one
    const existingPendingUser = await PendingUser.findOne({ email: email.toLowerCase() });
    if (existingPendingUser) {
      await PendingUser.deleteOne({ email: email.toLowerCase() });
      console.log('Deleted old pending user for:', email);
    }

    // Create Firebase user with Admin SDK (NO EMAIL SENDING - Client SDK will handle it)
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email: email.toLowerCase(),
        password: password,
        displayName: name,
        emailVerified: false // Not verified yet
      });
      
      console.log('✅ Firebase user created (NO EMAIL SENT):', firebaseUser.uid);
    } catch (firebaseError) {
      console.error('❌ Firebase creation error:', firebaseError);
      
      if (firebaseError.code === 'auth/email-already-exists') {
        // Get existing Firebase user
        try {
          const existingFirebaseUser = await admin.auth().getUserByEmail(email.toLowerCase());
          console.log('Firebase user already exists, using existing UID:', existingFirebaseUser.uid);
          firebaseUser = existingFirebaseUser;
        } catch (getError) {
          return res.status(500).json({ 
            error: 'Email already registered in Firebase',
            details: getError.message 
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'Failed to create Firebase account',
          details: firebaseError.message 
        });
      }
    }

    // Hash password for MongoDB
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Save to PendingUser collection (will be migrated to User after email verification)
    const pendingUser = new PendingUser({
      name,
      email: email.toLowerCase(),
      password: hashedPassword, // PendingUser uses 'password' field
      preferences: preferences || { theme: 'dark', currency: 'INR', language: 'en' },
      firebaseUid: firebaseUser.uid
    });

    await pendingUser.save();
    console.log('✅ User saved to PendingUser collection (pending verification):', email);

    // Return success WITHOUT sending email
    // The React Native app will handle email sending via Client SDK
    res.status(201).json({
      success: true,
      message: 'Firebase user created. Client app should now send verification email.',
      firebaseUid: firebaseUser.uid,
      user: {
        _id: pendingUser._id,
        name: pendingUser.name,
        email: pendingUser.email
      }
    });

  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      details: error.message 
    });
  }
};

// Login user - check Firebase email verification and migrate from PendingUser if verified
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // First check if user exists in User collection (verified users)
    let user = await User.findOne({ email: email.toLowerCase() });
    
    if (user) {
      // User exists in User collection - verify password
      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check Firebase verification status
      try {
        const firebaseUser = await admin.auth().getUser(user.firebaseUid);
        
        if (!firebaseUser.emailVerified) {
          return res.status(403).json({ 
            error: 'Email not verified. Please check your email and verify your account.',
            emailVerified: false
          });
        }

        // Update MongoDB if out of sync
        if (!user.emailVerified) {
          user.emailVerified = true;
          await user.save();
        }
      } catch (firebaseError) {
        console.error('Firebase verification check error:', firebaseError);
        return res.status(500).json({ 
          error: 'Failed to verify email status',
          details: firebaseError.message 
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          wallets: user.wallets,
          preferences: user.preferences,
          emailVerified: true
        }
      });
    }

    // User not in User collection - check PendingUser
    const pendingUser = await PendingUser.findOne({ email: email.toLowerCase() });
    
    if (!pendingUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password for pending user
    const passwordMatch = await bcrypt.compare(password, pendingUser.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check Firebase verification status
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUser(pendingUser.firebaseUid);
    } catch (firebaseError) {
      console.error('Firebase user fetch error:', firebaseError);
      return res.status(500).json({ 
        error: 'Failed to check verification status',
        details: firebaseError.message 
      });
    }

    if (!firebaseUser.emailVerified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email and verify your account.',
        emailVerified: false,
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Email is verified! Migrate from PendingUser to User collection
    console.log('🔄 Migrating user from PendingUser to User:', email);
    
    const newUser = new User({
      name: pendingUser.name,
      email: pendingUser.email,
      passwordHash: pendingUser.password, // PendingUser uses 'password', User uses 'passwordHash'
      preferences: pendingUser.preferences,
      wallets: [],
      firebaseUid: pendingUser.firebaseUid,
      emailVerified: true
    });

    await newUser.save();
    await PendingUser.deleteOne({ _id: pendingUser._id });
    
    console.log('✅ User migrated successfully from PendingUser to User');

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        wallets: newUser.wallets,
        preferences: newUser.preferences,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      details: error.message 
    });
  }
};

// Verify email endpoint - called after user verifies email to sync MongoDB
const verifyEmail = async (req, res) => {
  try {
    const { firebaseUid, email } = req.body;

    if (!firebaseUid && !email) {
      return res.status(400).json({ error: 'Firebase UID or email required' });
    }

    // Get Firebase user
    let firebaseUser;
    try {
      if (firebaseUid) {
        firebaseUser = await admin.auth().getUser(firebaseUid);
      } else {
        firebaseUser = await admin.auth().getUserByEmail(email.toLowerCase());
      }
    } catch (error) {
      return res.status(404).json({ error: 'User not found in Firebase' });
    }

    // Check if email is verified in Firebase
    if (!firebaseUser.emailVerified) {
      return res.status(400).json({ 
        error: 'Email not verified in Firebase yet. Please click the verification link in your email.',
        emailVerified: false
      });
    }

    // Check if user already in User collection
    let user = await User.findOne({ firebaseUid: firebaseUser.uid });
    
    if (user) {
      // User already migrated, just update verification status
      user.emailVerified = true;
      await user.save();
      console.log('✅ Email verified and synced to MongoDB:', user.email);
      
      return res.json({ 
        success: true, 
        message: 'Email verified successfully',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          emailVerified: true
        }
      });
    }

    // User not in User collection - check PendingUser and migrate
    const pendingUser = await PendingUser.findOne({ firebaseUid: firebaseUser.uid });

    if (!pendingUser) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Migrate from PendingUser to User
    console.log('🔄 Migrating user from PendingUser to User:', pendingUser.email);
    
    const newUser = new User({
      name: pendingUser.name,
      email: pendingUser.email,
      passwordHash: pendingUser.password, // PendingUser uses 'password', User uses 'passwordHash'
      preferences: pendingUser.preferences,
      wallets: [],
      firebaseUid: pendingUser.firebaseUid,
      emailVerified: true
    });

    await newUser.save();
    await PendingUser.deleteOne({ _id: pendingUser._id });
    
    console.log('✅ User migrated successfully from PendingUser to User');

    res.json({ 
      success: true, 
      message: 'Email verified and user activated successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('❌ Verify email error:', error);
    res.status(500).json({ 
      error: 'Failed to verify email',
      details: error.message 
    });
  }
};

// Legacy login support (for query params - used by mobile app)
const loginWithQuery = async (req, res) => {
  try {
    const { email, password } = req.query;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user without password (maintain compatibility with existing app)
    const userResponse = {
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Login with query error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Optional middleware (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (!err) {
        req.user = decoded;
      }
    });
  }
  next();
};

module.exports = {
  register,
  login,
  loginWithQuery,
  verifyEmail,
  authenticateToken,
  optionalAuth
};
