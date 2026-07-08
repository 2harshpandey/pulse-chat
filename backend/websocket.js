'use strict';

const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const logger = require('./logger');
const User = require('./models/user');
const Room = require('./models/room');
const Message = require('./models/message');
const MessageEvent = require('./models/messageEvent');
const AuditLog = require('./models/auditLog');
const UserReport = require('./models/userReport');
const { extractIp, generateDeviceHash, toClientMessage } = require('./middleware');
const { normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('./reactions');
const {
  roomStates,
  getRoomState,
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
 * Send a typed message to every authenticated admin WebSocket client in a room.
 */
const broadcastToAdmins = (roomId, type, data) => {
  const message = JSON.stringify({ type, data });
  const { adminClients } = getRoomState(roomId);
  logger.info(`Broadcasting to ${adminClients.size} admin client(s) in room ${roomId}: ${message}`);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      logger.info(`Admin client not open. State: ${client.readyState}`);
    }
  });
};

/**
 * Broadcast the current online-users list to every client in a room.
 */
const broadcastOnlineUsers = (wss, roomId) => {
  const { onlineUsers, typingUsers } = getRoomState(roomId);
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
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(message);
    }
  });
};

/**
 * Broadcast a raw message object to every connected client in a room.
 */
const broadcast = (wss, roomId, message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(data);
    }
  });
};

// ---------------------------------------------------------------------------
// Log-file watcher
// ---------------------------------------------------------------------------

