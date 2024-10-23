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
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Define User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true }, // Telegram chat ID as string
  telegramUsername: { type: String, required: true, unique: true }, // Telegram username in lowercase
  referralCode: { type: String, required: true, unique: true }, // Unique referral code
  referrals: { type: Number, default: 0 }, // Number of referrals
});

const User = mongoose.model('User', userSchema);

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Helper function to generate referral codes
const generateReferralCode = () => {
  return Math.random().toString(36).substr(2, 9).toUpperCase(); // Generate uppercase code
};

// Handle /verify command
bot.onText(/\/verify/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!username) {
    bot.sendMessage(chatId, '❌ Please set a username in Telegram to use this feature.');
    return;
  }

  // Ask for referral code
  bot.sendMessage(chatId, '🔍 Please enter your referral code to verify:');

  // Listen for the next message as referral code
  bot.once('message', async (msg) => {
    const referralCodeInput = msg.text.trim();

    if (!referralCodeInput) {
      bot.sendMessage(chatId, '❌ Referral code cannot be empty. Please try /verify again.');
      return;
    }

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ telegramUsername: username.toLowerCase() });
      if (existingUser) {
        bot.sendMessage(chatId, '✅ You have already been verified.');
        return;
      }

      // Optionally, verify if the referralCode exists in the system
      // For simplicity, we'll assume any referral code is acceptable

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
        telegramId: chatId.toString(),
        telegramUsername: username.toLowerCase(),
        referralCode: newReferralCode,
      });

      await user.save();

      bot.sendMessage(chatId, '🎉 Verification successful! You will start receiving daily updates from Double Penis.');

    } catch (error) {
      console.error('Error saving user:', error);
      bot.sendMessage(chatId, '❌ An error occurred during verification. Please try again later.');
    }
  });
});

// Express endpoint to handle verification from frontend
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  if (!telegramUsername) {
    return res.status(400).json({ success: false, message: '❌ Telegram username is required.' });
  }

  try {
    const user = await User.findOne({ telegramUsername: telegramUsername.toLowerCase() });

    if (!user) {
      return res.status(404).json({ success: false, message: '❌ User not found. Please verify via the Telegram bot first.' });
    }

    // Generate referral link
    const referralLink = `https://yourdomain.com/?referralCode=${user.referralCode}`; // Replace 'yourdomain.com' with your actual domain

    // Send referral link via bot
    await bot.sendMessage(user.telegramId, `🔗 Here is your referral link: ${referralLink}`);

    res.json({ success: true, referralLink });

  } catch (error) {
    console.error('Error in /api/verify:', error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Express endpoint to handle referrals (optional)
app.post('/api/referral', async (req, res) => {
  const { referralCode } = req.body;

  if (!referralCode) {
    return res.status(400).json({ success: false, message: '❌ Referral code is required.' });
  }

  try {
    const referringUser = await User.findOne({ referralCode: referralCode.toUpperCase() });

    if (!referringUser) {
      return res.status(404).json({ success: false, message: '❌ Referral code not found.' });
    }

    // Increment referrals count
    referringUser.referrals += 1;
    await referringUser.save();

    // Send a thank you message to the referring user
    await bot.sendMessage(referringUser.telegramId, `🎁 Someone used your referral code! Thank you for spreading the word!`);

    res.json({ success: true, message: '✅ Referral recorded successfully.' });

  } catch (error) {
    console.error('Error in /api/referral:', error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Schedule daily messages at 9:00 AM server time
cron.schedule('0 9 * * *', async () => {
  console.log('📅 Running daily message scheduler...');
  try {
    const users = await User.find({});
    users.forEach(async (user) => {
      try {
        await bot.sendMessage(user.telegramId, '📢 Good morning! Here is your daily update from Double Penis.');
      } catch (error) {
        console.error(`Error sending daily message to ${user.telegramUsername}:`, error);
      }
    });
    console.log('✅ Daily messages sent successfully.');
  } catch (error) {
    console.error('Error fetching users for daily messages:', error);
  }
});

// Express endpoint to handle chaos initiation
app.post('/api/startChaos', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: '❌ Message is required.' });
  }

  try {
    // Optionally, you can log this event to your database or perform other actions
    console.log(`🌀 Chaos initiated: ${message}`);
    
    // Respond to the frontend
    res.json({ success: true, message: '✅ Chaos initiated successfully.' });
  } catch (error) {
    console.error('Error in /api/startChaos:', error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
