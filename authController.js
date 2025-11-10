const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');
const { createFirebaseUser, verifyEmailWithCode, getFirebaseUserByEmail } = require('./services/firebaseService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register new user with Firebase
const register = async (req, res) => {
  try {
    const { name, email, password, preferences } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Create Firebase user
    let firebaseUser;
    try {
      firebaseUser = await createFirebaseUser(email.toLowerCase(), password);
      console.log('Firebase user created:', firebaseUser.uid);
    } catch (firebaseError) {
      console.error('Firebase creation error:', firebaseError.message);
      
      if (firebaseError.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: 'Email already registered. Please try logging in.' });
      }
      
      return res.status(400).json({ error: 'Failed to create user account: ' + firebaseError.message });
    }

    // Hash password for MongoDB storage
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user in MongoDB but mark as NOT verified yet
    const user = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      preferences: preferences || {},
      wallets: [],
      firebaseUid: firebaseUser.uid,
      emailVerified: false  // Not verified yet
    });

    await user.save();
    console.log('User saved to MongoDB (pending email verification):', email);

    // Return response with verification link
    const userResponse = {
      message: 'User registered successfully! Check your email for the verification link.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      },
      firebaseUid: firebaseUser.uid,
      verificationLink: firebaseUser.verificationLink,
      nextStep: 'Please verify your email by clicking the link in your email to login',
      note: 'You cannot login until your email is verified'
    };

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
};

// Login user (requires email to be verified)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please verify your email first.',
        message: 'Check your email for the verification link and click it to verify'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user without password
    const userResponse = {
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      },
      token: token
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Verify email using oobCode from Firebase verification link OR firebaseUid + email for testing
const verifyEmail = async (req, res) => {
  try {
    const { oobCode, firebaseUid, email } = req.body;

    // Handle both new format (oobCode) and old format (firebaseUid + email) for testing
    if (oobCode) {
      // New Firebase Client SDK flow
      const verificationResult = await verifyEmailWithCode(oobCode);
      console.log('Email verification successful for:', verificationResult.email);

      // Find user in MongoDB by email
      const user = await User.findOne({ email: verificationResult.email.toLowerCase() });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please sign up first before verifying your email'
        });
      }

      // Update user as verified in MongoDB
      user.emailVerified = true;
      await user.save();
      console.log('User email verified in MongoDB:', verificationResult.email);

      // Generate JWT token for immediate login after verification
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const userResponse = {
        message: 'Email verified successfully! Welcome to ZEEN.',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          emailVerified: true
        },
        token: token,
        nextStep: 'You can now login to your account'
      };

      res.json(userResponse);
    } else if (firebaseUid && email) {
      // Old format for testing/backward compatibility
      console.log('Using old verification format for testing');

      // Find user in MongoDB by email (primary lookup)
      let user = await User.findOne({ email: email.toLowerCase() });

      // If not found by email, try by firebaseUid
      if (!user) {
        user = await User.findOne({ firebaseUid: firebaseUid });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found. Please sign up first.' });
      }

      // Check if Firebase confirms email is verified
      const firebaseUser = await getFirebaseUserByEmail(email.toLowerCase());

      if (!firebaseUser || !firebaseUser.emailVerified) {
        return res.status(400).json({
          error: 'Email not verified in Firebase yet',
          message: 'Please verify your email first'
        });
      }

      // Mark user as verified in MongoDB
      user.emailVerified = true;
      await user.save();
      console.log('User email verified:', email);

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const userResponse = {
        message: 'Email verified successfully! You can now login.',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email
        },
        token: token
      };

      res.json(userResponse);
    } else {
      return res.status(400).json({ error: 'Either oobCode OR firebaseUid + email are required' });
    }
  } catch (error) {
    console.error('Email verification error:', error);

    // Handle specific Firebase errors
    if (error.code === 'auth/expired-action-code') {
      return res.status(400).json({
        error: 'Verification link expired',
        message: 'Please request a new verification email'
      });
    }

    if (error.code === 'auth/invalid-action-code') {
      return res.status(400).json({
        error: 'Invalid verification link',
        message: 'Please check your email for the correct verification link'
      });
    }

    if (error.code === 'auth/user-disabled') {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact support.'
      });
    }

    res.status(500).json({ error: 'Failed to verify email: ' + error.message });
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