const startLogWatcher = () => {
  const logFilePath = path.join(__dirname, 'pulse-activity.log');

  if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '');
  }

  fs.watch(logFilePath, (eventType) => {
    if (eventType === 'change') {
      fs.readFile(logFilePath, 'utf8', (err, data) => {
        if (err) return;
        const lines = data.split('\n').slice(-200).join('\n');
        const payload = { type: 'server_logs', data: lines };
        
        // Broadcast to admins in ALL rooms for server logs
        const { getRoomState } = require('./state');
        const roomStates = require('./state').roomStates;
        
        // If roomStates isn't exported, we need to iterate all clients
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
  const _broadcastOnlineUsers = (roomId) => broadcastOnlineUsers(wss, roomId);
  const _broadcast = (roomId, message) => broadcast(wss, roomId, message);

  // Build the curried getVisibleMessagesQuery using state's getter
  const _getVisibleMessagesQuery = (roomId) => {
    return getVisibleMessagesQuery(() => getRoomState(roomId).frontendHiddenBefore)();
  };

  // --- WebSocket Heartbeat (Ping/Pong) ---
  const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) {
        logger.warn('Heartbeat: Terminating dead connection.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(() => {});
      // Application-level ping for frontend connection watchdog
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    });
  }, 15000); // Ping every 15s — comfortably within the 40s frontend watchdog threshold

  wss.on('close', function close() {
    clearInterval(heartbeatInterval);
  });
  const broadcastPinnedMessages = (roomId) => {
    const state = getRoomState(roomId);
    const msg = JSON.stringify({
      type: 'pinned_messages_update',
      data: state.pinnedMessages
    });
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.roomId === roomId) {
        client.send(msg);
      }
    });
  };

  const loadPinnedMessages = async (roomId) => {
    const state = getRoomState(roomId);
    if (state.pinnedMessagesLoaded) return;
    try {
      const now = new Date();
      const pins = await Message.find({
        roomId,
        'pinned.pinnedAt': { $ne: null }
      }).sort({ 'pinned.pinnedAt': 1 }).lean();
      
      const validPins = [];
      for (const pin of pins) {
        if (pin.pinned.expiresAt && new Date(pin.pinned.expiresAt) <= now) {
          await Message.updateOne({ id: pin.id }, { $set: { pinned: null } });
        } else {
          validPins.push(toClientMessage(pin));
        }
      }
      state.pinnedMessages = validPins;
      state.pinnedMessagesLoaded = true;
    } catch (err) {
      logger.error('Failed to load pinned messages:', err);
    }
  };

  // --- Auto-Expiration Check ---
  setInterval(async () => {
    const now = new Date();
    for (const [roomId, state] of roomStates.entries()) {
      if (!state.pinnedMessagesLoaded || state.pinnedMessages.length === 0) continue;
      let expired = false;
      const updatedPins = [];
      for (const msg of state.pinnedMessages) {
        if (msg.pinned && msg.pinned.expiresAt && new Date(msg.pinned.expiresAt) <= now) {
          expired = true;
          try {
            await Message.updateOne({ id: msg.id }, { $set: { pinned: null } });
          } catch (e) {
            logger.error('Failed to unpin expired message:', e);
          }
        } else {
          updatedPins.push(msg);
        }
      }
      if (expired) {
        state.pinnedMessages = updatedPins;
        broadcastPinnedMessages(roomId);
      }
    }
  }, 30000); // Check every 30 seconds

  // --- WebSocket Connection Logic ---
  wss.on('connection', (ws, req) => {
    // Heartbeat setup for the new connection
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const isAdminConnection = url.searchParams.get('admin') === 'true';

    const setupAdmin = (ws, roomId, adminClients, loggedInUsers, onlineUsers) => {
      ws.isAdmin = true;
      ws.roomId = roomId;
      adminClients.add(ws);
      logger.info(`An admin client authenticated and connected to room ${roomId}!`);
      logger.info(`Online users snapshot for admin (room ${roomId}): ${onlineUsers.size} user(s)`);
      broadcastToAdmins(roomId, 'activity', `An admin client connected to admin channel.`);
      User.find({ roomId }).then(allDbUsers => {
        ws.send(JSON.stringify({ type: 'users', data: allDbUsers }));
      });
      loadPinnedMessages(roomId).then(() => {
        ws.send(JSON.stringify({
          type: 'pinned_messages_update',
          data: getRoomState(roomId).pinnedMessages
        }));
      });
      // Send current logged-in users
      ws.send(JSON.stringify({ type: 'logged_in_users', data: Array.from(loggedInUsers.values()) }));
      // Send current online users
      ws.send(JSON.stringify({ type: 'online_users_admin', data: Array.from(onlineUsers.values()) }));
      ws.on('close', () => {
        adminClients.delete(ws);
        logger.info(`An admin client disconnected from admin channel (room ${roomId}).`);
        broadcastToAdmins(roomId, 'activity', `An admin client disconnected from admin channel.`);
      });
    };

    if (isAdminConnection) {
      // Auth is done via the first WebSocket message to keep the password out of the URL (and server logs).
      ws.once('message', (rawData) => {
        try {
          const data = JSON.parse(rawData.toString());
          logger.info(`Admin auth attempt: roomId=${data.roomId}, type=${data.type}, hasPassword=${!!data.password}`);
          if (data.type === 'admin_auth' && data.roomId) {
            const roomId = data.roomId;
            const { adminClients, loggedInUsers, onlineUsers } = getRoomState(roomId);
            
            let isValid = false;
            if (data.password === process.env.ADMIN_PASSWORD) {
              isValid = true;
            } else {
              // we can't await easily in this sync callback, so let's do promise
              Room.findOne({ id: roomId }).then(room => {
                if (room && room.adminPassword === data.password) {
                  setupAdmin(ws, roomId, adminClients, loggedInUsers, onlineUsers);
                  ws.on('message', handleClientMessage);
                } else {
                  logger.warn(`Admin auth failed for room ${roomId}: room found=${!!room}, password match=${room ? room.adminPassword === data.password : 'N/A'}`);
                  ws.terminate();
                }
              }).catch((err) => {
                logger.error(`Admin auth DB error for room ${roomId}:`, err);
                ws.terminate();
              });
              return;
            }
            
            if (isValid) {
              setupAdmin(ws, roomId, adminClients, loggedInUsers, onlineUsers);
              ws.on('message', handleClientMessage);
            }
          } else {
            logger.warn('Admin auth failed: missing data.', { type: data.type, hasRoomId: !!data.roomId });
            ws.terminate();
          }
        } catch (err) {
          logger.error('Admin auth exception:', err);
          ws.terminate();
        }
      });
      return;
    }

    logger.info('A new client connected!');

    async function handleClientMessage(message) {
      const parsedMessage = JSON.parse(message.toString());
      if (parsedMessage.type !== 'admin_auth') {
        logger.info('Received message:', parsedMessage);
      }

      switch (parsedMessage.type) {
        case 'user_join': {
          const { userId, username, fingerprint: fpData, roomId = 'me' } = parsedMessage;
          ws.userId = userId;
          ws.username = username;
          ws.roomId = roomId;

          const { onlineUsers, loggedInUsers, pendingDisconnects, typingUsers } = getRoomState(roomId);

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
          const blockResult = await isUserBlocked(roomId, userId, wsIp, wsUa, fpData);
          if (blockResult.blocked) {
            logger.warn(`Blocked user '${username}' attempted to join room ${roomId} via WebSocket.`);
            ws.send(JSON.stringify({ type: 'force_logout', message: 'You have been blocked from this chat room.' }));
            await AuditLog.create({
              roomId,
              type: 'join_failed_blocked',
              details: { userId, username, reason: blockResult.reason, via: 'websocket' },
              ip: wsIp, userAgent: wsUa,
            });
            broadcastToAdmins(roomId, 'audit_log', { type: 'join_failed_blocked', details: { userId, username }, timestamp: new Date() });
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
              client.roomId === roomId &&
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
            logger.info(`User '${username}' rejoined room ${roomId} (refresh).`);
          } else {
            logger.info(`User '${username}' joined room ${roomId}.`);
            _broadcast(roomId, {
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${username} has joined the chat.`,
              timestamp: new Date().toISOString(),
            });
          }

          onlineUsers.set(userId, { userId, username });
          
          // Clear any lingering typing/gif_selecting status on new connection/refresh
          if (typingUsers.has(userId)) {
            typingUsers.delete(userId);
          }

          // Also track as logged in
          if (!loggedInUsers.has(userId)) {
            loggedInUsers.set(userId, { userId, username, loginTime: new Date(), ip: ws.clientIp, userAgent: ws.clientUa });
          }

          User.findOneAndUpdate(
            { roomId, userId },
            {
              $set: { roomId, userId, username, lastSeen: new Date() },
              $push: {
                joinHistory: {
                  $each: [new Date()],
                  $slice: -100,
                },
              },
            },
            { upsert: true, new: true }
          ).catch(err => logger.error('Failed to save user:', err));

          broadcastToAdmins(roomId, 'user_joined', { userId, username });
          broadcastToAdmins(roomId, 'activity', `User '${username}' connected.`);
          broadcastToAdmins(roomId, 'logged_in_users', Array.from(loggedInUsers.values()));
          _broadcastOnlineUsers(roomId);

          Message.find({ roomId, ..._getVisibleMessagesQuery(roomId) }).sort({ createdAt: -1 }).limit(INITIAL_HISTORY_BATCH_SIZE + 1).lean()
            .then(async messagesDesc => {
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

              await loadPinnedMessages(roomId);
              ws.send(JSON.stringify({
                type: 'pinned_messages_update',
                data: getRoomState(roomId).pinnedMessages
              }));
            })
            .catch(err => logger.error('Failed to send initial history:', err));
          break;
        }
        case 'react': {
          const { messageId, userId, roomId = 'me' } = parsedMessage;
          const emoji = normalizeReactionEmoji(parsedMessage.emoji);
          if (!emoji || typeof messageId !== 'string' || typeof userId !== 'string') {
            logger.warn('Rejected invalid reaction payload', { messageId, userId, emoji: parsedMessage.emoji });
            break;
          }
          const { onlineUsers } = getRoomState(roomId);
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
          const { messageId, newText, roomId = 'me' } = parsedMessage;

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

          User.findOne({ roomId, userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              roomId,
              type: 'edit',
              messageId,
              oldText,
              newText,
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save().catch(e => logger.error('Failed to save edit event:', e));
            broadcastToAdmins(roomId, 'history', event);
            broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) edited by '${username}'. New text: "${newText}"`);
          }).catch(e => logger.error('Failed to find user for edit event:', e));

          const updateMsg = { type: 'update', data: updatedMsgForBroadcast };
          wss.clients.forEach(c => { 
            if (c.readyState === WebSocket.OPEN && c.roomId === roomId) {
              c.send(JSON.stringify(updateMsg)); 
            }
          });
          break;
        }
        case 'file_picker_open': {
          if (ws.userId && ws.roomId) {
            const ttlMs = Math.max(10000, Math.min(Number(parsedMessage.ttlMs) || 120000, 180000));
            getRoomState(ws.roomId).filePickerPresenceGrace.set(ws.userId, Date.now() + ttlMs);
          }
          break;
        }
        case 'file_picker_close': {
          if (ws.userId && ws.roomId) getRoomState(ws.roomId).filePickerPresenceGrace.delete(ws.userId);
          break;
        }
        case 'user_logout': {
          // Explicit logout from the client — remove from loggedInUsers
          // so the admin panel's "Logged-In Sessions" list stays accurate.
          const logoutUserId = parsedMessage.userId || ws.userId;
          const roomId = ws.roomId || 'me';
          if (logoutUserId) {
            const { loggedInUsers, onlineUsers, typingUsers, filePickerPresenceGrace, pendingDisconnects } = getRoomState(roomId);
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
            logger.info(`User '${logoutUsername}' logged out explicitly from room ${roomId}.`);
            broadcastToAdmins(roomId, 'user_logged_out', { userId: logoutUserId, username: logoutUsername });
            broadcastToAdmins(roomId, 'logged_in_users', Array.from(loggedInUsers.values()));
            broadcastToAdmins(roomId, 'activity', `User '${logoutUsername}' logged out.`);
            _broadcastOnlineUsers(roomId);

            // Broadcast system notification
            _broadcast(roomId, {
              type: 'system_notification',
              id: `system-${Date.now()}`,
              text: `${logoutUsername} has left the chat.`,
              timestamp: new Date().toISOString(),
            });
          }
          break;
        }
        case 'start_typing': {
          if (ws.userId && ws.roomId) {
            const activity = parsedMessage.activity === 'gif_selecting' ? 'gif_selecting' : 'typing';
            getRoomState(ws.roomId).typingUsers.set(ws.userId, activity);
            _broadcastOnlineUsers(ws.roomId);
          }
          break;
        }
        case 'stop_typing': {
          if (ws.userId && ws.roomId) {
            getRoomState(ws.roomId).typingUsers.delete(ws.userId);
            _broadcastOnlineUsers(ws.roomId);
          }
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

          const roomId = ws.roomId || 'me';
          const { onlineUsers, loggedInUsers } = getRoomState(roomId);
          try {
            const [reportedUserDoc, reportedMessage] = await Promise.all([
              User.findOne({ roomId, userId: { $eq: reportedUserId } }).lean(),
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
          break;
        }
        case 'pin_message': {
          logger.info(`Received pin_message:`, parsedMessage);
          if (!ws.isAdmin) {
            logger.warn('Pin failed: not an admin');
            return;
          }
          const { messageId, durationMs, replaceOldest } = parsedMessage;
          const roomId = ws.roomId || 'me';
          try {
            const msg = await Message.findOne({ id: messageId }).lean();
            if (!msg) {
              logger.warn(`Pin failed: message not found in DB for ID ${messageId}`);
              return;
            }
            logger.info(`Pinning message found in DB: ${msg.id}`);

            const state = getRoomState(roomId);
            await loadPinnedMessages(roomId);

            if (state.pinnedMessages.length >= 4 && !replaceOldest) {
              ws.send(JSON.stringify({ type: 'pin_error', message: 'Maximum 4 pinned messages allowed.' }));
              return;
            }

            if (state.pinnedMessages.length >= 4 && replaceOldest) {
              const oldestMsg = state.pinnedMessages[0];
              await Message.updateOne({ id: oldestMsg.id }, { $set: { pinned: null } });
              state.pinnedMessages.shift(); // Remove oldest
            }

            const pinnedAt = new Date();
            const expiresAt = durationMs ? new Date(pinnedAt.getTime() + durationMs) : null;
            const pinnedObj = { pinnedAt, expiresAt };

            await Message.updateOne({ id: messageId }, { $set: { pinned: pinnedObj } });
            
            const updatedMsg = { ...msg, pinned: pinnedObj };
            state.pinnedMessages.push(toClientMessage(updatedMsg));
            broadcastPinnedMessages(roomId);
          } catch (error) {
            logger.error('Failed to pin message:', error);
          }
          break;
        }
        case 'unpin_message': {
          if (!ws.isAdmin) return;
          const { messageId } = parsedMessage;
          const roomId = ws.roomId || 'me';
          try {
            await Message.updateOne({ id: messageId }, { $set: { pinned: null } });
            const state = getRoomState(roomId);
            state.pinnedMessages = state.pinnedMessages.filter(m => m.id !== messageId);
            broadcastPinnedMessages(roomId);
          } catch (error) {
            logger.error('Failed to unpin message:', error);
          }
          break;
        }
        case 'delete_for_everyone': {
          const { messageId, roomId = 'me' } = parsedMessage;

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

            User.findOne({ roomId, userId: ws.userId }).then(user => {
              const username = user ? user.username : 'Unknown';
              const event = new MessageEvent({
                roomId,
                type: 'delete_everyone',
                messageId,
                deletedContent: originalMessage,
                userId: ws.userId,
                username,
                timestamp: new Date().toISOString(),
              });
              event.save().catch(e => logger.error('Failed to save delete event:', e));
              broadcastToAdmins(roomId, 'history', event);
              broadcastToAdmins(roomId, 'activity', `Message (ID: ${messageId}) deleted by '${username}'.`);
            }).catch(e => logger.error('Failed to find user for delete event:', e));

            const updateMsg = { type: 'update', data: updatedMessage };
            wss.clients.forEach(c => {
              if (c.readyState === WebSocket.OPEN && c.roomId === roomId) {
                c.send(JSON.stringify(updateMsg));
              }
            });

          } catch (err) {
            logger.error('Failed to delete message for everyone:', err);
          }
          break;
        }
        default: { // New text/media message
          const roomId = ws.roomId || 'me';
          const { typingUsers } = getRoomState(roomId);
          if (ws.userId && typingUsers.has(ws.userId)) {
            typingUsers.delete(ws.userId);
            _broadcastOnlineUsers(roomId);
          }

          const messageDoc = new Message({
            ...parsedMessage,
            roomId,
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

          User.findOne({ roomId, userId: ws.userId }).then(user => {
            const username = user ? user.username : 'Unknown';
            const event = new MessageEvent({
              roomId,
              type: 'create',
              message: messageDoc.toObject(),
              userId: ws.userId,
              username,
              timestamp: new Date().toISOString(),
            });
            event.save().catch(e => logger.error('Failed to save message create event:', e));
            broadcastToAdmins(roomId, 'history', event);
            broadcastToAdmins(roomId, 'activity', `New message from '${username}': "${messageDoc.text || '[Media]'}"`);
          }).catch(e => logger.error('Failed to find user for message event:', e));

          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.roomId === roomId) {
              client.send(JSON.stringify(messageDoc));
            }
          });
          break;
        }
      }
    };

    if (!isAdminConnection) {
      ws.on('message', handleClientMessage);
    }

    ws.on('close', () => {
      const roomId = ws.roomId || 'me';
      const { onlineUsers, typingUsers, filePickerPresenceGrace, pendingDisconnects } = getRoomState(roomId);
      if (ws.userId && onlineUsers.has(ws.userId)) {
        // If the user has another active tab/connection, they are not actually leaving.
        // Don't start a disconnect timer or broadcast a leave event.
        const hasOtherActiveSocket = Array.from(wss.clients).some(
          client => client !== ws && client.readyState === 1 && client.roomId === roomId && client.userId === ws.userId
        );
        if (hasOtherActiveSocket) {
          return;
        }

        const user = onlineUsers.get(ws.userId);
        const filePickerGraceUntil = filePickerPresenceGrace.get(ws.userId) || 0;
        const disconnectDelayMs = filePickerGraceUntil > Date.now() ? 120000 : 10000;
        logger.info(`User '${user.username}' disconnected. Starting ${Math.round(disconnectDelayMs / 1000)}s timer.`);

        const timerId = setTimeout(() => {
          logger.info(`User '${user.username}' truly left.`);
          onlineUsers.delete(ws.userId);
          typingUsers.delete(ws.userId);
          filePickerPresenceGrace.delete(ws.userId);

          _broadcast(roomId, {
            type: 'system_notification',
            id: `system-${Date.now()}`,
            text: `${user.username} has left the chat.`,
            timestamp: new Date().toISOString(),
          });

          _broadcastOnlineUsers(roomId);
          broadcastToAdmins(roomId, 'user_left', { userId: ws.userId });
          broadcastToAdmins(roomId, 'activity', `User '${user.username}' disconnected.`);
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
