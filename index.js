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

// Initialize Telegram Bot (without starting it yet)
const bot = new TelegramBot(process.env.BOT_TOKEN);

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

    // Handle '/verify' command from users in Telegram
    bot.onText(/\/verify/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id;
      const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

      console.log(`Received /verify from Telegram ID: ${telegramId}, Username: ${telegramUsername}`);

      if (!telegramUsername) {
        bot.sendMessage(chatId, 'You need to set a Telegram username in your profile settings to use this verification system.');
        return;
      }

      try {
        // Check if the user is a member of the required Telegram channel
        const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, telegramId);

        if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
          // User is a member, proceed with verification
          let user = await User.findOne({ telegramId });

          if (user) {
            // Ensure the user's telegramUsername is saved in the database
            if (!user.telegramUsername) {
              user.telegramUsername = telegramUsername; // Add missing username if not present
              await user.save();
              console.log('Added telegramUsername to existing user:', user);
            }
            bot.sendMessage(chatId, 'You have already been verified. You can proceed to the website to get your referral link.');
            console.log('User already verified:', user);
          } else {
            // Register the user with both telegramId and telegramUsername
            const referralCode = generateReferralCode();

            user = new User({
              telegramId,
              telegramUsername,  // Ensure username is saved
              referralCode,
              referrals: 0,
            });

            console.log('Saving new user:', user);

            await user.save();

            bot.sendMessage(chatId, 'Verification successful! You can now proceed to the website to retrieve your referral link.');
            console.log('User saved successfully:', user);
          }
        } else {
          // User is not a member of the required Telegram channel
          bot.sendMessage(chatId, `Please join our Telegram channel first: https://t.me/YourChannelUsername and then send /verify again.`);
          console.log('User is not a member of the channel.');
        }
      } catch (error) {
        console.error('Verification Error:', error);
        bot.sendMessage(chatId, 'An error occurred during verification. Please try again later.');
      }
    });

    // Endpoint to verify user on the website
    app.post('/api/verify', async (req, res) => {
      let { telegramUsername } = req.body;
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

    // New endpoint to handle chaos initiation
    app.post('/api/startChaos', async (req, res) => {
      const { message } = req.body;

      try {
        // Sample message to user after chaos starts (this will trigger the bot)
        const chatId = process.env.DEFAULT_CHAT_ID; // Replace with actual logic to get the user's chat ID
        
        // Send messages via the Telegram bot when chaos starts
        bot.sendMessage(chatId, 'Chaos has been initiated! Enjoy the madness!');
        bot.sendMessage(chatId, 'Here is another chaotic message just for fun!');

        console.log('Chaos event triggered:', message);
        res.json({ success: true, message: 'Chaos initiated and messages sent!' });
      } catch (error) {
        console.error('Error triggering chaos:', error);
        res.status(500).json({ success: false, message: 'Chaos initiation failed.' });
      }
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
