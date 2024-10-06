// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
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
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Endpoint to verify user on the website
app.post('/api/verify', async (req, res) => {
  const { telegramUsername } = req.body;

  try {
    // Retrieve the user's Telegram ID based on the username
    // Note: Telegram doesn't allow bots to get user info by username
    // So we need to find the user in our database

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
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
