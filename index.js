// index.js

// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const path = require('path');

// Import the User model
const User = require('./models/User');

// Initialize Express app
const app = express();

// Middleware
app.use(
  cors({
    origin: 'https://doublepenis.com', // Allow requests from your frontend domain
  })
);
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize Telegram Bot with polling disabled (using webhooks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

// Set up webhook before connecting to MongoDB
const domain = process.env.DOMAIN; // Your backend URL (e.g., https://telegram-dpreferral-backend.onrender.com)
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
const webhookURL = `${domain}${webhookPath}`;

// Set the webhook
bot
  .setWebHook(webhookURL)
  .then(() => {
    console.log('✅ Webhook set successfully');
  })
  .catch((err) => {
    console.error('❌ Error setting webhook:', err);
  });

// Middleware to handle webhook requests
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Connect to MongoDB and start the server after the connection is established
mongoose
  .connect(process.env.MONGODB_URI, {
    dbName: 'test', // Specify the database name
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ MongoDB connected');

    // Start the server after the database connection is established
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // Handle '/start' command from users in Telegram
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

      console.log(`📥 /start command received from Telegram ID: ${msg.from.id}, Username: ${msg.from.username}`);

      const welcomeMessage = `👋 *Welcome to the DoublePenis Verification Bot!*

To claim your free tokens, please follow these steps:

1. **Join our Telegram channel:** [Click here to join](https://t.me/${process.env.CHANNEL_USERNAME})
2. **Verify your membership:** After joining, send the command /verify to confirm.

Let's get started! 🚀`;

      bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' })
        .then(() => {
          console.log(`✅ Sent welcome message to Telegram ID: ${msg.from.id}`);
        })
        .catch((err) => {
          console.error(`❌ Error sending welcome message to Telegram ID: ${msg.from.id}:`, err);
        });
    });

    // Handle '/verify' command from users in Telegram
    bot.onText(/\/verify/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString(); // Ensure it's a string
      let telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

      console.log(`📥 /verify command received from Telegram ID: ${telegramId}, Username: ${telegramUsername}`);

      if (!telegramUsername) {
        bot.sendMessage(
          chatId,
          '❌ You need to set a Telegram username in your profile settings to use this verification system. Please set a username and try again.'
        )
        .then(() => {
          console.log(`⚠️ Prompted Telegram ID: ${telegramId} to set a username.`);
        })
        .catch((err) => {
          console.error(`❌ Error sending username prompt to Telegram ID: ${telegramId}:`, err);
        });
        return;
      }

      try {
        // Check if the user is a member of the required Telegram channel
        const chatMember = await bot.getChatMember(`@${process.env.CHANNEL_USERNAME}`, telegramId);

        console.log(`🔍 User's membership status: ${chatMember.status}`);

        if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
          // User is a member, proceed with verification
          let user = await User.findOne({ telegramId });

          if (user) {
            // Update username if changed
            if (user.telegramUsername !== telegramUsername) {
              user.telegramUsername = telegramUsername;
              await user.save();
              console.log('📝 Updated telegramUsername for existing user:', user);
            }
            bot.sendMessage(
              chatId,
              '✅ You have already been verified! You can now visit the website to claim your free tokens. 🎉'
            )
            .then(() => {
              console.log(`✅ Sent already verified message to Telegram ID: ${telegramId}`);
            })
            .catch((err) => {
              console.error(`❌ Error sending already verified message to Telegram ID: ${telegramId}:`, err);
            });
          } else {
            // Register the user with both telegramId and telegramUsername
            const referralCode = generateReferralCode();

            user = new User({
              telegramId,
              telegramUsername,
              referralCode,
              referrals: 0,
            });

            await user.save();

            // Send verification success message via Telegram
            bot.sendMessage(
              chatId,
              '🎉 *Verification successful!* You can now visit the website to claim your free tokens.',
              { parse_mode: 'Markdown' }
            )
            .then(() => {
              console.log(`✅ Sent verification success message to Telegram ID: ${telegramId}`);
            })
            .catch((err) => {
              console.error(`❌ Error sending verification success message to Telegram ID: ${telegramId}:`, err);
            });

            console.log('🆕 New user saved successfully:', user);
          }
        } else {
          // User is not a member of the required Telegram channel
          bot.sendMessage(
            chatId,
            `❌ You are not a member of our Telegram channel. Please join first: [Join Here](https://t.me/${process.env.CHANNEL_USERNAME}) and then send /verify again.`,
            { parse_mode: 'Markdown' }
          )
          .then(() => {
            console.log(`⚠️ Instructed Telegram ID: ${telegramId} to join the channel.`);
          })
          .catch((err) => {
            console.error(`❌ Error sending not a member message to Telegram ID: ${telegramId}:`, err);
          });

          console.log('⚠️ User is not a member of the channel.');
        }
      } catch (error) {
        console.error('🔴 Verification Error:', error);
        bot.sendMessage(
          chatId,
          '⚠️ An error occurred during verification. Please try again later.'
        )
        .then(() => {
          console.log(`⚠️ Sent error message to Telegram ID: ${telegramId}`);
        })
        .catch((err) => {
          console.error(`❌ Error sending error message to Telegram ID: ${telegramId}:`, err);
        });
      }
    });

    // Endpoint to verify user on the website
    app.post('/api/verify', async (req, res) => {
      let { telegramUsername } = req.body;
      if (!telegramUsername) {
        return res
          .status(400)
          .json({ success: false, message: 'telegramUsername is required.' });
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
        res
          .status(500)
          .json({ success: false, message: 'An error occurred during verification.' });
      }
    });

    // Endpoint to send referral code and link via Telegram
    app.post('/api/sendReferral', async (req, res) => {
      let { telegramUsername } = req.body;

      if (!telegramUsername) {
        return res
          .status(400)
          .json({ success: false, message: 'telegramUsername is required.' });
      }

      telegramUsername = telegramUsername.toLowerCase(); // Ensure case-insensitive matching

      try {
        const user = await User.findOne({ telegramUsername });

        if (!user) {
          console.log(`User with username "${telegramUsername}" not found.`);
          return res
            .status(404)
            .json({ success: false, message: 'User not found. Please verify first.' });
        }

        const chatId = user.telegramId;

        // Generate referral link
        const referralLink = `${process.env.SITE_URL}/register?ref=${user.referralCode}`;

        // Send messages via Telegram to the individual user

        // The redundant message has been commented out
        // await bot.sendMessage(
        //   chatId,
        //   '🎉 Verification successful! You can now visit the website to claim your free tokens.'
        // );

        // Second Message
        await bot.sendMessage(
          chatId,
          "The chaos was harmless, you were your buddy's victim. To get your free tokens, you must refer five more victims to fall into this trap. 🙅‍♂️❌"
        );

        // Third Message (Referral Code and Link)
        await bot.sendMessage(
          chatId,
          `🎉 Here is your referral code: ${user.referralCode}\n🔗 Your referral link: ${referralLink}`
        );

        console.log(`✅ Messages sent to Telegram ID: ${chatId}`);

        res.json({ success: true, message: 'Messages sent via Telegram.' });
      } catch (error) {
        console.error('❌ Error sending messages:', error);

        // Check if the error is due to the user blocking the bot or other messaging issues
        if (error.response && error.response.body && error.response.body.description) {
          console.error(`Telegram API Error: ${error.response.body.description}`);
        }

        res
          .status(500)
          .json({ success: false, message: 'Failed to send messages via Telegram.' });
      }
    });

    // Leaderboard Endpoint
    app.get('/api/leaderboard', async (req, res) => {
      try {
        const leaderboard = await User.find()
          .sort({ referrals: -1 })
          .limit(10)
          .select('telegramUsername referrals -_id');
        res.json({ success: true, leaderboard });
      } catch (error) {
        console.error('❌ Error fetching leaderboard:', error);
        res.status(500).json({ success: false, message: 'Error fetching leaderboard.' });
      }
    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));
