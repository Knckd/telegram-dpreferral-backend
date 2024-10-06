const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  username: { type: String, unique: true },
  password: { type: String },
  referrals: { type: Number, default: 0 },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  signupIPs: [{ type: String }],
});

module.exports = mongoose.model('User', userSchema);
