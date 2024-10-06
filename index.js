// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

// Import the User model
const User = require('./models/User');

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: 'https://github.com/Knckd'
}));
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Endpoint to verify Telegram membership and register the user
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  try {
    // Get the user's Telegram ID
    const userInfo = await bot.getChat(`@${telegramUsername}`);
    const telegramId = userInfo.id;

    // Check if the user is already registered
    let user = await User.findOne({ telegramId });

    if (user) {
      // User is already registered
      return res.json({ success: true, referralCode: user.referralCode });
    }

    // Check if the user is a member of the channel
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, telegramId);

    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      // User is a member, register them
      const referralCode = generateReferralCode();

      user = new User({ telegramId, referralCode });
      await user.save();

      return res.json({ success: true, referralCode });
    } else {
      // User is not a member
      return res.json({ success: false, message: 'Please join the Telegram channel first.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'An error occurred during verification.' });
  }
});

// Endpoint to increment referral count
app.post('/api/referral', async (req, res) => {
  const { referralCode } = req.body;

  try {
    const user = await User.findOne({ referralCode });

    if (user) {
      user.referrals += 1;
      await user.save();
      return res.json({ success: true });
    } else {
      return res.json({ success: false, message: 'Invalid referral code.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'An error occurred while processing the referral.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));