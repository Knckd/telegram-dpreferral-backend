// index.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const User = require('./models/User');

const app = express();

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log('Telegram bot initialized with polling enabled.');

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

  if (!telegramUsername) {
    bot.sendMessage(chatId, 'Please set a username in Telegram to use this feature.');
    return;
  }

  try {
    // Check if the user is already registered
    let user = await User.findOne({ telegramId });

    if (user) {
      bot.sendMessage(chatId, 'You have already been verified. You can proceed to the website.');
    } else {
      // Register the user
      const referralCode = generateReferralCode();

      user = new User({ telegramId, telegramUsername, referralCode, referrals: 0 });
      await user.save();

      bot.sendMessage(chatId, 'Verification successful! You can now proceed to the website.');
    }
  } catch (error) {
    console.error('Verification Error:', error);
    bot.sendMessage(chatId, 'An error occurred during verification. Please try again later.');
  }
});

// Helper function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// API Endpoint to handle verification from the frontend
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  if (!telegramUsername) {
    return res.status(400).json({ success: false, message: 'Telegram username is required.' });
  }

  try {
    const normalizedUsername = telegramUsername.toLowerCase();
    const user = await User.findOne({ telegramUsername: normalizedUsername });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please verify via the Telegram bot first.' });
    }

    // Generate referral link
    const referralLink = `${process.env.FRONTEND_URL}?referralCode=${user.referralCode}`;

    res.json({ success: true, referralLink });
  } catch (error) {
    console.error('Error in /api/verify:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// API Endpoint to get the leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topReferrers = await User.find().sort({ referrals: -1 }).limit(10);
    res.json({ success: true, data: topReferrers });
  } catch (error) {
    console.error('Error in /api/leaderboard:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
