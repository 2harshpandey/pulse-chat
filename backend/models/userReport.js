const mongoose = require('mongoose');

const userReportSchema = new mongoose.Schema({
  reporterUserId: {
    type: String,
    required: true,
    index: true,
  },
  reporterUsername: {
    type: String,
    required: true,
  },
  reporterIp: {
    type: String,
    default: '',
  },
  reporterUserAgent: {
    type: String,
    default: '',
  },
  reportedUserId: {
    type: String,
    required: true,
    index: true,
  },
  reportedUsername: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  messageId: {
    type: String,
    default: '',
  },
  messageType: {
    type: String,
    default: 'text',
  },
  messageText: {
    type: String,
    default: '',
  },
  messageUrl: {
    type: String,
    default: '',
  },
  messageTimestamp: {
    type: Date,
    default: null,
  },
  reportedUserJoinedAt: {
    type: Date,
    default: null,
  },
  reportedUserLastSeen: {
    type: Date,
    default: null,
  },
  reportedUserCurrentSessionLoginTime: {
    type: Date,
    default: null,
  },
  reportedUserCurrentSessionDurationMs: {
    type: Number,
    default: null,
  },
  reportedUserIsOnline: {
    type: Boolean,
    default: false,
  },
  reportedUserJoinHistory: {
    type: [Date],
    default: [],
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

userReportSchema.index({ reportedUserId: 1, reportedAt: -1 });
userReportSchema.index({ reporterUserId: 1, reportedAt: -1 });

const UserReport = mongoose.model('UserReport', userReportSchema);

module.exports = UserReport;
