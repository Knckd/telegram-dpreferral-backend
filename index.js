// index.js

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

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize Telegram Bot with polling disabled (using webhooks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

// Connect to MongoDB and start the server after the connection is established
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'test', // Specify the database name
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected');

    // Start the server after the database connection is established
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Set up webhook
    const domain = process.env.DOMAIN; // Your backend URL on Render
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

    // Handle '/verify' command from users in Telegram
    bot.onText(/\/verify/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString(); // Ensure it's a string
      let telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

      console.log(`Received /verify from Telegram ID: ${telegramId}, Username: ${telegramUsername}`);

      if (!telegramUsername) {
        bot.sendMessage(chatId, 'You need to set a Telegram username in your profile settings to use this verification system.');
        return;
      }

      try {
        // Since the channel is private, getChatMember may not work as expected.
        // Assuming the bot is in the private channel and the user is expected to directly message the bot.

        // Proceed with verification
        let user = await User.findOne({ telegramId });

        if (user) {
          // Ensure the user's telegramUsername is saved in the database
          if (!user.telegramUsername || user.telegramUsername !== telegramUsername) {
            user.telegramUsername = telegramUsername; // Update username if changed
            await user.save();
            console.log('Updated telegramUsername for existing user:', user);
          }
          bot.sendMessage(chatId, 'You have already been verified. You can proceed to the website to retrieve your referral link.');
          console.log('User already verified:', user);
        } else {
          // Register the user with both telegramId and telegramUsername
          const referralCode = generateReferralCode();

          user = new User({
            telegramId,
            telegramUsername,
            referralCode,
            referrals: 0,
          });

          console.log('Saving new user:', user);

          await user.save();

          // Send verification success message via Telegram
          await bot.sendMessage(chatId, `🎉 Verification successful! You can now proceed to the website to retrieve your referral link.`);

          console.log('User saved successfully:', user);
        }
      } catch (error) {
        console.error('Verification Error:', error);
        bot.sendMessage(chatId, 'An error occurred during verification. Please try again later.');
      }
    });

    // Endpoint to verify user on the website
    app.post('/api/verify', async (req, res) => {
      let { telegramUsername } = req.body;
      if (!telegramUsername) {
        return res.status(400).json({ success: false, message: 'telegramUsername is required.' });
      }
      telegramUsername = telegramUsername.toLowerCase(); // Ensure case-insensitive matching

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

    // Endpoint to send referral code and link via Telegram
    app.post('/api/sendReferral', async (req, res) => {
      let { telegramUsername } = req.body;

      if (!telegramUsername) {
        return res.status(400).json({ success: false, message: 'telegramUsername is required.' });
      }

      telegramUsername = telegramUsername.toLowerCase(); // Ensure case-insensitive matching

      try {
        const user = await User.findOne({ telegramUsername });

        if (!user) {
          console.log(`User with username "${telegramUsername}" not found.`);
          return res.status(404).json({ success: false, message: 'User not found. Please verify first.' });
        }

        const chatId = user.telegramId;

        // Generate referral link
        const referralLink = `${process.env.SITE_URL}/register?ref=${user.referralCode}`;

        // Send messages via Telegram to the individual user
        await bot.sendMessage(chatId, 'The chaos you endured was harmless! 😊');
        await bot.sendMessage(chatId, 'To receive your free tokens, you must refer 5 friends with the chaos!');
        await bot.sendMessage(chatId, `🎉 Here is your referral code: ${user.referralCode}\n🔗 Your referral link: ${referralLink}`);

        console.log(`Messages sent to Telegram ID: ${chatId}`);

        res.json({ success: true, message: 'Messages sent via Telegram.' });
      } catch (error) {
        console.error('Error sending messages:', error);

        // Check if the error is due to the user blocking the bot or other messaging issues
        if (error.response && error.response.body && error.response.body.description) {
          console.error(`Telegram API Error: ${error.response.body.description}`);
        }

        res.status(500).json({ success: false, message: 'Failed to send messages via Telegram.' });
      }
    });

    // Other endpoints remain unchanged...
  })
  .catch((err) => console.error('MongoDB connection error:', err));
