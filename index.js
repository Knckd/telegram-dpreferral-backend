// index.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const path = require('path');
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
app.use(express.static(path.join(__dirname, 'public')));

// Validate Environment Variables
const requiredEnvVars = ['MONGO_URI', 'BOT_TOKEN', 'FRONTEND_URL', 'DOMAIN', 'CHANNEL_ID'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

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
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Initialize Telegram Bot with Webhook
const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: true });

// Set Webhook
const webhookURL = `${process.env.DOMAIN}/telegram-webhook`;
bot.setWebHook(webhookURL)
  .then(() => {
    console.log(`✅ Webhook set to ${webhookURL}`);
  })
  .catch(err => {
    console.error('❌ Failed to set webhook:', err);
  });

// Handle Telegram Webhook
app.post('/telegram-webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Helper Function to Generate Unique Referral Codes
const generateReferralCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const user = await User.findOne({ referralCode: code });
    if (!user) exists = false;
  }
  return code;
};

// Handle '/verify' Command from Telegram
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
        const referralCode = await generateReferralCode();

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

// Express Endpoint to Handle Chaos Initiation from Frontend
app.post('/api/startChaos', async (req, res) => {
  const { referralCode } = req.body;

  console.log(`🌀 /api/startChaos called with Referral Code: "${referralCode}"`);

  if (!referralCode) {
    console.error('❌ Chaos initiation failed: Referral code not provided.');
    return res.status(400).json({ success: false, message: '❌ Referral code is required.' });
  }

  try {
    const user = await User.findOne({ referralCode: referralCode.toUpperCase() });

    if (!user) {
      console.error(`❌ Chaos initiation failed: Referral code "${referralCode}" not found.`);
      return res.status(404).json({ success: false, message: '❌ Referral code not found.' });
    }

    // Send "Gotcha" message to the user
    await bot.sendMessage(user.telegramId, 'HAHA, Gotcha! Refer more people to claim your free token!');
    console.log(`✅ "Gotcha" message sent to user "${user.telegramUsername}" (Telegram ID: ${user.telegramId}).`);

    res.json({ success: true, message: '✅ Chaos initiated successfully.' });
  } catch (error) {
    console.error('❌ Error in /api/startChaos:', error);
    res.status(500).json({ success: false, message: '❌ Internal server error.' });
  }
});

// Serve Frontend HTML (Optional)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
