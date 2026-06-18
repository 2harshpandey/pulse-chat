'use strict';

const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const logger = require('./logger');
const User = require('./models/user');
const Message = require('./models/message');
const MessageEvent = require('./models/messageEvent');
const AuditLog = require('./models/auditLog');
const UserReport = require('./models/userReport');
const { extractIp, generateDeviceHash, toClientMessage } = require('./middleware');
const { normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('./reactions');
const {
  onlineUsers,
  typingUsers,
  adminClients,
  pendingDisconnects,
  filePickerPresenceGrace,
  loggedInUsers,
  userFingerprints,
  INITIAL_HISTORY_BATCH_SIZE,
  MIN_REPORT_REASON_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORTED_JOIN_HISTORY,
} = require('./state');
const { isUserBlocked } = require('./middleware');
const { getVisibleMessagesQuery } = require('./routes/media');

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Send a typed message to every authenticated admin WebSocket client.
 * @param {string} type
 * @param {*} data
 */
const broadcastToAdmins = (type, data) => {
  const message = JSON.stringify({ type, data });
  logger.info(`Broadcasting to ${adminClients.size} admin client(s): ${message}`);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      logger.info(`Admin client not open. State: ${client.readyState}`);
    }
  });
};

/**
 * Broadcast the current online-users list (with typing/activity state) to
 * every connected WebSocket client.
 * @param {import('ws').WebSocketServer} wss
 */
const broadcastOnlineUsers = (wss) => {
  const users = Array.from(onlineUsers.values()).map(user => {
    const rawActivity = typingUsers.get(user.userId);
    const activity = rawActivity === 'gif_selecting' ? 'gif_selecting' : (rawActivity ? 'typing' : undefined);
    return {
      ...user,
      isTyping: Boolean(activity),
      activity,
    };
  });
  const message = JSON.stringify({ type: 'online_users', data: users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
};

/**
 * Broadcast a raw message object to every connected WebSocket client.
 * @param {import('ws').WebSocketServer} wss
 * @param {object} message
 */
const broadcast = (wss, message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// ---------------------------------------------------------------------------
// Log-file watcher
// ---------------------------------------------------------------------------

const startLogWatcher = () => {
  const logFilePath = path.join(__dirname, 'pulse-activity.log');

  // Ensure log file exists before watching
  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '');
  }

  fs.watch(logFilePath, (eventType) => {
    if (eventType === 'change') {
      fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) {
          logger.error('Failed to read log file on change:', err);
          return;
        }
        const lines = data.split('\n').slice(-200).join('\n');
        const payload = { type: 'server_logs', data: lines };
        adminClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });
      });
    }
  });
};

// ---------------------------------------------------------------------------
// initWebSocket — attach heartbeat + connection handler to the wss instance
// ---------------------------------------------------------------------------

/**
 * Initialise all WebSocket logic on the given server instance.
 *
 * Returns the three broadcast helpers so that index.js can pass them to the
 * route factories that need them.
 *
 * @param {import('ws').WebSocketServer} wss
 * @returns {{ broadcastToAdmins: Function, broadcastOnlineUsers: Function, broadcast: Function }}
 */
