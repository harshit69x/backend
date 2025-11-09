/**
 * Debug script to check user status in MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const MONGODB_URI = process.env.MONGODB_URI;

async function checkUserStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'zatelogy@denipl.net';
    const user = await User.findOne({ email: email });

    if (!user) {
      console.log('❌ User not found in MongoDB');
      process.exit(1);
    }

    console.log('📋 User Information:');
    console.log('Email:', user.email);
    console.log('Name:', user.name);
    console.log('Firebase UID:', user.firebaseUid);
    console.log('Email Verified:', user.emailVerified);
    console.log('\n✅ User found in MongoDB with emailVerified =', user.emailVerified);

    // Manually update if needed
    if (!user.emailVerified) {
      console.log('\n🔄 Updating user to set emailVerified = true...');
      user.emailVerified = true;
      await user.save();
      console.log('✅ User updated successfully!');
      console.log('Email Verified is now:', user.emailVerified);
    }

    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUserStatus();
