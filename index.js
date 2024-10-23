// index.js

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

// Suppress Mongoose strictQuery deprecation warning
mongoose.set('strictQuery', false);

const app = express();
app.use(bodyParser.json());

// Configure CORS to allow requests from your frontend
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Validate environment variables
const requiredEnvVars = ['PORT', 'MONGO_URI', 'BOT_TOKEN', 'FRONTEND_URL'];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

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
  telegramId: { type: String, required: true, unique: true },
  telegramUsername: { type: String, required: true, unique: true },
  referralCode: { type: String, required: true, unique: true },
  referrals: { type: Number, default: 0 },
});

const User = mongoose.model('User', userSchema);

// Initialize Telegram Bot
let bot;
try {
  bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
  console.log('✅ Telegram bot initialized successfully.');
} catch (error) {
  console.error('❌ Failed to initialize Telegram bot:', error);
  process.exit(1);
}

// Helper function to generate referral codes
const generateReferralCode = () => {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
};

// User state management for handling conversations
const userStates = {};

// Handle /verify command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!username) {
    bot.sendMessage(chatId, '❌ Please set a username in Telegram to use this feature.');
    return;
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ telegramUsername: username.toLowerCase() });
    if (existingUser) {
      bot.sendMessage(chatId, '✅ You have already been verified.');
    } else {
      // Prompt user for referral code
      userStates[chatId] = 'awaitingReferralCode';
      bot.sendMessage(chatId, '🔍 Please enter your referral code to verify (if any). If you do not have one, simply reply with "NONE".');
    }
  } catch (error) {
    console.error('Error checking user:', error);
    bot.sendMessage(chatId, '❌ An error occurred during verification. Please try again later.');
  }
});

// Handle messages for referral code input
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Check if we are expecting a referral code from this user
  if (userStates[chatId] === 'awaitingReferralCode') {
    let referralCodeInput = msg.text.trim().toUpperCase();

    // Handle cases where user does not have a referral code
    if (referralCodeInput === 'NONE') {
      referralCodeInput = null;
    }

    const username = msg.from.username;

    if (!username) {
      bot.sendMessage(chatId, '❌ Please set a username in Telegram to use this feature.');
      delete userStates[chatId];
      return;
    }

    try {
      let referringUser = null;
      if (referralCodeInput) {
        referringUser = await User.findOne({ referralCode: referralCodeInput });
        if (!referringUser) {
          bot.sendMessage(chatId, '❌ Referral code not found. Please try /verify again.');
          delete userStates[chatId];
          return;
        }
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
        telegramId: chatId.toString(),
        telegramUsername: username.toLowerCase(),
        referralCode: newReferralCode,
      });

      await user.save();

      // Increment referrals count for referring user
      if (referringUser) {
        referringUser.referrals += 1;
        await referringUser.save();
        bot.sendMessage(referringUser.telegramId, `🎁 Someone used your referral code! Thank you for spreading the word!`);
      }

      bot.sendMessage(chatId, '🎉 Verification successful! You will start receiving daily updates from Double Penis.');

    } catch (error) {
      console.error('Error saving user:', error);
      bot.sendMessage(chatId, '❌ An error occurred during verification. Please try again later.');
    }

    // Clear user state
    delete userStates[chatId];
  }
});

// Express endpoint to handle verification from frontend
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  if (!telegramUsername) {
    console.error('Verification failed: Telegram username not provided.');
    return res.status(400).json({ success: false, message: '❌ Telegram username is required.' });
  }

  try {
    const normalizedUsername = telegramUsername.toLowerCase();
    console.log(`Attempting to verify user: ${normalizedUsername}`);

    const user = await User.findOne({ telegramUsername: normalizedUsername });

    if (!user) {
      console.error(`Verification failed: User "${normalizedUsername}" not found.`);
      return res.status(404).json({ success: false, message: '❌ User not found. Please verify via the Telegram bot first.' });
    }

    // Generate referral link
    const referralLink = `${process.env.FRONTEND_URL}?referralCode=${user.referralCode}`;
    console.log(`Generated referral link for user "${normalizedUsername}": ${referralLink}`);

    // Send referral link via bot
    await bot.sendMessage(user.telegramId, `🔗 Here is your referral link: ${referralLink}`);
    console.log(`Referral link sent to user "${normalizedUsername}" (Telegram ID: ${user.telegramId})`);

    res.json({ success: true, referralLink });

  } catch (error) {
    console.error(`Error in /api/verify for user "${telegramUsername}":`, error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Express endpoint to handle chaos initiation and send "Gotcha" message
app.post('/api/startChaos', async (req, res) => {
  const { referralCode } = req.body;

  if (!referralCode) {
    return res.status(400).json({ success: false, message: '❌ Referral code is required.' });
  }

  try {
    const user = await User.findOne({ referralCode: referralCode.toUpperCase() });

    if (!user) {
      return res.status(404).json({ success: false, message: '❌ Referral code not found.' });
    }

    // Send "Gotcha" message to the user
    await bot.sendMessage(user.telegramId, 'HAHA, Gotcha! Refer more people to claim your free token!');

    // Optionally, log this event
    console.log(`🌀 Chaos initiated by user: ${user.telegramUsername}`);

    res.json({ success: true, message: '✅ Chaos initiated successfully.' });

  } catch (error) {
    console.error('Error in /api/startChaos:', error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Schedule daily messages at 9:00 AM server time
cron.schedule('0 9 * * *', async () => {
  console.log('📅 Running daily message scheduler...');
  try {
    const users = await User.find({});
    for (const user of users) {
      try {
        await bot.sendMessage(user.telegramId, '📢 Good morning! Here is your daily update from Double Penis.');
      } catch (error) {
        console.error(`Error sending daily message to ${user.telegramUsername}:`, error);
      }
    }
    console.log('✅ Daily messages sent successfully.');
  } catch (error) {
    console.error('Error fetching users for daily messages:', error);
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