const initWebSocket = (wss) => {
  // Curry the helpers that need `wss` so callers don't have to pass it every time.
  const _broadcastOnlineUsers = () => broadcastOnlineUsers(wss);
  const _broadcast = (message) => broadcast(wss, message);

  // Build the curried getVisibleMessagesQuery using state's getter
  const { getFrontendHiddenBefore } = require('./state');
  const _getVisibleMessagesQuery = getVisibleMessagesQuery(getFrontendHiddenBefore);

  // --- WebSocket Heartbeat (Ping/Pong) ---
  const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) {
        logger.warn('Heartbeat: Terminating dead connection.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 10000);

  wss.on('close', function close() {
    clearInterval(heartbeatInterval);
  });

  // --- WebSocket Connection Logic ---
  wss.on('connection', (ws, req) => {
    // Heartbeat setup for the new connection
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const isAdminConnection = url.searchParams.get('admin') === 'true';

    if (isAdminConnection) {
      // Auth is done via the first WebSocket message to keep the password out of the URL (and server logs).
      ws.once('message', (rawData) => {
        try {
          const data = JSON.parse(rawData.toString());
          if (data.type === 'admin_auth' && data.password === process.env.ADMIN_PASSWORD) {
            ws.isAdmin = true;
            adminClients.add(ws);
            logger.info('An admin client authenticated and connected!');
            broadcastToAdmins('activity', 'An admin client connected to admin channel.');
            User.find().then(allDbUsers => {
              ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
            });
            // Send current logged-in users
            ws.send(JSON.stringify({ type: 'logged_in_users', data: Array.from(loggedInUsers.values()) }));
            // Send current online users
            ws.send(JSON.stringify({ type: 'online_users_admin', data: Array.from(onlineUsers.values()) }));
            ws.on('close', () => {
              adminClients.delete(ws);
              logger.info('An admin client disconnected from admin channel.');
              broadcastToAdmins('activity', 'An admin client disconnected from admin channel.');
            });
          } else {
            logger.warn('Admin auth failed: incorrect password.');
            ws.terminate();
          }
        } catch {
          ws.terminate();
        }
      });
      return;
    }

    logger.info('A new client connected!');

    ws.on('message', async (message) => {
      const parsedMessage = JSON.parse(message.toString());
      if (parsedMessage.type !== 'admin_auth') {
        logger.info('Received message:', parsedMessage);
      }

      switch (parsedMessage.type) {
        case 'user_join': {
          const { userId, username, fingerprint: fpData } = parsedMessage;
          ws.userId = userId;
          ws.username = username;

          // Collect connection fingerprint
          const wsIp = extractIp(req);
          const wsUa = req.headers['user-agent'] || '';
          ws.clientIp = wsIp;
          ws.clientUa = wsUa;

          // Store fingerprint data
          if (fpData || true) {
            const existing = userFingerprints.get(userId) || { ips: new Set(), userAgents: new Set(), deviceHashes: new Set() };
            existing.ips.add(wsIp);
            if (wsUa) existing.userAgents.add(wsUa);
            if (fpData) {
              existing.screenResolution = fpData.screenResolution || existing.screenResolution;
              existing.platform = fpData.platform || existing.platform;
              existing.language = fpData.language || existing.language;
              existing.timezone = fpData.timezone || existing.timezone;
              const hash = generateDeviceHash({ ...fpData, userAgent: wsUa });
              existing.deviceHashes.add(hash);
            }
            userFingerprints.set(userId, existing);
          }

          // Check if user is blocked (async)
          const blockResult = await isUserBlocked(userId, wsIp, wsUa, fpData);
          if (blockResult.blocked) {
            logger.warn(`Blocked user '${username}' attempted to join via WebSocket.`);
            ws.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
            await AuditLog.create({
              type: 'join_failed_blocked',
              details: { userId, username, reason: blockResult.reason, via: 'websocket' },
              ip: wsIp, userAgent: wsUa,
            });
            broadcastToAdmins('audit_log', { type: 'join_failed_blocked', details: { userId, username }, timestamp: new Date() });
            setTimeout(() => ws.terminate(), 300);
            return;
          }

          // --- Duplicate username guard (WebSocket-level, authoritative) ---
          // Check every currently-open, identified client (excluding this socket and
          // excluding a reconnect from the same userId) for a matching username.
          const trimmedLower = username.trim().toLowerCase();
          const usernameTaken = Array.from(wss.clients).some(
            client =>
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              !client.isAdmin &&
              client.username &&
              client.username.trim().toLowerCase() === trimmedLower &&
              client.userId !== userId   // same userId = reconnect/refresh, allow it
          );

          if (usernameTaken) {
            logger.warn(`Username '${username}' rejected — already in use.`);
            ws.send(JSON.stringify({
              type: 'username_taken',
              message: 'That username is already in use. Please choose a different one.',
            }));
            // Give the send buffer time to flush before terminating.
            setTimeout(() => ws.terminate(), 300);
            return;
          }
          // --- End duplicate guard ---

          if (pendingDisconnects.has(userId)) {
            clearTimeout(pendingDisconnects.get(userId));
            pendingDisconnects.delete(userId);
            logger.info(`User '${username}' rejoined (refresh).`);
          } else {
            logger.info(`User '${username}' joined.`);
            _broadcast({
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${username} has joined the chat.`,
              timestamp: new Date().toISOString(),
            });
          }

          onlineUsers.set(userId, { userId, username });

          // Also track as logged in
          if (!loggedInUsers.has(userId)) {
            loggedInUsers.set(userId, { userId, username, loginTime: new Date(), ip: ws.clientIp, userAgent: ws.clientUa });
          }

          User.findOneAndUpdate(
            { userId },
            {
              $set: { userId, username, lastSeen: new Date() },
              $push: {
                joinHistory: {
                  $each: [new Date()],
                  $slice: -100,
                },
              },
            },
            { upsert: true, new: true }
          ).catch(err => logger.error('Failed to save user:', err));

          broadcastToAdmins('user_joined', { userId, username });
          broadcastToAdmins('activity', `User '${username}' connected.`);
          broadcastToAdmins('logged_in_users', Array.from(loggedInUsers.values()));
          _broadcastOnlineUsers();

          Message.find(_getVisibleMessagesQuery()).sort({ createdAt: -1 }).limit(INITIAL_HISTORY_BATCH_SIZE + 1).lean()
            .then(messagesDesc => {
              const hasMoreHistory = messagesDesc.length > INITIAL_HISTORY_BATCH_SIZE;
              const windowDesc = hasMoreHistory
                ? messagesDesc.slice(0, INITIAL_HISTORY_BATCH_SIZE)
                : messagesDesc;
              const cleanMessages = windowDesc.reverse().map(toClientMessage);
              const oldestCreatedAt = cleanMessages.length > 0 ? cleanMessages[0].createdAt : null;
              ws.send(JSON.stringify({
                type: 'history',
                data: cleanMessages,
                hasMoreHistory,
                oldestCreatedAt,
              }));
            })
            .catch(err => logger.error('Failed to send initial history:', err));
          break;
        }
        case 'react': {
          const { messageId, userId } = parsedMessage;
          const emoji = normalizeReactionEmoji(parsedMessage.emoji);
          if (!emoji || typeof messageId !== 'string' || typeof userId !== 'string') {
            logger.warn('Rejected invalid reaction payload', { messageId, userId, emoji: parsedMessage.emoji });
            break;
          }
          const username = onlineUsers.get(userId)?.username || 'Unknown';

          // IMPORTANT: Do NOT use .lean() here.
          // The reactions field is declared as `type: Map` in the Mongoose schema.
          // .lean() returns Mongoose Map fields as JavaScript Map instances, NOT plain
          // objects. JavaScript's `for...in` loop does NOT iterate over Map entries
          // (only own enumerable properties), so the previous approach silently failed
          // to find / remove existing reactions, permanently corrupting the state of
          // any message that received a custom-emoji reaction.
          //
          // Fix: fetch the full Mongoose document and use the Map API directly
          // (.entries(), .get(), .set(), .delete()), then call markModified + save().
          const messageDoc = await Message.findOne({ id: messageId });

          if (messageDoc) {
            // Initialise the Map if the field is missing and purge any legacy/corrupt keys.
            messageDoc.reactions = toReactionMap(messageDoc.reactions);

            let previousEmoji = null;

            // Iterate using the Map API — this correctly traverses all stored entries.
            for (const [e, users] of messageDoc.reactions.entries()) {
              if (Array.isArray(users)) {
                const userIndex = users.findIndex(u => u.userId === userId);
                if (userIndex > -1) {
                  previousEmoji = e;
                  const updatedUsers = users.filter((_, i) => i !== userIndex);
                  if (updatedUsers.length === 0) {
                    messageDoc.reactions.delete(e);
                  } else {
                    messageDoc.reactions.set(e, updatedUsers);
                  }
                  break; // A user can only have one reaction at a time.
                }
              }
            }

            // If the new emoji is not a toggle-off of the same emoji, add it.
            if (previousEmoji !== emoji) {
              const existing = Array.from(messageDoc.reactions.get(emoji) || []);
              existing.push({ userId, username });
              messageDoc.reactions.set(emoji, existing);
            }

            // markModified tells Mongoose the Map changed (required for mixed/map fields).
            messageDoc.markModified('reactions');
            await messageDoc.save();

            // Build a plain-object snapshot for the WebSocket broadcast.
            // JSON.stringify on a Map instance gives '{}' — we must convert explicitly.
            // We also map each subdocument to a plain { userId, username } object
            // to avoid leaking Mongoose internals to the frontend.
            const reactionsPlain = filterValidReactions(messageDoc.reactions);

            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'update', data: { id: messageId, reactions: reactionsPlain } }));
              }
            });
          }
          break;
        }
        case 'edit': {
          const { messageId, newText } = parsedMessage;

          const msg = await Message.findOne({ id: messageId });
          if (!msg) return;
          const oldText = msg.text;

          // Update in DB
          await Message.updateOne({ id: messageId }, { $set: { text: newText, edited: true } });

          const updatedMsgForBroadcast = {
            ...msg.toObject(),
            text: newText,
            edited: true
          };

          User.findOne({ userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              type: 'edit',
              messageId,
              oldText,
              newText,
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save().catch(e => logger.error('Failed to save edit event:', e));
            broadcastToAdmins('history', event);
            broadcastToAdmins('activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${newText}"`);
          }).catch(e => logger.error('Failed to find user for edit event:', e));

          const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
          wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(updateMsg)); });
          break;
        }
        case 'file_picker_open': {
          if (ws.userId) {
            const ttlMs = Math.max(10000, Math.min(Number(parsedMessage.ttlMs) || 120000, 180000));
            filePickerPresenceGrace.set(ws.userId, Date.now() + ttlMs);
          }
          break;
        }
        case 'file_picker_close': {
          if (ws.userId) filePickerPresenceGrace.delete(ws.userId);
          break;
        }
        case 'user_logout': {
          // Explicit logout from the client — remove from loggedInUsers
          // so the admin panel's "Logged-In Sessions" list stays accurate.
          const logoutUserId = parsedMessage.userId || ws.userId;
          if (logoutUserId) {
            const logoutUser = loggedInUsers.get(logoutUserId) || onlineUsers.get(logoutUserId);
            const logoutUsername = logoutUser?.username || ws.username || 'Unknown';
            loggedInUsers.delete(logoutUserId);
            onlineUsers.delete(logoutUserId);
            typingUsers.delete(logoutUserId);
            filePickerPresenceGrace.delete(logoutUserId);
            if (pendingDisconnects.has(logoutUserId)) {
              clearTimeout(pendingDisconnects.get(logoutUserId));
              pendingDisconnects.delete(logoutUserId);
            }
            logger.info(`User '${logoutUsername}' logged out explicitly.`);
            broadcastToAdmins('user_logged_out', { userId: logoutUserId, username: logoutUsername });
            broadcastToAdmins('logged_in_users', Array.from(loggedInUsers.values()));
            broadcastToAdmins('activity', `User '${logoutUsername}' logged out.`);
            _broadcastOnlineUsers();

            // Broadcast system notification
            _broadcast({
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${logoutUsername} has left the chat.`,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        }
        case 'start_typing': {
          if (ws.userId) {
            const activity = parsedMessage.activity === 'gif_selecting' ? 'gif_selecting' : 'typing';
            typingUsers.set(ws.userId, activity);
          }
          _broadcastOnlineUsers();
          break;
        }
        case 'stop_typing': {
          if (ws.userId) typingUsers.delete(ws.userId);
          _broadcastOnlineUsers();
          break;
        }
        case 'report_user': {
          if (!ws.userId || !ws.username) {
            ws.send(JSON.stringify({ type: 'report_error', message: 'You must be connected to submit a report.' }));
            break;
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
            break;
          }

          if (reportedUserId === ws.userId) {
            ws.send(JSON.stringify({ type: 'report_error', message: 'You cannot report yourself.' }));
            break;
          }

          if (reasonRaw.length < MIN_REPORT_REASON_LENGTH) {
            ws.send(JSON.stringify({
              type: 'report_error',
              message: `Please enter at least ${MIN_REPORT_REASON_LENGTH} characters in the reason.`,
            }));
            break;
          }

          if (reasonRaw.length > MAX_REPORT_REASON_LENGTH) {
            ws.send(JSON.stringify({
              type: 'report_error',
              message: `Reason is too long. Maximum ${MAX_REPORT_REASON_LENGTH} characters.`,
            }));
            break;
          }

          try {
            const [reportedUserDoc, reportedMessage] = await Promise.all([
              User.findOne({ userId: { $eq: reportedUserId } }).lean(),
              messageId ? Message.findOne({ id: { $eq: messageId } }).lean() : Promise.resolve(null),
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
            broadcastToAdmins('user_reported', reportData);
            broadcastToAdmins('activity', `User report: '${ws.username}' reported '${reportedUsername}'.`);

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
          break;
        }
        case 'delete_for_everyone': {
          const { messageId } = parsedMessage;

          try {
            const originalMessage = await Message.findOne({ id: messageId }).lean();
            if (!originalMessage) return;

            const updatedMessage = await Message.findOneAndUpdate(
              { id: messageId },
              {
                $set: {
                  text: undefined,
                  url: undefined,
                  originalName: undefined,
                  size: undefined,
                  reactions: undefined,
                  isDeleted: true,
                  deletedBy: ws.userId
                },
                $unset: {
                  replyingTo: ""
                }
              },
              { new: true }
            ).lean();

            User.findOne({ userId: ws.userId }).then(user => {
              const username = user ? user.username : 'Unknown';
              const event = new MessageEvent({
                type: 'delete_everyone',
                messageId,
                deletedContent: originalMessage,
                userId: ws.userId,
                username,
                timestamp: new Date().toISOString(),
              });
              event.save().catch(e => logger.error('Failed to save delete event:', e));
              broadcastToAdmins('history', event);
              broadcastToAdmins('activity', `Message (ID: ${messageId}) deleted by '${username}'.`);
            }).catch(e => logger.error('Failed to find user for delete event:', e));

            const updateMsg = { type: 'update', data: updatedMessage };
            wss.clients.forEach(c => {
              if (c.readyState === WebSocket.OPEN) {
                c.send(JSON.stringify(updateMsg));
              }
            });

          } catch (err) {
            logger.error('Failed to delete message for everyone:', err);
          }
          break;
        }
        default: { // New text/media message
          if (ws.userId && typingUsers.has(ws.userId)) {
            typingUsers.delete(ws.userId);
            _broadcastOnlineUsers();
          }

          const messageDoc = new Message({
            ...parsedMessage,
            reactions: toReactionMap(parsedMessage.reactions),
            id: parsedMessage.id || Date.now().toString(),
            sender: ws.userId
          });
          
          try {
            await messageDoc.save();
          } catch (err) {
            if (err.code === 11000) {
              logger.warn(`Duplicate message id ignored: ${messageDoc.id}`);
              break;
            }
            logger.error('Failed to save message:', err);
            break;
          }

          User.findOne({ userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              type: 'create',
              message: messageDoc.toObject(),
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save().catch(e => logger.error('Failed to save message create event:', e));
            broadcastToAdmins('history', event);
            broadcastToAdmins('activity', `New message from '${username}': "${messageDoc.text || '[Media]'}"`);
          }).catch(e => logger.error('Failed to find user for message event:', e));

          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(messageDoc));
            }
          });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (ws.userId && onlineUsers.has(ws.userId)) {
        const user = onlineUsers.get(ws.userId);
        const filePickerGraceUntil = filePickerPresenceGrace.get(ws.userId) || 0;
        const disconnectDelayMs = filePickerGraceUntil > Date.now() ? 120000 : 10000;
        logger.info(`User '${user.username}' disconnected. Starting ${Math.round(disconnectDelayMs / 1000)}s timer.`);

        const timerId = setTimeout(() => {
          logger.info(`User '${user.username}' truly left.`);
          onlineUsers.delete(ws.userId);
          typingUsers.delete(ws.userId);
          filePickerPresenceGrace.delete(ws.userId);

          _broadcast({
            type: 'system_notification',
            id: `system-${Date.now()}`,
            text: `${user.username} has left the chat.`,
            timestamp: new Date().toISOString(),
          });

          _broadcastOnlineUsers();
          broadcastToAdmins('user_left', { userId: ws.userId });
          broadcastToAdmins('activity', `User '${user.username}' disconnected.`);
          pendingDisconnects.delete(ws.userId);
        }, disconnectDelayMs);

        pendingDisconnects.set(ws.userId, timerId);
      }
    });

    ws.on('error', (error) => logger.error('WebSocket Error:', { message: error.message }));
  });

  // Start the log file watcher
  startLogWatcher();

  return { broadcastToAdmins, broadcastOnlineUsers: _broadcastOnlineUsers, broadcast: _broadcast };
};

module.exports = { initWebSocket };
