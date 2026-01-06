const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  
  sender: { type: String, required: true }, // This seems to be the same as userId, can be refactored later
  text: { type: String },
  timestamp: { type: Date, default: Date.now },
  type: { type: String, default: 'text' }, // 'text', 'image', 'video'
  url: { type: String },
  originalName: { type: String },
  isDeleted: { type: Boolean, default: false },
  edited: { type: Boolean, default: false },
  replyingTo: {
    id: String,
    username: String,
    text: String,
    type: String,
  },
  reactions: {
    type: Map,
    of: [reactionSchema],
  }
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
