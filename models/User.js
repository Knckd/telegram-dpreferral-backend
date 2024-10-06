const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  telegramUsername: { type: String, unique: true },
  referralCode: { type: String, unique: true },
  referrals: { type: Number, default: 0 },
});

module.exports = mongoose.model('User', userSchema);
