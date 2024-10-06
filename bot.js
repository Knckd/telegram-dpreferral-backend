require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Handle '/verify' command
bot.onText(/\/verify/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

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

        user = new User({ telegramId, referralCode, referrals: 0 });
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
