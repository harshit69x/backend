const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register new user
const register = async (req, res) => {
  try {
    const { name, email, password, preferences } = req.body;
    
    if (!name || !email || !passwordHash) {
      return res.status(400).json({ error: 'Name, email and passwordHash are required' });
    }

    if (passwordHash.length < 6) {
      return res.status(400).json({ error: 'PasswordHapasswordHash must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(passwordHash, saltRounds);

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      preferences: preferences || {},
      wallets: []
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user without password
    const userResponse = {
      message: 'User created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    };

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user' });
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
  authenticateToken,
  optionalAuth
};
