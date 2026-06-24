const mongoose = require('mongoose');

const chatStateSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, default: 'me' },
  frontendHiddenBefore: { type: Date, default: null },
}, { timestamps: true });

const ChatState = mongoose.model('ChatState', chatStateSchema);

module.exports = ChatState;