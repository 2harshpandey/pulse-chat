const mongoose = require('mongoose');

const loginLockdownSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    default: 'me',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  type: {
    type: String,
    enum: ['1hr', '6hr', '12hr', '1day', '3days', 'indefinite', 'custom'],
    required: true,
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
    default: null, // null means indefinite ("until I allow")
  },
  createdBy: {
    type: String,
    default: 'admin',
  },
}, { timestamps: true });

loginLockdownSchema.index({ roomId: 1, isActive: 1 });

const LoginLockdown = mongoose.model('LoginLockdown', loginLockdownSchema);

module.exports = LoginLockdown;
