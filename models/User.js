const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  telegramUsername: { type: String, required: true, unique: true },
  referralCode: { type: String, required: true, unique: true },
  referrals: { type: Number, default: 0 },
  hasClaimed: { type: Boolean, default: false }, // Add this field
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
