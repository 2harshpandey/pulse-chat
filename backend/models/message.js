const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, default: 'me' },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  
  sender: { type: String, required: true }, // This seems to be the same as userId, can be refactored later
  text: { type: String },
  timestamp: { type: Date, default: Date.now },
  type: { type: String, default: 'text' }, // 'text', 'image', 'video'
  url: { type: String },
  originalName: { type: String },
  size: { type: Number },
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: String, default: null },
  vanished: { type: Boolean, default: false },
  edited: { type: Boolean, default: false },
  replyingTo: {
    type: Object,
    default: null
  },
  pinned: {
    type: Object,
    default: null // { pinnedAt: Date, expiresAt: Date | null }
  },
  reactions: {
    type: Map,
    of: [reactionSchema],
  }
}, { timestamps: true });

// Supports fast reverse-chronological pagination for chat history.
messageSchema.index({ roomId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
