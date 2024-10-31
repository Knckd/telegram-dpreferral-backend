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
});

// Function to generate a unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Handle '/start' command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 **Welcome to the DoublePenis Verification Bot!**

To claim your free tokens, please follow these steps:

1. **Join our Telegram channel:** [Click here to join](https://t.me/${process.env.CHANNEL_USERNAME})
2. **Verify your membership:** After joining, send the command /verify to confirm.

Let's get started! 🚀`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const telegramUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

  console.log(`Received /verify from Telegram ID: ${telegramId}, Username: ${telegramUsername}`);

  if (!telegramUsername) {
    bot.sendMessage(
      chatId,
      '❌ You need to set a Telegram username in your profile settings to use this verification system. Please set a username and try again.'
    );
    return;
  }

  try {
    // Check if the user is a member of the required Telegram channel
    const chatMember = await bot.getChatMember(`@${process.env.CHANNEL_USERNAME}`, telegramId);

    console.log(`User's membership status: ${chatMember.status}`);

    if (['member', 'administrator', 'creator'].includes(chatMember.status)) {
      // User is a member, proceed with verification
      let user = await User.findOne({ telegramId });

      if (user) {
        // Update username if changed
        if (user.telegramUsername !== telegramUsername) {
          user.telegramUsername = telegramUsername;
          await user.save();
          console.log('Updated telegramUsername for existing user:', user);
        }
        bot.sendMessage(
          chatId,
          '✅ You have already been verified! You can now visit the website to claim your free tokens. 🎉'
        );
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
        await bot.sendMessage(
          chatId,
          '🎉 **Verification successful!** You can now visit the website to claim your free tokens.'
        );

        console.log('User saved successfully:', user);
      }
    } else {
      // User is not a member of the required Telegram channel
      bot.sendMessage(
        chatId,
        `❌ You are not a member of our Telegram channel. Please join first: [Join Here](https://t.me/${process.env.CHANNEL_USERNAME}) and then send /verify again.`,
        { parse_mode: 'Markdown' }
      );
      console.log('User is not a member of the channel.');
    }
  } catch (error) {
    console.error('Verification Error:', error);
    bot.sendMessage(
      chatId,
      '⚠️ An error occurred during verification. Please try again later.'
    );
  }
});

// Optional: Handle other commands or messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // If the message is not a recognized command, you can handle it here
  if (!text.startsWith('/')) {
    bot.sendMessage(
      chatId,
      `ℹ️ To verify, please use the /verify command after joining our Telegram channel.`
    );
  }
});
