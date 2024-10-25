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
      let telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

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
            bot.sendMessage(chatId, 'You have already been verified. You can proceed to the website to retrieve your referral link.');
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

            // Send verification success message via Telegram
            await bot.sendMessage(chatId, `🎉 Verification successful! You can now proceed to the website to retrieve your referral link.`);

            console.log('User saved successfully:', user);
          }
        } else {
          // User is not a member of the required Telegram channel
          bot.sendMessage(chatId, `Please join our Telegram channel first: https://t.me/${process.env.CHANNEL_USERNAME} and then send /verify again.`);
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
      const { telegramUsername } = req.body;

      if (!telegramUsername) {
        return res.status(400).json({ success: false, message: 'telegramUsername is required.' });
      }

      try {
        const user = await User.findOne({ telegramUsername });

        if (!user) {
          console.log(`User with username "${telegramUsername}" not found.`);
          return res.status(404).json({ success: false, message: 'User not found. Please verify first.' });
        }

        // Generate referral link
        const referralLink = `${process.env.SITE_URL}/register?ref=${user.referralCode}`;

        // Send the referral code and link via Telegram
        await bot.sendMessage(user.telegramId, `🎉 Here is your referral code: ${user.referralCode}\n🔗 Your referral link: ${referralLink}`);

        console.log(`Referral code and link sent to Telegram ID: ${user.telegramId}`);

        res.json({ success: true, message: 'Referral code and link sent via Telegram.' });
      } catch (error) {
        console.error('Error sending referral code and link:', error);
        res.status(500).json({ success: false, message: 'Failed to send referral code and link via Telegram.' });
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
        await bot.sendMessage(chatId, 'Chaos has been initiated! Enjoy the madness!');
        await bot.sendMessage(chatId, 'Here is another chaotic message just for fun!');

        console.log('Chaos event triggered:', message);
        res.json({ success: true, message: 'Chaos initiated and messages sent!' });
      } catch (error) {
        console.error('Error triggering chaos:', error);
        res.status(500).json({ success: false, message: 'Chaos initiation failed.' });
      }
    });

    // Endpoint to handle token claims
    app.post('/api/claim', async (req, res) => {
      const { telegramUsername } = req.body;

      if (!telegramUsername) {
        return res.status(400).json({ success: false, message: 'Telegram username is required.' });
      }

      try {
        const user = await User.findOne({ telegramUsername: telegramUsername.toLowerCase() });

        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found. Please verify first.' });
        }

        // Check if the user has already claimed tokens
        if (user.hasClaimed) {
          return res.json({ success: false, message: 'You have already claimed your tokens.' });
        }

        // Process the token claim (e.g., interact with Solana blockchain)
        // This part depends on your specific implementation and requirements

        // Update the user as having claimed tokens
        user.hasClaimed = true;
        await user.save();

        res.json({ success: true, message: 'Tokens claimed successfully!' });

        // Optionally, notify the backend of the claim
        // await fetch(`${backendUrl}/api/claimNotification`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ telegramUsername }),
        // });
      } catch (error) {
        console.error('Claim Error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your claim.' });
      }
    });

    // Optional: Endpoint to notify backend about the claim
    app.post('/api/claimNotification', async (req, res) => {
      // Implement any additional logic you need when a claim is made
      res.json({ success: true, message: 'Claim notification received.' });
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
