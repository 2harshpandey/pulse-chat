const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  joinHistory: {
    type: [Date],
    default: [],
  },
}, { timestamps: true });

userSchema.index({ lastSeen: -1 });
userSchema.index({ joinHistory: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
