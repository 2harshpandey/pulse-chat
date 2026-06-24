const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  alias: {
    type: String,
    sparse: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    maxLength: 1000,
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  joinPassword: {
    type: String, // Hashed password for joining (if private)
    default: null,
  },
  adminPassword: {
    type: String, // Hashed password for admin access
    required: true,
  },
  uniqueSentence: {
    type: String, // Long unique sentence for joining private rooms without password
    default: null,
  },
  creatorIp: {
    type: String,
  },
  creatorFingerprint: {
    type: String,
  },
  lastIdChangeAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// Create text index on 'id' and 'name' for public room search
roomSchema.index({ id: 'text', name: 'text' });

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
