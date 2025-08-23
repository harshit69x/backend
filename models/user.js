const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    preferences: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      currency: { type: String, default: "INR" },
      language: { type: String, default: "en" }
    },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
