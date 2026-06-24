const mongoose = require('mongoose');

const tempLinkSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    default: 'me',
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  isRevoked: {
    type: Boolean,
    default: false,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  usedBy: [{
    username: String,
    joinedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// Auto-expire documents 24 hours after expiry for cleanup
tempLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
tempLinkSchema.index({ roomId: 1, createdAt: -1 });

const TempLink = mongoose.model('TempLink', tempLinkSchema);

module.exports = TempLink;
