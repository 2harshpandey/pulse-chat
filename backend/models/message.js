const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  isAlbum: { type: Boolean, default: false },
}, { _id: false, strict: false });

// Issue 8: Explicit sub-schemas for poll data instead of free-form { type: Object }.
// This enforces field constraints and prevents arbitrary key injection into MongoDB.
const pollOptionSchema = new mongoose.Schema({
  text:  { type: String, maxlength: 200, default: '' },
  votes: { type: [{ type: String, maxlength: 64 }], default: [] },
}, { _id: false });

const pollSchema = new mongoose.Schema({
  question: { type: String, maxlength: 300, default: 'Poll' },
  options:  { type: [pollOptionSchema], default: [] },
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
  duration: { type: Number },
  waveform: { type: [Number] },
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: String, default: null },
  vanished: { type: Boolean, default: false },
  edited: { type: Boolean, default: false },
  clientTempId: { type: String, default: null },
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
  },
  poll: { type: pollSchema, default: null }
}, { timestamps: true });

// Supports fast reverse-chronological pagination for chat history.
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, 'replyingTo.id': 1 });
messageSchema.index({ roomId: 1, clientTempId: 1 }, { sparse: true });
messageSchema.index({ roomId: 1, isDeleted: 1, vanished: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, 'pinned.pinnedAt': -1 });
messageSchema.index({ text: 'text', originalName: 'text' });
messageSchema.index({ url: 1 }, { sparse: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
