const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');
const PendingUser = require('./models/pendingUser');
const { createFirebaseUser, isEmailVerified, getFirebaseUserByEmail, deleteFirebaseUser } = require('./services/firebaseService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register new user with Firebase email verification
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

    // Check if user is already pending verification
    const existingPendingUser = await PendingUser.findOne({ email: email.toLowerCase() });
    if (existingPendingUser) {
      return res.status(409).json({ error: 'Email already registered. Please verify your email.' });
    }

    // Create Firebase user
    let firebaseUser;
    try {
      firebaseUser = await createFirebaseUser(email.toLowerCase(), password);
      console.log('Firebase user created:', firebaseUser.uid);
    } catch (firebaseError) {
      console.error('Firebase creation error:', firebaseError.message);
      
      if (firebaseError.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: 'Email already registered in Firebase. Please use another email or reset password.' });
      }
      
      return res.status(400).json({ error: 'Failed to create user account: ' + firebaseError.message });
    }

    // Hash password for MongoDB storage (temporary)
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create pending user document (temporary storage)
    const pendingUser = new PendingUser({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      firebaseUid: firebaseUser.uid,
      preferences: preferences || {}
    });

    await pendingUser.save();

    // Return response with verification link
    const userResponse = {
      message: 'User registered successfully. A verification email has been sent to your email address.',
      user: {
        email: email.toLowerCase(),
        name: name,
        firebaseUid: firebaseUser.uid
      },
      verificationLink: firebaseUser.verificationLink, // Send this to frontend for testing
      nextStep: 'Please verify your email to complete registration'
    };

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
};

// Login user
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
      }
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Verify email and move pending user to verified users in MongoDB
const verifyEmail = async (req, res) => {
  try {
    const { firebaseUid, email } = req.body;

    if (!firebaseUid || !email) {
      return res.status(400).json({ error: 'Firebase UID and email are required' });
    }

    // Check if pending user exists
    const pendingUser = await PendingUser.findOne({ 
      firebaseUid: firebaseUid,
      email: email.toLowerCase()
    });

    if (!pendingUser) {
      return res.status(404).json({ error: 'Pending user not found. Please sign up first.' });
    }

    // Check if Firebase email is verified
    const firebaseUser = await getFirebaseUserByEmail(email.toLowerCase());
    if (!firebaseUser || !firebaseUser.emailVerified) {
      return res.status(400).json({ error: 'Email not verified in Firebase. Please click the verification link sent to your email.' });
    }

    // Move from pending to verified users in MongoDB
    const verifiedUser = new User({
      name: pendingUser.name,
      email: pendingUser.email,
      passwordHash: pendingUser.password,
      preferences: pendingUser.preferences,
      wallets: [],
      firebaseUid: firebaseUid
    });

    await verifiedUser.save();
    console.log('User moved to verified:', email);

    // Delete pending user record
    await PendingUser.deleteOne({ _id: pendingUser._id });
    console.log('Pending user record deleted:', email);

    // Generate JWT token
    const token = jwt.sign(
      { userId: verifiedUser._id, email: verifiedUser.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const userResponse = {
      message: 'Email verified successfully! You can now login.',
      user: {
        _id: verifiedUser._id,
        name: verifiedUser.name,
        email: verifiedUser.email
      },
      token: token
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Email verification error:', error);
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
