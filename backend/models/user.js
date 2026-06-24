const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  roomId: {
    type: String,
    required: true,
    default: 'me',
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

userSchema.index({ roomId: 1, userId: 1 }, { unique: true });
userSchema.index({ roomId: 1, lastSeen: -1 });
userSchema.index({ roomId: 1, joinHistory: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
