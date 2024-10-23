// index.js

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Define User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  chatId: { type: Number, required: true },
  referralCode: { type: String, required: true, unique: true },
});

const User = mongoose.model('User', userSchema);

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Helper function to generate referral codes
const generateReferralCode = () => {
  return Math.random().toString(36).substr(2, 9);
};

// Handle /verify command
bot.onText(/\/verify/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!username) {
    bot.sendMessage(chatId, 'Please set a username in Telegram to use this feature.');
    return;
  }

  // Ask for referral code
  bot.sendMessage(chatId, 'Please enter your referral code:');

  // Listen for the next message as referral code
  bot.once('message', async (msg) => {
    const referralCode = msg.text.trim();

    if (!referralCode) {
      bot.sendMessage(chatId, 'Referral code cannot be empty. Please try /verify again.');
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      bot.sendMessage(chatId, 'You have already verified.');
      return;
    }

    // Generate a unique referral code for the user
    let newReferralCode;
    let isUnique = false;
    while (!isUnique) {
      newReferralCode = generateReferralCode();
      const existingCode = await User.findOne({ referralCode: newReferralCode });
      if (!existingCode) isUnique = true;
    }

    // Save user to database
    const user = new User({
      username: username.toLowerCase(),
      chatId: chatId,
      referralCode: newReferralCode,
    });

    try {
      await user.save();
      bot.sendMessage(chatId, 'Verification successful! You will start receiving daily updates.');
    } catch (error) {
      console.error('Error saving user:', error);
      bot.sendMessage(chatId, 'An error occurred during verification. Please try again later.');
    }
  });
});

// Express endpoint to handle verification from frontend
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  if (!telegramUsername) {
    return res.status(400).json({ success: false, message: 'Telegram username is required.' });
  }

  try {
    const user = await User.findOne({ username: telegramUsername.toLowerCase() });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please verify via the bot first.' });
    }

    // Generate referral link
    const referralLink = `https://yourdomain.com/?referralCode=${user.referralCode}`;

    // Send referral link via bot
    bot.sendMessage(user.chatId, `Here is your referral link: ${referralLink}`);

    res.json({ success: true, referralLink });
  } catch (error) {
    console.error('Error in /api/verify:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Express endpoint to handle referrals (optional)
app.post('/api/referral', async (req, res) => {
  const { referralCode } = req.body;

  if (!referralCode) {
    return res.status(400).json({ success: false, message: 'Referral code is required.' });
  }

  try {
    const referringUser = await User.findOne({ referralCode: referralCode });

    if (!referringUser) {
      return res.status(404).json({ success: false, message: 'Referral code not found.' });
    }

    // Implement referral logic (e.g., reward the referring user)
    bot.sendMessage(referringUser.chatId, `Someone used your referral code! Thank you!`);

    res.json({ success: true, message: 'Referral recorded successfully.' });
  } catch (error) {
    console.error('Error in /api/referral:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Schedule daily messages at 9:00 AM server time
cron.schedule('0 9 * * *', async () => {
  const today = new Date();
  const users = await User.find({});

  users.forEach(async (user) => {
    try {
      bot.sendMessage(user.chatId, 'Good morning! Here is your daily update from Double Penis.');
    } catch (error) {
      console.error(`Error sending message to ${user.username}:`, error);
    }
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});
