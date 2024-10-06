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
  origin: 'https://knckd.github.io', // Adjust this to your GitHub Pages domain
}));
app.use(express.json());

// Set mongoose strictQuery to true
mongoose.set('strictQuery', true);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN);

// Use Webhook for Telegram Bot
const domain = process.env.DOMAIN; // Ensure this environment variable is set to your backend URL
const port = process.env.PORT || 5000;
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
const webhookURL = `${domain}${webhookPath}`;

// Set the bot webhook
bot.setWebHook(webhookURL)
  .then(() => {
    console.log('Webhook set successfully');
  })
  .catch((err) => {
    console.error('Error setting webhook:', err);
  });

// Express route to handle webhook requests from Telegram
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const telegramUsername = msg.from.username; // Get the user's Telegram username

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

        user = new User({ telegramId, telegramUsername, referralCode, referrals: 0 });
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

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Endpoint to verify user on the website
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  try {
    // Find the user by telegramUsername
    const user = await User.findOne({ telegramUsername });

    if (user) {
      // User is verified
      return res.json({ success: true, referralCode: user.referralCode });
    } else {
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
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
