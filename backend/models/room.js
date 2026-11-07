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
roomSchema.index({ isPrivate: 1, createdAt: -1 });
roomSchema.index({ creatorIp: 1 });
roomSchema.index({ creatorFingerprint: 1 });

const escapeRegExp = (string) => String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find room by id or alias with fast indexed exact matching first,
 * falling back to case-insensitive matching for user input convenience.
 */
roomSchema.statics.findByIdOrAlias = async function (idOrAlias, options = {}) {
  if (!idOrAlias || typeof idOrAlias !== 'string') return null;
  const key = idOrAlias.trim();
  if (!key) return null;
  const isLean = Boolean(options.lean);

  // 1. Fast indexed exact match
  let q = this.findOne({ $or: [{ id: key }, { alias: key }] });
  if (isLean) q = q.lean();
  let room = await q;
  if (room) return room;

  // 2. Case-insensitive fallback if exact match not found (for custom IDs / aliases, mobile keyboard capitalization)
  if (key.length <= 64) {
    const safeKey = escapeRegExp(key);
    let fallbackQ = this.findOne({
      $or: [
        { id: new RegExp(`^${safeKey}$`, 'i') },
        { alias: new RegExp(`^${safeKey}$`, 'i') },
      ],
    });
    if (isLean) fallbackQ = fallbackQ.lean();
    room = await fallbackQ;
  }
  return room;
};

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
