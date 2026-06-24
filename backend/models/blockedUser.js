const mongoose = require('mongoose');

const blockedUserSchema = new mongoose.Schema({
  // Primary identifier
  roomId: {
    type: String,
    required: true,
    default: 'me',
  },
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  // Device fingerprints for robust blocking
  fingerprints: {
    ips: [String],
    userAgents: [String],
    screenResolution: String,
    platform: String,
    language: String,
    timezone: String,
    // Combined hash for quick lookup
    deviceHashes: [String],
  },
  isBlocked: {
    type: Boolean,
    default: true,
  },
  blockedAt: {
    type: Date,
    default: Date.now,
  },
  unblockedAt: {
    type: Date,
    default: null,
  },
  reason: {
    type: String,
    default: '',
  },
}, { timestamps: true });

// Index for fast lookups
blockedUserSchema.index({ roomId: 1, userId: 1 });
blockedUserSchema.index({ roomId: 1, isBlocked: 1 });
blockedUserSchema.index({ roomId: 1, 'fingerprints.ips': 1 });
blockedUserSchema.index({ roomId: 1, 'fingerprints.deviceHashes': 1 });

const BlockedUser = mongoose.model('BlockedUser', blockedUserSchema);

module.exports = BlockedUser;
