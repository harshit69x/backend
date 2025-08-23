
const mongoose = require('mongoose');
const MONGODB_URI =  'mongodb+srv://mohantyharshit303:Harshit009@expensetracker.xox4gee.mongodb.net/?retryWrites=true&w=majority&appName=expensetracker';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message || err);
    process.exit(1);
  });

  // Create wallets
const User = require("./models/user");
const Wallet = require("./models/wallet");

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, passwordHash, preferences, wallets } = req.body;

    if (!name || !email || !passwordHash) {
      return res.status(400).json({ error: 'name, email and passwordHash are required' });
    }

    // Step 1: Create the user (empty wallets for now)
    const user = new User({
      name,
      email,
      passwordHash,
      preferences: preferences || {}
    });
    await user.save();

    // Step 2: If wallets were sent, create them linked to this user
    if (wallets && wallets.length > 0) {
      const createdWallets = [];

      for (const w of wallets) {
        const wallet = new Wallet({
          name: w.name,
          ownerId: user._id,   // link wallet to the user
          members: w.members || []
        });
        await wallet.save();
        createdWallets.push(wallet._id);
      }

      // Update user with wallet references
      user.wallets = createdWallets;
      await user.save();
    }

    // Step 3: Return user without passwordHash
    const safe = user.toObject();
    delete safe.passwordHash;
    res.status(201).json(safe);

  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(400).json({ error: 'Failed to create user' });
  }
});
