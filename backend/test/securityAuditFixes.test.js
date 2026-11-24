const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const { isAllowedDownloadHost, isTrustedMediaUrl, generateSessionToken, hashSessionToken } = require('../security');
const { isRoomAccessAllowed } = require('../routes/messages');
const { checkPasswordRateLimit, recordFailedPasswordAttempt, resetPasswordAttempts } = require('../middleware');
const { getRoomState, deleteRoomState } = require('../state');
const User = require('../models/user');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const BlockedUser = require('../models/blockedUser');
const LoginLockdown = require('../models/loginLockdown');
const AuditLog = require('../models/auditLog');
const { handleUserJoin } = require('../websocket/presenceHandler');
const { handleNewMessage } = require('../websocket/messageHandler');

describe('Security Audit Regression Tests', () => {
  const origClientPassword = process.env.CLIENT_PASSWORD;
  const origBlockedFindOne = BlockedUser.findOne;
  const origLockdownFindOne = LoginLockdown.findOne;
  const origAuditLogCreate = AuditLog.create;
  const origUserFindOne = User.findOne;
  const origUserFindOneAndUpdate = User.findOneAndUpdate;
  const origMsgExists = Message.exists;
  const origMsgUpdateMany = Message.updateMany;
  const origMsgSave = Message.prototype.save;
  const origEventSave = MessageEvent.prototype.save;
  const origReadyStateDesc = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

  beforeEach(() => {
    BlockedUser.findOne = () => ({ lean: async () => null });
    LoginLockdown.findOne = () => ({ sort: async () => null });
    AuditLog.create = async () => ({});
  });

  afterEach(() => {
    if (origClientPassword === undefined) delete process.env.CLIENT_PASSWORD;
    else process.env.CLIENT_PASSWORD = origClientPassword;

    BlockedUser.findOne = origBlockedFindOne;
    LoginLockdown.findOne = origLockdownFindOne;
    AuditLog.create = origAuditLogCreate;
    User.findOne = origUserFindOne;
    User.findOneAndUpdate = origUserFindOneAndUpdate;
    Message.exists = origMsgExists;
    Message.updateMany = origMsgUpdateMany;
    Message.prototype.save = origMsgSave;
    MessageEvent.prototype.save = origEventSave;
    if (origReadyStateDesc) {
      Object.defineProperty(mongoose.connection, 'readyState', origReadyStateDesc);
    }
  });

  describe('isRoomAccessAllowed & query token rejection', () => {
    it('enforces CLIENT_PASSWORD on uppercase/mixed-case ME roomId and rejects query sessionToken', async () => {
      process.env.CLIENT_PASSWORD = 'super-secret-room-pw';
      const userId = 'test_user_case_check';
      const token = generateSessionToken(userId, 'me');
      const roomState = getRoomState('me');
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Tester',
        sessionToken: token,
        sessionTokenHash: hashSessionToken(token),
      });

      try {
        const unauthReq = { headers: {}, query: { roomId: 'ME', userId }, ip: '127.0.0.1' };
        assert.strictEqual(await isRoomAccessAllowed('ME', unauthReq), false);

        const queryTokenReq = { headers: {}, query: { roomId: 'me', userId, sessionToken: token }, ip: '127.0.0.1' };
        assert.strictEqual(await isRoomAccessAllowed('me', queryTokenReq), false);

        const headerTokenReq = {
          headers: { 'x-session-token': token, 'x-user-id': userId },
          query: { roomId: 'Me' },
          ip: '127.0.0.1',
        };
        assert.strictEqual(await isRoomAccessAllowed('Me', headerTokenReq), true);

        const globalReq = { headers: {}, query: { roomId: 'GLOBAL' }, ip: '127.0.0.1' };
        assert.strictEqual(await isRoomAccessAllowed('GLOBAL', globalReq), true);
      } finally {
        roomState.loggedInUsers.delete(userId);
      }
    });
  });

  describe('checkPasswordRateLimit canonicalization', () => {
    it('shares lockout state across roomId case and whitespace variations', async () => {
      const testIp = '198.51.100.42';
      let lockKey = null;

      for (let i = 0; i < 5; i++) {
        const req = {
          ip: testIp,
          headers: { 'x-room-id': i % 2 === 0 ? 'ME' : ' me ' },
          body: {},
        };
        let nextCalled = false;
        await checkPasswordRateLimit(req, { status: () => ({ json: () => {} }) }, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
        lockKey = req.passwordRateLimitKey;
        recordFailedPasswordAttempt(lockKey, req);
      }

      const blockedReq = { ip: testIp, headers: {}, body: { roomId: 'Me' } };
      let blockedStatus = null;
      let nextCalledAfterLock = false;
      await checkPasswordRateLimit(
        blockedReq,
        {
          status: (code) => {
            blockedStatus = code;
            return { json: () => {} };
          },
        },
        () => { nextCalledAfterLock = true; }
      );

      assert.strictEqual(blockedStatus, 429);
      assert.strictEqual(nextCalledAfterLock, false);
      if (lockKey) resetPasswordAttempts(lockKey);
    });
  });

  describe('Trusted CDN/GIF URL validation', () => {
    it('blocks api.cloudinary.com from download hosts and untrusted media hosts', () => {
      assert.strictEqual(isAllowedDownloadHost('res.cloudinary.com'), true);
      assert.strictEqual(isAllowedDownloadHost('media.giphy.com'), true);
      assert.strictEqual(isAllowedDownloadHost('api.cloudinary.com'), false);

      assert.strictEqual(isTrustedMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg'), true);
      assert.strictEqual(isTrustedMediaUrl('https://media2.giphy.com/media/abc/giphy.gif'), true);
      assert.strictEqual(isTrustedMediaUrl('https://evil.example.com/tracker.mp3'), false);
      assert.strictEqual(isTrustedMediaUrl('javascript:alert(1)'), false);
    });
  });

  describe('Public-room userId takeover protection', () => {
    it('rejects unauthenticated WS user_join in public room when userId has a persisted sessionTokenHash', async () => {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      User.findOne = () => ({
        select: () => ({
          lean: async () => ({ sessionTokenHash: 'persisted-hash-value' }),
        }),
      });

      const sent = [];
      const ws = {
        readyState: 1,
        send: (payload) => sent.push(JSON.parse(payload)),
        terminate: () => {},
      };
      const req = { ip: '203.0.113.10', headers: { 'user-agent': 'test-agent' } };

      await handleUserJoin({
        ws,
        req,
        parsedMessage: { type: 'user_join', roomId: 'global', userId: 'victim_user_1', username: 'Attacker' },
        wss: { clients: new Set() },
        broadcastToAdmins: () => {},
        _broadcast: () => {},
        _broadcastOnlineUsers: () => {},
        loadPinnedMessages: async () => {},
        _getVisibleMessagesQuery: () => ({}),
      });

      assert.strictEqual(ws.userId, null);
      assert.ok(sent.some((m) => m.type === 'force_logout'));
    });
  });

  describe('handleNewMessage hardening', () => {
    it('strips forged reactions/votes, rejects untrusted media URLs, and blocks clientTempId reply hijacking', async () => {
      const roomId = 'test-sec-msg-room';
      const roomState = getRoomState(roomId);
      const userId = 'sender_1';
      const token = generateSessionToken(userId, roomId);
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Sender',
        sessionToken: token,
        sessionTokenHash: hashSessionToken(token),
      });

      const savedDocs = [];
      const updateCalls = [];
      Message.prototype.save = async function () {
        savedDocs.push(this);
      };
      MessageEvent.prototype.save = async function () {};
      User.findOne = () => ({ lean: async () => ({ username: 'Sender' }) });
      Message.exists = async ({ id }) => (id?.$eq === 'existing-victim-msg-id' ? { _id: '1' } : null);
      Message.updateMany = async (filter, update) => {
        updateCalls.push({ filter, update });
      };

      const ws = {
        userId,
        username: 'Sender',
        roomId,
        sessionToken: token,
        readyState: 1,
        send: () => {},
        terminate: () => {},
      };

      // 1. Untrusted media URL must be rejected
      await handleNewMessage({
        ws,
        parsedMessage: { type: 'audio', id: 'bad-audio-1', url: 'https://attacker.example/track.mp3' },
        wss: { clients: new Set([ws]) },
        broadcastToAdmins: () => {},
        _broadcastOnlineUsers: () => {},
      });
      assert.strictEqual(savedDocs.length, 0);

      // 2. Text message with pre-stuffed reactions + clientTempId collision with existing message
      await handleNewMessage({
        ws,
        parsedMessage: {
          type: 'text',
          id: 'text-msg-1',
          clientTempId: 'existing-victim-msg-id',
          text: 'Hello',
          reactions: { '❤️': [{ userId: 'victim', username: 'Victim' }] },
        },
        wss: { clients: new Set([ws]) },
        broadcastToAdmins: () => {},
        _broadcastOnlineUsers: () => {},
      });

      assert.strictEqual(savedDocs.length, 1);
      assert.strictEqual(savedDocs[0].reactions.size, 0);
      assert.strictEqual(updateCalls.length, 0);

      deleteRoomState(roomId);
    });
  });
});
