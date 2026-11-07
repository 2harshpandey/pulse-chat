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
  // Legacy plaintext token field retained for backward-compatible document reads during on-the-fly migration.
  // New and updated sessions only store sessionTokenHash.
  sessionToken: {
    type: String,
    default: null,
  },
  sessionTokenHash: {
    type: String,
    default: null,
  },
}, { timestamps: true });

userSchema.index({ roomId: 1, userId: 1 }, { unique: true });
userSchema.index({ roomId: 1, userId: 1, sessionTokenHash: 1 });
userSchema.index({ roomId: 1, lastSeen: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
