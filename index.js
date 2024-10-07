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
  origin: 'https://knckd.github.io', // Your GitHub Pages domain
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'test', // Specify the database name if necessary
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Initialize Telegram Bot with webhook
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

// Set up webhook
const domain = process.env.DOMAIN; // Your backend URL (e.g., 'https://telegram-dpreferral-backend.onrender.com')
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
const webhookURL = `${domain}${webhookPath}`;

// Set the webhook
bot.setWebHook(webhookURL)
  .then(() => {
    console.log('Webhook set successfully');
  })
  .catch((err) => {
    console.error('Error setting webhook:', err);
  });

// Middleware to handle webhook requests
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Handle '/verify' command from users in Telegram
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

  if (!telegramUsername) {
    bot.sendMessage(chatId, 'You need to set a Telegram username in your profile settings to use this verification system.');
    return;
  }

  try {
    // Check if the user is a member of the channel
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, telegramId);

    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      // Check if the user is already registered
      let user = await User.findOne({ telegramId });

      if (user) {
        bot.sendMessage(chatId, 'You have already been verified. You can proceed to the website.');
      } else {
        // Register the user
        const referralCode = generateReferralCode();

        user = new User({
          telegramId,
          telegramUsername,
          referralCode,
          referrals: 0,
        });
        await user.save();

        bot.sendMessage(chatId, 'Verification successful! You can now proceed to the website.');
      }
    } else {
      bot.sendMessage(chatId, 'Please join the Telegram channel first.');
    }
  } catch (error) {
    console.error('Verification Error:', error);
    bot.sendMessage(chatId, 'An error occurred during verification. Please try again later.');
  }
});

// Endpoint to verify user on the website
app.post('/api/verify', async (req, res) => {
  let { telegramUsername } = req.body;
  telegramUsername = telegramUsername.toLowerCase();

  console.log('Verification attempt for username:', telegramUsername);

  try {
    const user = await User.findOne({ telegramUsername });

    if (user) {
      console.log('User found:', user);
      // User is verified
      return res.json({ success: true, referralCode: user.referralCode });
    } else {
      console.log('User not found in the database.');
      // User not found
      return res.json({ success: false, message: 'Please send /verify to the bot first.' });
    }
  } catch (error) {
    console.error('Verification Error:', error);
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
    console.error('Referral Error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while processing the referral.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
