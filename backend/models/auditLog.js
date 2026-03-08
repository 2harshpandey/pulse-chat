const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'user_blocked',
      'user_unblocked',
      'user_force_logged_out',
      'join_failed_blocked',
      'join_failed_lockdown',
      'join_failed_password',
      'join_failed_username_taken',
      'temp_link_created',
      'temp_link_revoked',
      'temp_link_used',
      'temp_link_expired_attempt',
      'lockdown_enabled',
      'lockdown_disabled',
    ],
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ip: {
    type: String,
    default: '',
  },
  userAgent: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

auditLogSchema.index({ type: 1 });
auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
