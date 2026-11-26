'use strict';

const logger = require('../logger');
const User = require('../models/user');
const Message = require('../models/message');
const UserReport = require('../models/userReport');
const {
  getRoomState,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
} = require('../state');

const userReportCooldowns = new Map();

// Periodic cooldown cleanup to avoid stale userId entries staying in RAM forever
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [uid, ts] of userReportCooldowns.entries()) {
      if (ts < cutoff) userReportCooldowns.delete(uid);
    }
  }, 60 * 60 * 1000).unref();
}

/**
 * Handles user moderation reports over WebSocket with per-user cooldown enforcement.
 */
const handleReportUser = async ({ ws, parsedMessage, broadcastToAdmins }) => {
  if (!ws.userId || !ws.username) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'You must be connected to submit a report.' }));
    return;
  }

  const now = Date.now();
  const lastReportTime = userReportCooldowns.get(ws.userId) || 0;
  if (now - lastReportTime < 30000) {
    const remainingSec = Math.ceil((30000 - (now - lastReportTime)) / 1000);
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Please wait ${remainingSec} seconds before submitting another report.`,
    }));
    return;
  }

  const reportedUserId = typeof parsedMessage.reportedUserId === 'string'
    ? parsedMessage.reportedUserId.trim()
    : '';
  const fallbackReportedUsername = typeof parsedMessage.reportedUsername === 'string'
    ? parsedMessage.reportedUsername.trim()
    : '';
  const messageId = typeof parsedMessage.messageId === 'string'
    ? parsedMessage.messageId.trim()
    : '';
  const reasonRaw = typeof parsedMessage.reason === 'string'
    ? parsedMessage.reason.replace(/\s+/g, ' ').trim()
    : '';

  if (!reportedUserId) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'Missing reported user.' }));
    return;
  }

  if (reportedUserId === ws.userId) {
    ws.send(JSON.stringify({ type: 'report_error', message: 'You cannot report yourself.' }));
    return;
  }

  if (reasonRaw.length < MIN_REPORT_REASON_LENGTH) {
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Please enter at least ${MIN_REPORT_REASON_LENGTH} characters in the reason.`,
    }));
    return;
  }

  if (reasonRaw.length > MAX_REPORT_REASON_LENGTH) {
    ws.send(JSON.stringify({
      type: 'report_error',
      message: `Reason is too long. Maximum ${MAX_REPORT_REASON_LENGTH} characters.`,
    }));
    return;
  }

  userReportCooldowns.set(ws.userId, now);

  const roomId = ws.roomId || 'me';
  const { onlineUsers, loggedInUsers } = getRoomState(roomId);
  try {
    const [reportedUserDoc, reportedMessage] = await Promise.all([
      User.findOne({ roomId, userId: { $eq: reportedUserId } }).lean(),
      messageId ? Message.findOne({ roomId, id: { $eq: messageId } }).lean() : Promise.resolve(null),
    ]);

    const reportedUsername = reportedUserDoc?.username
      || onlineUsers.get(reportedUserId)?.username
      || fallbackReportedUsername
      || 'Unknown';

    const sessionInfo = loggedInUsers.get(reportedUserId);
    const sessionLoginTime = sessionInfo?.loginTime ? new Date(sessionInfo.loginTime) : null;
    const sessionDurationMs = sessionLoginTime
      ? Math.max(0, Date.now() - sessionLoginTime.getTime())
      : null;

    const joinHistory = Array.isArray(reportedUserDoc?.joinHistory)
      ? reportedUserDoc.joinHistory
          .map((d) => new Date(d))
          .filter((d) => !Number.isNaN(d.getTime()))
          .slice(-MAX_REPORTED_JOIN_HISTORY)
      : [];

    const report = await UserReport.create({
      roomId,
      reporterUserId: ws.userId,
      reporterUsername: ws.username,
      reporterIp: ws.clientIp || '',
      reporterUserAgent: ws.clientUa || '',
      reportedUserId,
      reportedUsername,
      reason: reasonRaw,
      messageId: reportedMessage?.id || messageId,
      messageType: reportedMessage?.type || parsedMessage.messageType || 'text',
      messageText: reportedMessage?.text || '',
      messageUrl: reportedMessage?.url || '',
      messageTimestamp: reportedMessage?.timestamp ? new Date(reportedMessage.timestamp) : null,
      reportedUserJoinedAt: reportedUserDoc?.createdAt ? new Date(reportedUserDoc.createdAt) : null,
      reportedUserLastSeen: reportedUserDoc?.lastSeen ? new Date(reportedUserDoc.lastSeen) : null,
      reportedUserCurrentSessionLoginTime: sessionLoginTime,
      reportedUserCurrentSessionDurationMs: sessionDurationMs,
      reportedUserIsOnline: onlineUsers.has(reportedUserId),
      reportedUserJoinHistory: joinHistory,
      reportedAt: new Date(),
    });

    const reportData = typeof report.toObject === 'function' ? report.toObject() : report;
    broadcastToAdmins(roomId, 'user_reported', reportData);
    broadcastToAdmins(roomId, 'activity', `User report: '${ws.username}' reported '${reportedUsername}'.`);

    ws.send(JSON.stringify({
      type: 'report_submitted',
      data: {
        reportId: reportData._id,
        reportedUserId,
        reportedUsername,
      },
    }));
  } catch (error) {
    logger.error('Failed to save user report:', { message: error.message, stack: error.stack });
    ws.send(JSON.stringify({
      type: 'report_error',
      message: 'Failed to submit report. Please try again.',
    }));
  }
};

module.exports = {
  handleReportUser,
};
