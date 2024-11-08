// models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true },
    telegramUsername: { type: String, required: true },
    referralCode: { type: String, required: true, unique: true },
    referrals: { type: Number, default: 0 },
    hasClaimed: { type: Boolean, default: false }, // Track if tokens have been claimed
    referredBy: { type: String }, // New field to track who referred the user
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
