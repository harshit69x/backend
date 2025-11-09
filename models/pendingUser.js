const mongoose = require('mongoose');

const PendingUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // Hashed password, stored temporarily
  firebaseUid: { type: String, required: true }, // Firebase UID for reference
  preferences: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
});

module.exports = mongoose.model('PendingUser', PendingUserSchema);
