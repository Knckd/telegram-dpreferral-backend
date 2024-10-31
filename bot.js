// bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully.');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
});

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Handle '/start' command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 *Welcome to the DoublePenis Verification Bot!*

To claim your free tokens, please follow these steps:

1. **Join our Telegram channel:** [Click here to join](https://t.me/${process.env.CHANNEL_USERNAME})
2. **Verify your membership:** After joining, send the command /verify to confirm.

Let's get started! 🚀`;

  console.log(`📥 /start command received from Telegram ID: ${msg.from.id}, Username: ${msg.from.username}`);

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' })
    .then(() => {
      console.log(`✅ Sent welcome message to Telegram ID: ${msg.from.id}`);
    })
    .catch((err) => {
      console.error(`❌ Error sending welcome message to Telegram ID: ${msg.from.id}:`, err);
    });
});

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

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
        // User already exists
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
        // Register the new user
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

// Optional: Handle other commands or messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // If the message is not a recognized command, provide guidance
  if (!text.startsWith('/')) {
    bot.sendMessage(
      chatId,
      `ℹ️ To verify, please use the /verify command after joining our Telegram channel.`
    )
    .then(() => {
      console.log(`ℹ️ Provided verification guidance to Telegram ID: ${chatId}`);
    })
    .catch((err) => {
      console.error(`❌ Error sending verification guidance to Telegram ID: ${chatId}:`, err);
    });
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error(`🔴 Polling Error: ${error.code} - ${error.message}`);
});

// Handle webhook errors (if using webhooks)
bot.on('webhook_error', (error) => {
  console.error(`🔴 Webhook Error: ${error.code} - ${error.message}`);
});

// Confirmation of bot startup
console.log('🤖 Bot is up and running!');
