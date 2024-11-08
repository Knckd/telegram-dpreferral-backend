// index.js

// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

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

// Function to generate a unique referral code starting from '511'
async function generateReferralCode() {
  const lastUser = await User.findOne({}).sort({ referralCode: -1 }).exec();
  let newReferralCode = '511';
  if (lastUser && lastUser.referralCode) {
    const lastCode = parseInt(lastUser.referralCode, 10);
    if (!isNaN(lastCode)) {
      newReferralCode = (lastCode + 1).toString();
    }
  }
  return newReferralCode;
}

// Initialize Telegram Bot with polling disabled (using webhooks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

// Set up webhook before connecting to MongoDB
const domain = process.env.DOMAIN; // Your backend URL (e.g., https://your-backend-url.com)
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
    bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString();
      let telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;
      const referralCodeUsed = match[1];

      console.log(
        `📥 /start command received from Telegram ID: ${telegramId}, Username: ${telegramUsername}, Referral Code Used: ${referralCodeUsed}`
      );

      const welcomeMessage = `👋 Welcome to the Double Penis Verification Bot

/verify to begin`;

      bot
        .sendMessage(chatId, welcomeMessage)
        .then(() => {
          console.log(`✅ Sent welcome message to Telegram ID: ${telegramId}`);
        })
        .catch((err) => {
          console.error(`❌ Error sending welcome message to Telegram ID: ${telegramId}:`, err);
        });

      // Process referral if a referral code is provided
      if (referralCodeUsed) {
        const referrer = await User.findOne({ referralCode: referralCodeUsed.trim() });
        if (referrer) {
          // Check if the new user already exists
          let user = await User.findOne({ telegramId });
          if (!user) {
            // Create a new user without a referral code yet
            user = new User({
              telegramId,
              telegramUsername,
              referrals: 0,
              referredBy: referrer.telegramId,
            });
            await user.save();
            console.log(`🆕 New user registered via referral: ${telegramId}`);

            // Avoid self-referral and duplicate referral
            if (referrer.telegramId !== telegramId) {
              referrer.referrals += 1;
              await referrer.save();

              console.log(`🔗 Referral recorded: ${referrer.telegramId} referred ${telegramId}`);

              // Notify the referrer
              try {
                // First message
                await bot.sendMessage(
                  referrer.telegramId,
                  'Congratulations! Someone has used your referral link. 🎉'
                );

                // Second message with details
                await bot.sendMessage(
                  referrer.telegramId,
                  `@${telegramUsername} has joined using your referral link.\nTotal Referrals: ${referrer.referrals}`
                );

                console.log(`✅ Notified referrer ${referrer.telegramId} about the new referral.`);
              } catch (err) {
                console.error(`❌ Error notifying referrer ${referrer.telegramId}:`, err);
              }
            }
          } else {
            // User already exists, update their referredBy if not set
            if (!user.referredBy && referrer.telegramId !== telegramId) {
              user.referredBy = referrer.telegramId;
              await user.save();

              referrer.referrals += 1;
              await referrer.save();

              console.log(`🔗 Referral updated: ${referrer.telegramId} referred ${telegramId}`);

              // Notify the referrer
              try {
                // First message
                await bot.sendMessage(
                  referrer.telegramId,
                  'Congratulations! Someone has used your referral link. 🎉'
                );

                // Second message with details
                await bot.sendMessage(
                  referrer.telegramId,
                  `@${telegramUsername} has joined using your referral link.\nTotal Referrals: ${referrer.referrals}`
                );

                console.log(`✅ Notified referrer ${referrer.telegramId} about the new referral.`);
              } catch (err) {
                console.error(`❌ Error notifying referrer ${referrer.telegramId}:`, err);
              }
            }
          }
        }
      }
    });

    // Handle '/verify' command from users in Telegram
    bot.onText(/\/verify/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString(); // Ensure it's a string
      let telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

      console.log(
        `📥 /verify command received from Telegram ID: ${telegramId}, Username: ${telegramUsername}`
      );

      if (!telegramUsername) {
        bot
          .sendMessage(
            chatId,
            '❌ You need to set a Telegram username in your profile settings to use this verification system. Please set a username and try again.'
          )
          .then(() => {
            console.log(`⚠️ Prompted Telegram ID: ${telegramId} to set a username.`);
          })
          .catch((err) => {
            console.error(
              `❌ Error sending username prompt to Telegram ID: ${telegramId}:`,
              err
            );
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
            bot
              .sendMessage(
                chatId,
                '✅ You have already been verified! You can now visit the website to claim your free tokens. 🎉'
              )
              .then(() => {
                console.log(`✅ Sent already verified message to Telegram ID: ${telegramId}`);
              })
              .catch((err) => {
                console.error(
                  `❌ Error sending already verified message to Telegram ID: ${telegramId}:`,
                  err
                );
              });
          } else {
            // Register the user with both telegramId and telegramUsername
            const referralCode = await generateReferralCode();

            user = new User({
              telegramId,
              telegramUsername,
              referralCode,
              referrals: 0,
            });

            await user.save();

            // Send verification success message via Telegram
            bot
              .sendMessage(
                chatId,
                '🎉 Verification successful! You can now visit the website to claim your free tokens.'
              )
              .then(() => {
                console.log(`✅ Sent verification success message to Telegram ID: ${telegramId}`);
              })
              .catch((err) => {
                console.error(
                  `❌ Error sending verification success message to Telegram ID: ${telegramId}:`,
                  err
                );
              });

            console.log('🆕 New user saved successfully:', user);
          }
        } else {
          // User is not a member of the required Telegram channel
          bot
            .sendMessage(
              chatId,
              `❌ You are not a member of our Telegram channel. Please join first: [Join Here](https://t.me/${process.env.CHANNEL_USERNAME}) and then send /verify again.`,
              { parse_mode: 'Markdown' }
            )
            .then(() => {
              console.log(`⚠️ Instructed Telegram ID: ${telegramId} to join the channel.`);
            })
            .catch((err) => {
              console.error(
                `❌ Error sending not a member message to Telegram ID: ${telegramId}:`,
                err
              );
            });

          console.log('⚠️ User is not a member of the channel.');
        }
      } catch (error) {
        console.error('🔴 Verification Error:', error);
        bot
          .sendMessage(chatId, '⚠️ An error occurred during verification. Please try again later.')
          .then(() => {
            console.log(`⚠️ Sent error message to Telegram ID: ${telegramId}`);
          })
          .catch((err) => {
            console.error(
              `❌ Error sending error message to Telegram ID: ${telegramId}:`,
              err
            );
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
          return res.json({
            success: false,
            message: 'Please send /verify to the bot first.',
          });
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
        const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}`;

        // Send the condensed chaos message
        const chaosMessage = `𝗖𝗵𝗮𝗼𝘀 𝗪𝗮𝘀 𝗝𝘂𝘀𝘁 𝘁𝗵𝗲 𝗕𝗲𝗴𝗶𝗻𝗻𝗶𝗻𝗴!\n\nRefer Friends, Earn REAL Tokens, and Unlock Rewards!\n\nYour referral link: ${referralLink}`;

        await bot
          .sendMessage(chatId, chaosMessage)
          .then(() => {
            console.log(`✅ Sent chaos message to Telegram ID: ${chatId}`);
          })
          .catch((err) => {
            console.error(`❌ Error sending chaos message to Telegram ID: ${chatId}:`, err);
          });

        res.json({ success: true, message: 'Chaos message sent via Telegram.' });
      } catch (error) {
        console.error('❌ Error sending chaos message:', error);

        // Check if the error is due to the user blocking the bot or other messaging issues
        if (error.response && error.response.body && error.response.body.description) {
          console.error(`Telegram API Error: ${error.response.body.description}`);
        }

        res
          .status(500)
          .json({ success: false, message: 'Failed to send chaos message via Telegram.' });
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

    // Daily messages content
    const dailyMessages = [
      "*Daily Message:* Why settle for smooth browsing? Let’s cause some chaos!",
      "*Daily Message:* Keep it rolling! Let’s make some tech explode!",
      "*Daily Message:* Time to break the internet—literally! Are you in?",
      "*Daily Message:* Don’t let your computer feel left out—give it a reason to crash!",
      "*Daily Message:* Let’s crash some systems today!",
      "*Daily Message:* Why settle for smooth browsing? Let’s cause some chaos!",
      "*Daily Message:* Ready to unleash some meme madness? Let’s get wild!",
      "*Daily Message:* Your computer is itching for a little chaos—let’s deliver!",
      "*Daily Message:* Get ready to meme hard and crash harder!",
      "*Daily Message:* Let’s turn the internet upside down.",
      "*Daily Message:* Why browse normally when you can meme wildly?",
      "*Daily Message:* Your computer deserves a thrill—let’s give it a ride!",
      "*Daily Message:* It’s time to turn some gigabytes into gigglebytes!",
      "*Daily Message:* Buckle up! We’re about to meme our way to chaos!",
      "*Daily Message:* Let’s make today a tech-tastrophe—are you in?",
      "*Daily Message:* Why play nice? Let’s unleash some digital havoc!",
      "*Daily Message:* Ready for a meme revolution? Let’s make some noise!",
      "*Daily Message:* Let’s fill the internet with laughter and a little chaos!",
      "*Daily Message:* Why follow the rules when you can crash the game?",
    ];

    // Function to send daily messages
    function sendDailyMessages() {
      User.find({}, async (err, users) => {
        if (err) {
          console.error('❌ Error fetching users for daily messages:', err);
          return;
        }

        for (const user of users) {
          const chatId = user.telegramId;
          const message = dailyMessages[Math.floor(Math.random() * dailyMessages.length)];

          try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log(`✅ Sent daily message to Telegram ID: ${chatId}`);
          } catch (err) {
            console.error(`❌ Error sending daily message to Telegram ID: ${chatId}:`, err);
          }
        }
      });
    }

    // Schedule the daily messages to run once every 24 hours at 10:00 AM
    cron.schedule('0 10 * * *', () => {
      console.log('⏰ Sending daily messages to users...');
      sendDailyMessages();
    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err));
