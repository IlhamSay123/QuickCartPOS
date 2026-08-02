const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const dotenv = require("dotenv");

dotenv.config();

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  // Set only while a password-reset link is outstanding; cleared once used
  // or expired. The raw token is never stored — only its SHA-256 hash, same
  // idea as password hashing: a database leak shouldn't hand out usable
  // reset tokens directly.
  resetTokenHash: { type: String, select: false },
  resetTokenExpiry: { type: Date, select: false },
});

// Hash password before saving to database
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
