// index.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const User = require('./models/User');

// Initialize Express App
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Validate Environment Variables
const requiredEnvVars = ['MONGODB_URI', 'BOT_TOKEN', 'FRONTEND_URL', 'DOMAIN', 'CHANNEL_ID'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log('✅ Telegram bot initialized with polling enabled.');

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

  console.log(`📩 Received /verify command from Telegram ID: ${telegramId}, Username: ${telegramUsername}`);

  if (!telegramUsername) {
    bot.sendMessage(chatId, '❌ Please set a username in Telegram to use this feature.');
    console.log(`❌ Telegram ID: ${telegramId} has no username set.`);
    return;
  }

  try {
    // Check if the user is a member of the channel
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, telegramId);
    console.log(`🔍 Checking membership status for Telegram ID: ${telegramId}: ${chatMember.status}`);

    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      // Check if the user is already registered
      let user = await User.findOne({ telegramId });

      if (user) {
        bot.sendMessage(chatId, '✅ You have already been verified. You can proceed to the website.');
        console.log(`✅ Telegram ID: ${telegramId} is already verified.`);
      } else {
        // Register the user
        const referralCode = generateReferralCode();

        user = new User({ telegramId, telegramUsername, referralCode, referrals: 0 });
        await user.save();

        bot.sendMessage(chatId, '🎉 Verification successful! You can now proceed to the website.');
        console.log(`✅ User "${telegramUsername}" saved to database with referral code "${referralCode}".`);
      }
    } else {
      bot.sendMessage(chatId, '❌ Please join the Telegram channel first.');
      console.log(`❌ Telegram ID: ${telegramId} is not a member of the channel.`);
    }
  } catch (error) {
    console.error('❌ Verification Error:', error);
    bot.sendMessage(chatId, '❌ An error occurred during verification. Please try again later.');
  }
});

// Helper Function to Generate Unique Referral Codes
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Express Endpoint to Handle Verification from Frontend
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  console.log(`🔍 /api/verify called with Telegram Username: "${telegramUsername}"`);

  if (!telegramUsername) {
    console.error('❌ Verification failed: Telegram username not provided.');
    return res.status(400).json({ success: false, message: '❌ Telegram username is required.' });
  }

  try {
    const normalizedUsername = telegramUsername.toLowerCase();
    console.log(`🔍 Attempting to verify user: "${normalizedUsername}"`);

    const user = await User.findOne({ telegramUsername: normalizedUsername });

    if (!user) {
      console.error(`❌ Verification failed: User "${normalizedUsername}" not found.`);
      return res.status(404).json({ success: false, message: '❌ User not found. Please verify via the Telegram bot first.' });
    }

    // Generate referral link
    const referralLink = `${process.env.FRONTEND_URL}?referralCode=${user.referralCode}`;
    console.log(`🔗 Generated referral link for user "${normalizedUsername}": ${referralLink}`);

    // Send referral link via Telegram Bot
    await bot.sendMessage(user.telegramId, `🔗 Here is your referral link: ${referralLink}`);
    console.log(`✅ Referral link sent to user "${normalizedUsername}" (Telegram ID: ${user.telegramId})`);

    res.json({ success: true, referralLink });
  } catch (error) {
    console.error(`❌ Error in /api/verify for user "${telegramUsername}":`, error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Serve Frontend Files
app.use(express.static(path.join(__dirname, '../telegram-dpreferral-frontend')));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../telegram-dpreferral-frontend', 'index.html'), (err) => {
    if (err) {
      console.error('❌ Error serving index.html:', err);
      res.status(500).send('❌ Error serving the frontend file.');
    }
  });
});

// Start Express Server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
