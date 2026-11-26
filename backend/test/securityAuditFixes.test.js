const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const { isAllowedDownloadHost, isTrustedMediaUrl, generateSessionToken, hashSessionToken, hashPassword, hashPasswordAsync, verifyPasswordAsync } = require('../security');
const { isRoomAccessAllowed } = require('../roomAccess');
const { resolveAuthenticatedUserId } = require('../routes/auth');
const linkPreviewRouter = require('../routes/linkPreview');
const {
  checkPasswordRateLimit,
  recordFailedPasswordAttempt,
  resetPasswordAttempts,
  resetAdminAttemptsAcrossScope,
  getAdminLockRemainingSeconds,
  getGlobalAdminLockKey,
  generateDeviceHash,
  adminAuth,
  isPasswordLocked,
} = require('../middleware');
const { getRoomState, deleteRoomState, userFingerprints } = require('../state');
const User = require('../models/user');
const Message = require('../models/message');
const MessageEvent = require('../models/messageEvent');
const BlockedUser = require('../models/blockedUser');
const LoginLockdown = require('../models/loginLockdown');
const AuditLog = require('../models/auditLog');
const { handleUserJoin } = require('../websocket/presenceHandler');
const { handleNewMessage, handleDeleteForEveryone } = require('../websocket/messageHandler');
const cloudinary = require('cloudinary').v2;
const { extractMediaRecordsFromEvents, batchDeleteCloudinaryAssets } = require('../security');

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

  describe('Upload session enforcement & admin header lockout in isRoomAccessAllowed', () => {
    it('requires a valid user session on global/public rooms when requireSession=true', async () => {
      const userId = 'upload_tester_1';
      const token = generateSessionToken(userId, 'global');
      const roomState = getRoomState('global');
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Uploader',
        sessionToken: token,
        sessionTokenHash: hashSessionToken(token),
      });

      try {
        const unauthReq = { headers: { 'x-user-id': userId }, query: { roomId: 'global' }, ip: '198.51.100.77' };
        assert.strictEqual(await isRoomAccessAllowed('global', unauthReq, { requireSession: true }), false);

        const spoofedUserReq = {
          headers: { 'x-user-id': 'victim_other_user', 'x-session-token': token },
          query: { roomId: 'global' },
          ip: '198.51.100.77',
        };
        assert.strictEqual(await isRoomAccessAllowed('global', spoofedUserReq, { requireSession: true }), false);

        const validReq = {
          headers: { 'x-user-id': userId, 'x-session-token': token },
          query: { roomId: 'global' },
          ip: '198.51.100.77',
        };
        assert.strictEqual(await isRoomAccessAllowed('global', validReq, { requireSession: true }), true);
      } finally {
        roomState.loggedInUsers.delete(userId);
      }
    });

    it('locks out repeated invalid x-admin-password attempts after 3 failures', async () => {
      const origAdminPw = process.env.ADMIN_PASSWORD;
      const origClientPw = process.env.CLIENT_PASSWORD;
      process.env.ADMIN_PASSWORD = 'correct-super-admin-password';
      process.env.CLIENT_PASSWORD = 'room-client-password';
      const attackerIp = '198.51.100.88';
      const lockKey = `${attackerIp}_me`;

      try {
        resetPasswordAttempts(lockKey);

        for (let i = 0; i < 3; i++) {
          const badReq = {
            headers: { 'x-admin-password': `wrong-guess-${i}` },
            query: { roomId: 'me' },
            ip: attackerIp,
          };
          assert.strictEqual(await isRoomAccessAllowed('me', badReq), false);
        }

        assert.ok(isPasswordLocked(lockKey) > 0);

        // Even the real password must be rejected while locked out
        const realWhileLockedReq = {
          headers: { 'x-admin-password': 'correct-super-admin-password' },
          query: { roomId: 'me' },
          ip: attackerIp,
        };
        assert.strictEqual(await isRoomAccessAllowed('me', realWhileLockedReq), false);

        // After resetting lockout, valid scrypt or super-admin password works again
        resetAdminAttemptsAcrossScope(lockKey, attackerIp);
        assert.strictEqual(await isRoomAccessAllowed('me', realWhileLockedReq), true);
        assert.ok(hashPassword('room-secret-123').startsWith('scrypt$'));
      } finally {
        resetAdminAttemptsAcrossScope(lockKey, attackerIp);
        if (origAdminPw === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = origAdminPw;
        if (origClientPw === undefined) delete process.env.CLIENT_PASSWORD;
        else process.env.CLIENT_PASSWORD = origClientPw;
      }
    });
  });

  describe('Offline and pendingDisconnects userId takeover guard in auth verification', () => {
    it('prevents hijacking an offline userId with persisted sessionTokenHash and preserves owner access', async () => {
      const roomId = 'global';
      const victimId = 'victim_offline_user';
      const victimToken = generateSessionToken(victimId, roomId);
      const victimHash = hashSessionToken(victimToken);
      const roomState = getRoomState(roomId);
      roomState.onlineUsers.delete(victimId);
      roomState.loggedInUsers.delete(victimId);

      User.findOne = () => ({
        select: () => ({
          lean: async () => ({ sessionTokenHash: victimHash }),
        }),
      });

      // 1. Unauthenticated caller attempting to claim victimId must NOT receive victimId
      const attackerCheck = await resolveAuthenticatedUserId({
        userId: victimId,
        roomId,
        roomState,
        incomingToken: null,
      });
      assert.strictEqual(attackerCheck.conflict, false);
      assert.notStrictEqual(attackerCheck.userId, victimId);
      assert.match(attackerCheck.userId, /^[a-zA-Z0-9_-]{1,64}$/);

      // 2. Genuine owner with matching sessionToken keeps victimId
      const ownerCheck = await resolveAuthenticatedUserId({
        userId: victimId,
        roomId,
        roomState,
        incomingToken: victimToken,
      });
      assert.strictEqual(ownerCheck.conflict, false);
      assert.strictEqual(ownerCheck.userId, victimId);

      // 3. Victim in pendingDisconnects (refreshing) is protected with conflict=true against attacker
      roomState.onlineUsers.set(victimId, { userId: victimId, username: 'Victim' });
      roomState.pendingDisconnects.set(victimId, setTimeout(() => {}, 10000));
      roomState.loggedInUsers.set(victimId, {
        userId: victimId,
        username: 'Victim',
        sessionToken: victimToken,
        sessionTokenHash: victimHash,
      });

      const pendingHijackCheck = await resolveAuthenticatedUserId({
        userId: victimId,
        roomId,
        roomState,
        incomingToken: null,
      });
      assert.strictEqual(pendingHijackCheck.conflict, true);

      clearTimeout(roomState.pendingDisconnects.get(victimId));
      roomState.pendingDisconnects.delete(victimId);
      roomState.onlineUsers.delete(victimId);
      roomState.loggedInUsers.delete(victimId);
    });
  });

  describe('Round 2 hardening regressions (async scrypt, cross-room admin lock, picker grace, preview cache)', () => {
    it('hashes and verifies scrypt passwords asynchronously via hashPasswordAsync & verifyPasswordAsync', async () => {
      const hashed = await hashPasswordAsync('correct-horse-battery');
      assert.ok(hashed && hashed.startsWith('scrypt$'));
      assert.strictEqual(await verifyPasswordAsync('correct-horse-battery', hashed), true);
      assert.strictEqual(await verifyPasswordAsync('wrong-password', hashed), false);
    });

    it('enforces global admin lockout across distinct/non-existent room IDs in adminAuth', async () => {
      const origAdminPw = process.env.ADMIN_PASSWORD;
      process.env.ADMIN_PASSWORD = 'super-admin-secret-pw';
      const Room = require('../models/room');
      const origFindByIdOrAlias = Room.findByIdOrAlias;
      Room.findByIdOrAlias = async () => null;
      const attackerIp = '198.51.100.199';

      try {
        resetAdminAttemptsAcrossScope(`${attackerIp}_me`, attackerIp);

        for (let i = 0; i < 3; i++) {
          let statusCode = null;
          const req = {
            headers: { 'x-admin-password': `guess-${i}`, 'x-room-id': `fake-room-${i}` },
            ip: attackerIp,
          };
          const res = {
            status: (code) => {
              statusCode = code;
              return { json: () => {} };
            },
          };
          await adminAuth(req, res, () => {
            assert.fail('next() should not run for wrong admin password');
          });
          assert.strictEqual(statusCode, 401);
          resetPasswordAttempts(`${attackerIp}_fake-room-${i}`);
        }

        assert.ok(getAdminLockRemainingSeconds(`${attackerIp}_me`, attackerIp) > 0);
        assert.ok(isPasswordLocked(getGlobalAdminLockKey(attackerIp)) > 0);

        let lockedStatus = null;
        await adminAuth(
          { headers: { 'x-admin-password': 'super-admin-secret-pw', 'x-room-id': 'me' }, ip: attackerIp },
          { status: (c) => { lockedStatus = c; return { json: () => {} }; } },
          () => assert.fail('next() must be blocked while globally admin-locked')
        );
        assert.strictEqual(lockedStatus, 429);
      } finally {
        Room.findByIdOrAlias = origFindByIdOrAlias;
        resetAdminAttemptsAcrossScope(`${attackerIp}_me`, attackerIp);
        if (origAdminPw === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = origAdminPw;
      }
    });

    it('blocks userId reclaim via forgeable device fingerprint during filePickerPresenceGrace without sessionToken', async () => {
      const roomId = 'test-picker-grace-room';
      const roomState = getRoomState(roomId);
      const victimId = 'victim_picker_1';
      const victimToken = generateSessionToken(victimId, roomId);
      const ua = 'Mozilla/5.0 Chrome/131.0.0.0';
      const fp = { screenResolution: '1920x1080', platform: 'Win32', language: 'en-US', timezone: 'UTC' };
      const devHash = generateDeviceHash({ ...fp, userAgent: ua });

      roomState.onlineUsers.set(victimId, { userId: victimId, username: 'Alice' });
      roomState.filePickerPresenceGrace.set(victimId, Date.now() + 60000);
      roomState.loggedInUsers.set(victimId, {
        userId: victimId,
        username: 'Alice',
        sessionToken: victimToken,
        sessionTokenHash: hashSessionToken(victimToken),
      });
      userFingerprints.set(victimId, {
        ips: new Set(['203.0.113.5']),
        userAgents: new Set([ua]),
        deviceHashes: new Set([devHash]),
      });

      try {
        const spoofedResult = await resolveAuthenticatedUserId({
          userId: victimId,
          roomId,
          roomState,
          incomingToken: null,
          fingerprint: fp,
          userAgent: ua,
        });
        assert.strictEqual(spoofedResult.conflict, true);

        const legitimateResult = await resolveAuthenticatedUserId({
          userId: victimId,
          roomId,
          roomState,
          incomingToken: victimToken,
          fingerprint: fp,
          userAgent: ua,
        });
        assert.strictEqual(legitimateResult.conflict, false);
        assert.strictEqual(legitimateResult.userId, victimId);
      } finally {
        userFingerprints.delete(victimId);
        deleteRoomState(roomId);
      }
    });

    it('namespaces link preview cache keys by roomId and preserves URL query parameters', () => {
      const keyRoomA1 = linkPreviewRouter.getPreviewCacheKey('https://www.youtube.com/watch?v=SECRET_1', 'roomA');
      const keyRoomA2 = linkPreviewRouter.getPreviewCacheKey('https://www.youtube.com/watch?v=PUBLIC_2', 'roomA');
      const keyGlobal = linkPreviewRouter.getPreviewCacheKey('https://www.youtube.com/watch?v=SECRET_1', 'global');

      assert.notStrictEqual(keyRoomA1, keyRoomA2);
      assert.notStrictEqual(keyRoomA1, keyGlobal);
      assert.ok(keyRoomA1.includes('v=SECRET_1'));
      assert.ok(keyRoomA1.startsWith('roomA:'));
    });

    it('emits retryable error instead of force_logout on transient DB error during private-room cross-restart auth', async () => {
      process.env.CLIENT_PASSWORD = 'super-secret-room-pw';
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      const userId = 'transient_db_user';
      const token = generateSessionToken(userId, 'me');
      User.findOne = () => ({
        lean: async () => {
          throw new Error('ECONNRESET: transient Mongo socket drop');
        },
      });

      const sent = [];
      const ws = {
        readyState: 1,
        send: (payload) => sent.push(JSON.parse(payload)),
        terminate: () => {},
      };
      const req = { ip: '203.0.113.11', headers: { 'user-agent': 'test-agent' } };

      await handleUserJoin({
        ws,
        req,
        parsedMessage: { type: 'user_join', roomId: 'me', userId, username: 'Harsh', sessionToken: token },
        wss: { clients: new Set() },
        broadcastToAdmins: () => {},
        _broadcast: () => {},
        _broadcastOnlineUsers: () => {},
        loadPinnedMessages: async () => {},
        _getVisibleMessagesQuery: () => ({}),
      });

      assert.strictEqual(sent.some((m) => m.type === 'force_logout'), false);
      assert.ok(sent.some((m) => m.type === 'error' && !/authentication required/i.test(m.message)));
    });

    it('authenticates across restart using bounded sessionTokenHashes history when another device refreshed', async () => {
      process.env.CLIENT_PASSWORD = 'super-secret-room-pw';
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      const userId = 'multi_device_user';
      const deviceAToken = generateSessionToken(userId, 'me');
      const deviceBToken = generateSessionToken(userId, 'me');
      const deviceAHash = hashSessionToken(deviceAToken);
      const deviceBHash = hashSessionToken(deviceBToken);

      User.findOne = () => ({
        lean: async () => ({
          _id: 'mock_user_id',
          roomId: 'me',
          userId,
          username: 'Harsh',
          sessionTokenHash: deviceBHash,
          sessionTokenHashes: [deviceAHash, deviceBHash],
        }),
      });
      User.findOneAndUpdate = () => Promise.resolve({});
      BlockedUser.findOne = () => ({ lean: async () => null });
      LoginLockdown.findOne = () => ({ sort: async () => null });
      const origMsgFind = Message.find;
      Message.find = () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [],
          }),
        }),
      });

      const sent = [];
      const ws = {
        readyState: 1,
        send: (payload) => sent.push(JSON.parse(payload)),
        terminate: () => {},
      };
      const req = { ip: '203.0.113.12', headers: { 'user-agent': 'test-agent' } };

      try {
        await handleUserJoin({
          ws,
          req,
          parsedMessage: { type: 'user_join', roomId: 'me', userId, username: 'Harsh', sessionToken: deviceAToken },
          wss: { clients: new Set() },
          broadcastToAdmins: () => {},
          _broadcast: () => {},
          _broadcastOnlineUsers: () => {},
          loadPinnedMessages: async () => {},
          _getVisibleMessagesQuery: () => ({}),
        });

        assert.ok(sent.some((m) => m.type === 'auth_success'));
        assert.strictEqual(sent.some((m) => m.type === 'force_logout'), false);
      } finally {
        Message.find = origMsgFind;
        getRoomState('me').loggedInUsers.delete(userId);
        getRoomState('me').onlineUsers.delete(userId);
      }
    });

    it('accepts multi-device sessionTokenHashes inside isSocketSessionValid during handleNewMessage', async () => {
      const roomId = 'test-multidevice-msg-room';
      const roomState = getRoomState(roomId);
      const userId = 'multi_device_msg_user';
      const tokenDevice1 = generateSessionToken(userId, roomId);
      const tokenDevice2 = generateSessionToken(userId, roomId);
      const hashDevice1 = hashSessionToken(tokenDevice1);
      const hashDevice2 = hashSessionToken(tokenDevice2);

      // Device 2 logged in later, updating active sessionTokenHash while preserving hashDevice1 in sessionTokenHashes
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Harsh',
        sessionToken: tokenDevice2,
        sessionTokenHash: hashDevice2,
      });

      const savedDocs = [];
      Message.prototype.save = async function () {
        savedDocs.push(this);
      };
      MessageEvent.prototype.save = async function () {};
      User.findOne = () => ({
        lean: async () => ({
          username: 'Harsh',
          sessionTokenHash: hashDevice2,
          sessionTokenHashes: [hashDevice1, hashDevice2],
        }),
      });

      const sent = [];
      const ws = {
        userId,
        username: 'Harsh',
        roomId,
        sessionToken: tokenDevice1,
        readyState: 1,
        send: (payload) => sent.push(JSON.parse(payload)),
        terminate: () => {},
      };

      try {
        await handleNewMessage({
          ws,
          parsedMessage: { type: 'text', id: 'multi-dev-msg-1', text: 'Hello from device 1' },
          wss: { clients: new Set([ws]) },
          broadcastToAdmins: () => {},
          _broadcastOnlineUsers: () => {},
        });
        assert.strictEqual(savedDocs.length, 1);
        assert.strictEqual(sent.some((m) => m.type === 'force_logout'), false);
      } finally {
        deleteRoomState(roomId);
      }
    });

    it('aborts handleUserJoin cleanly if socket closes before async DB checks complete', async () => {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      const roomId = 'global';
      const userId = 'mid_join_disconnect_user';

      const ws = {
        readyState: 1,
        send: () => {},
        terminate: () => {},
      };
      BlockedUser.findOne = () => ({
        lean: async () => {
          // Simulate client disconnecting while async DB check is in flight
          ws.readyState = 3;
          return null;
        },
      });
      LoginLockdown.findOne = () => ({ sort: async () => null });
      User.findOne = () => ({ select: () => ({ lean: async () => null }) });

      await handleUserJoin({
        ws,
        req: { ip: '203.0.113.15', headers: { 'user-agent': 'test-agent' } },
        parsedMessage: { type: 'user_join', roomId, userId, username: 'EphemeralUser' },
        wss: { clients: new Set() },
        broadcastToAdmins: () => {},
        _broadcast: () => {},
        _broadcastOnlineUsers: () => {},
        loadPinnedMessages: async () => {},
        _getVisibleMessagesQuery: () => ({}),
      });

      assert.strictEqual(getRoomState(roomId).onlineUsers.has(userId), false);
    });

    it('exports getClientIp from middleware.js for rate limiters', () => {
      const middleware = require('../middleware');
      assert.strictEqual(typeof middleware.getClientIp, 'function');
    });

    it('drops Object.prototype keys in filterValidReactions without throwing', () => {
      const { filterValidReactions, normalizeReactionEmoji } = require('../reactions');
      assert.strictEqual(normalizeReactionEmoji('constructor'), null);
      assert.strictEqual(normalizeReactionEmoji('__proto__'), null);
      assert.strictEqual(normalizeReactionEmoji('👍'), '👍');

      const sanitized = filterValidReactions({
        constructor: [{ userId: 'u1', username: 'Alice' }],
        toString: [{ userId: 'u2', username: 'Bob' }],
        '👍': [{ userId: 'u3', username: 'Carol' }],
      });
      assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'constructor'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'toString'), false);
      assert.deepStrictEqual(sanitized['👍'], [{ userId: 'u3', username: 'Carol' }]);
    });

    it('redacts text/url/originalName in toPublicClientMessage when isDeleted is true while keeping admin toClientMessage intact', () => {
      const { toClientMessage, toPublicClientMessage } = require('../middleware');
      const hiddenDoc = {
        id: 'm_hidden_1',
        roomId: 'me',
        userId: 'u1',
        username: 'Alice',
        type: 'file',
        text: 'secret text',
        url: 'https://res.cloudinary.com/demo/raw/upload/secret.pdf',
        originalName: 'secret.pdf',
        size: 1024,
        isDeleted: true,
        deletedBy: 'admin',
      };

      const adminView = toClientMessage(hiddenDoc);
      assert.strictEqual(adminView.text, 'secret text');
      assert.strictEqual(adminView.url, hiddenDoc.url);

      const clientView = toPublicClientMessage(hiddenDoc);
      assert.strictEqual(clientView.isDeleted, true);
      assert.strictEqual(clientView.deletedBy, 'admin');
      assert.strictEqual(clientView.text, undefined);
      assert.strictEqual(clientView.url, undefined);
      assert.strictEqual(clientView.originalName, undefined);
      assert.strictEqual(clientView.size, undefined);
    });

    it('rejects revoked HMAC session tokens in resolveAuthenticatedUserId when session changed', async () => {
      const roomId = 'test_revoked_hmac_room';
      const userId = 'revoked_victim';
      const revokedToken = generateSessionToken(userId, roomId);
      const currentToken = generateSessionToken(userId, roomId);
      const roomState = getRoomState(roomId);
      roomState.onlineUsers.set(userId, { userId, username: 'Victim' });
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Victim',
        sessionToken: currentToken,
        sessionTokenHash: hashSessionToken(currentToken),
      });

      try {
        const res = await resolveAuthenticatedUserId({
          userId,
          roomId,
          roomState,
          incomingToken: revokedToken,
        });
        assert.strictEqual(res.conflict, true);
      } finally {
        deleteRoomState(roomId);
      }
    });

    it('preserves Cloudinary media on user delete_for_everyone for admin playback while redacting chat tombstone and purging on permanent admin delete', async () => {
      const roomId = 'me';
      const userId = 'voice_sender_1';
      const token = generateSessionToken(userId, roomId);
      const roomState = getRoomState(roomId);
      roomState.loggedInUsers.set(userId, {
        userId,
        username: 'Khushu',
        sessionToken: token,
        sessionTokenHash: hashSessionToken(token),
      });

      const voiceUrl = 'https://res.cloudinary.com/demo/video/upload/v1795689208/pulse-chat/voice-message-123.webm';
      const originalMsg = {
        _id: 'mongo_voice_1',
        id: 'pulse-chat/voice-message-123',
        roomId,
        userId,
        sender: userId,
        username: 'Khushu',
        type: 'audio',
        url: voiceUrl,
        originalName: 'voice-message-123.webm',
        size: 127490,
        duration: 12,
        waveform: [0.2, 0.8, 0.4],
        isDeleted: false,
      };

      const origMsgFindOne = Message.findOne;
      const origMsgFindOneAndUpdate = Message.findOneAndUpdate;
      const origEventFindOne = MessageEvent.findOne;
      const origEventUpdateMany = MessageEvent.updateMany;
      const origDestroy = cloudinary.uploader.destroy;
      const origDeleteResources = cloudinary.api?.delete_resources;

      let destroyCalled = false;
      let capturedUpdateFilter = null;
      let capturedUpdateOp = null;
      let savedDeleteEvent = null;
      const adminEvents = [];
      const wsSent = [];
      const purgedCalls = [];

      try {
        cloudinary.uploader.destroy = async () => {
          destroyCalled = true;
          return { result: 'ok' };
        };
        if (cloudinary.api) {
          cloudinary.api.delete_resources = async (ids, opts) => {
            purgedCalls.push({ ids, opts });
            return { deleted: {} };
          };
        }

        Message.findOne = () => ({ lean: async () => originalMsg });
        Message.updateMany = async () => ({ modifiedCount: 0 });
        MessageEvent.findOne = () => ({ lean: async () => null });
        MessageEvent.updateMany = async () => ({ modifiedCount: 1 });
        MessageEvent.prototype.save = async function () {
          savedDeleteEvent = this;
          return this;
        };
        Message.findOneAndUpdate = async (filter, updateOp) => {
          capturedUpdateFilter = filter;
          capturedUpdateOp = updateOp;
          return {
            _id: originalMsg._id,
            id: originalMsg.id,
            roomId,
            userId,
            username: 'Khushu',
            type: 'audio',
            isDeleted: true,
            deletedBy: userId,
            pinned: null,
          };
        };

        const mockWs = {
          readyState: 1,
          roomId,
          userId,
          username: 'Khushu',
          sessionToken: token,
          send: (raw) => wsSent.push(JSON.parse(raw)),
        };
        const mockWss = { clients: new Set([mockWs]) };

        await handleDeleteForEveryone({
          ws: mockWs,
          parsedMessage: { messageId: originalMsg.id },
          wss: mockWss,
          broadcastToAdmins: (_rid, evType, payload) => {
            if (evType === 'history') adminEvents.push(payload);
          },
        });

        // 1. User delete_for_everyone must NOT destroy the Cloudinary file
        assert.strictEqual(destroyCalled, false);

        // 2. Atomic filter & complete $unset of audio/media fields on Message
        assert.deepStrictEqual(capturedUpdateFilter.isDeleted, { $ne: true });
        assert.ok(capturedUpdateOp.$unset);
        assert.ok('url' in capturedUpdateOp.$unset);
        assert.ok('duration' in capturedUpdateOp.$unset);
        assert.ok('waveform' in capturedUpdateOp.$unset);

        // 3. Chat clients receive only the redacted tombstone (no URL/audio metadata)
        assert.strictEqual(wsSent.length, 1);
        assert.strictEqual(wsSent[0].type, 'update');
        assert.strictEqual(wsSent[0].data.isDeleted, true);
        assert.strictEqual(wsSent[0].data.url, undefined);
        assert.strictEqual(wsSent[0].data.duration, undefined);
        assert.strictEqual(wsSent[0].data.waveform, undefined);

        // 4. Admin audit MessageEvent retains deletedContent.url & originalName for playback
        assert.ok(savedDeleteEvent);
        assert.strictEqual(savedDeleteEvent.type, 'delete_everyone');
        assert.strictEqual(savedDeleteEvent.deletedContent.url, voiceUrl);
        assert.strictEqual(savedDeleteEvent.deletedContent.originalName, 'voice-message-123.webm');
        assert.strictEqual(adminEvents.length, 1);

        // 5. Permanent admin purge extracts Cloudinary asset from MessageEvent & deduplicates
        const extracted = extractMediaRecordsFromEvents([
          savedDeleteEvent,
          { messageId: originalMsg.id, message: { id: originalMsg.id, url: voiceUrl, type: 'audio' } },
        ]);
        await batchDeleteCloudinaryAssets(extracted);
        assert.strictEqual(purgedCalls.length, 1);
        assert.deepStrictEqual(purgedCalls[0].ids, ['pulse-chat/voice-message-123']);
        assert.strictEqual(purgedCalls[0].opts.resource_type, 'video');
      } finally {
        Message.findOne = origMsgFindOne;
        Message.findOneAndUpdate = origMsgFindOneAndUpdate;
        MessageEvent.findOne = origEventFindOne;
        MessageEvent.updateMany = origEventUpdateMany;
        cloudinary.uploader.destroy = origDestroy;
        if (cloudinary.api) cloudinary.api.delete_resources = origDeleteResources;
        deleteRoomState(roomId);
      }
    });

    it('fails closed on /me room access and auth when CLIENT_PASSWORD is missing', async () => {
      delete process.env.CLIENT_PASSWORD;

      const accessWithoutPassword = await isRoomAccessAllowed('me', {
        headers: {},
        query: {},
        body: {},
        socket: { remoteAddress: '127.0.0.1' },
      });
      assert.strictEqual(accessWithoutPassword, false);

      const authRouter = require('../routes/auth');
      const verifyLayer = authRouter.stack.find(
        (l) => l.route && l.route.path === '/api/auth/verify' && l.route.methods.post
      );
      assert.ok(verifyLayer, 'POST /api/auth/verify route should exist');
      const verifyHandler = verifyLayer.route.stack[verifyLayer.route.stack.length - 1].handle;

      let statusCode = 200;
      let payload = null;
      await verifyHandler(
        {
          body: { roomId: 'me', password: 'arbitrary-password', userId: 'u1', username: 'Attacker' },
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
        },
        {
          status(code) {
            statusCode = code;
            return this;
          },
          json(body) {
            payload = body;
            return this;
          },
        }
      );

      assert.strictEqual(statusCode, 503);
      assert.strictEqual(payload?.success, false);

      // WebSocket user_join to /me without sessionToken must also be blocked
      const wsSent = [];
      let terminated = false;
      const mockWs = {
        readyState: 1,
        send: (raw) => wsSent.push(JSON.parse(raw)),
        terminate: () => { terminated = true; },
      };
      await handleUserJoin({
        ws: mockWs,
        req: { socket: { remoteAddress: '127.0.0.1' }, headers: {} },
        parsedMessage: { type: 'user_join', roomId: 'me', userId: 'u_ws_1', username: 'WsAttacker' },
        wss: { clients: new Set() },
        broadcastToAdmins: () => {},
        _broadcast: () => {},
        _broadcastOnlineUsers: () => {},
        loadPinnedMessages: async () => {},
        _getVisibleMessagesQuery: () => ({}),
      });
      assert.ok(terminated || wsSent.some((m) => m.type === 'force_logout'));
    });

    it('retries failed initial MongoDB connection with bounded exponential backoff and prevents concurrent attempts', async () => {
      const connectDB = require('../db');
      const { computeBackoffDelayMs, resetDBRetryState } = connectDB;

      // Verify exponential backoff bounds with ±20% jitter: 2s -> 4s -> 8s -> ... capped at 60s
      for (let i = 0; i < 20; i++) {
        const d0 = computeBackoffDelayMs(0);
        const d1 = computeBackoffDelayMs(1);
        const d2 = computeBackoffDelayMs(2);
        const dMax = computeBackoffDelayMs(10);
        assert.ok(d0 >= 1600 && d0 <= 2400, `attempt 0 delay out of range: ${d0}`);
        assert.ok(d1 >= 3200 && d1 <= 4800, `attempt 1 delay out of range: ${d1}`);
        assert.ok(d2 >= 6400 && d2 <= 9600, `attempt 2 delay out of range: ${d2}`);
        assert.ok(dMax >= 48000 && dMax <= 72000, `max delay out of range: ${dMax}`);
      }

      const origMongoUri = process.env.MONGODB_URI;
      const origConnect = mongoose.connect;
      const origSetTimeout = global.setTimeout;
      const origClearTimeout = global.clearTimeout;
      let connectCalls = 0;
      let scheduledTimers = [];
      let onConnectedCount = 0;

      try {
        resetDBRetryState();
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/pulse_retry_test';
        Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

        global.setTimeout = (fn, ms) => {
          const handle = { fn, ms, cleared: false, unref() { return this; } };
          scheduledTimers.push(handle);
          return handle;
        };
        global.clearTimeout = (handle) => {
          if (handle) handle.cleared = true;
        };

        let resolveFirstConnect;
        mongoose.connect = () => {
          connectCalls += 1;
          if (connectCalls === 1) {
            return new Promise((_res, rej) => {
              resolveFirstConnect = () => rej(new Error('Simulated initial DB outage'));
            });
          }
          Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
          return Promise.resolve(mongoose);
        };

        // Concurrent connectDB() calls share a single in-flight attempt
        const p1 = connectDB({ onConnected: async () => { onConnectedCount += 1; } });
        const p2 = connectDB();
        assert.strictEqual(connectCalls, 1);
        resolveFirstConnect();
        const [r1, r2] = await Promise.all([p1, p2]);
        assert.strictEqual(r1, false);
        assert.strictEqual(r2, false);
        assert.strictEqual(scheduledTimers.length, 1);
        assert.ok(scheduledTimers[0].ms >= 1600 && scheduledTimers[0].ms <= 2400);

        // Execute scheduled retry -> succeeds, invokes onConnected, resets backoff
        await scheduledTimers[0].fn();
        assert.strictEqual(connectCalls, 2);
        assert.strictEqual(onConnectedCount, 1);
        assert.strictEqual(scheduledTimers.length, 1);
      } finally {
        resetDBRetryState();
        mongoose.connect = origConnect;
        global.setTimeout = origSetTimeout;
        global.clearTimeout = origClearTimeout;
        if (origMongoUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = origMongoUri;
      }
    });
  });

  describe('Pre-upload ownership enforcement on /api/upload/commit and /api/upload/discard', () => {
    it('prevents another user from committing or discarding an un-sent pre-upload and cleans up when owner discards', async () => {
      const express = require('express');
      const http = require('http');
      const cloudinary = require('cloudinary').v2;
      const createMediaRouter = require('../routes/media');
      const { getRoomState, registerRoomSessionToken, revokeRoomSessionToken } = require('../state');

      const mediaRouter = createMediaRouter(null, { broadcastToAdmins: () => {} });
      const app = express();
      app.use(express.json());
      app.use('/', mediaRouter);

      const stateMe = getRoomState('me');
      const tokU1 = 'tok_u1_' + crypto.randomBytes(8).toString('hex');
      const tokU2 = 'tok_u2_' + crypto.randomBytes(8).toString('hex');
      registerRoomSessionToken('me', 'u1_owner', tokU1);
      registerRoomSessionToken('me', 'u2_other', tokU2);
      stateMe.onlineUsers.set('u1_owner', { userId: 'u1_owner', username: 'Owner' });
      stateMe.onlineUsers.set('u2_other', { userId: 'u2_other', username: 'Other' });

      const origDestroy = cloudinary.uploader.destroy;
      const destroyedIds = [];
      cloudinary.uploader.destroy = async (pid) => {
        destroyedIds.push(pid);
        return { result: 'ok' };
      };

      const server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      try {
        const fakePublicId = 'pulse_uploads/pre_owned_asset_1';
        mediaRouter._pendingPreUploads.set(fakePublicId, {
          publicId: fakePublicId,
          resourceType: 'image',
          secureUrl: `https://res.cloudinary.com/demo/image/upload/${fakePublicId}.png`,
          originalName: 'secret.png',
          mimetype: 'image/png',
          size: 4096,
          roomId: 'me',
          userId: 'u1_owner',
          scopeHash: 'test_scope',
          createdAt: Date.now(),
        });

        // 1. Different user cannot commit u1_owner's pending pre-upload
        const badCommit = await fetch(`${baseUrl}/api/upload/commit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-id': 'me',
            'x-user-id': 'u2_other',
            'x-session-token': tokU2,
          },
          body: JSON.stringify({ publicId: fakePublicId, roomId: 'me', userId: 'u2_other' }),
        });
        assert.strictEqual(badCommit.status, 403);
        assert.strictEqual(mediaRouter._pendingPreUploads.has(fakePublicId), true);

        // 2. Different user cannot discard u1_owner's pending pre-upload
        const badDiscard = await fetch(`${baseUrl}/api/upload/discard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-id': 'me',
            'x-user-id': 'u2_other',
            'x-session-token': tokU2,
          },
          body: JSON.stringify({ publicIds: [fakePublicId], roomId: 'me', userId: 'u2_other' }),
        });
        assert.strictEqual(badDiscard.status, 200);
        assert.strictEqual(destroyedIds.length, 0);
        assert.strictEqual(mediaRouter._pendingPreUploads.has(fakePublicId), true);

        // 3. Owner CAN discard -> Cloudinary destroy is called and map entry is deleted
        const ownerDiscard = await fetch(`${baseUrl}/api/upload/discard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-id': 'me',
            'x-user-id': 'u1_owner',
            'x-session-token': tokU1,
          },
          body: JSON.stringify({ uploadIds: ['pre_abc'], publicIds: [fakePublicId], roomId: 'me', userId: 'u1_owner' }),
        });
        assert.strictEqual(ownerDiscard.status, 200);
        assert.deepStrictEqual(destroyedIds, [fakePublicId]);
        assert.strictEqual(mediaRouter._pendingPreUploads.has(fakePublicId), false);

        // 4. Mid-flight race: owner sends ONLY uploadId without publicId -> reverse map still destroys Cloudinary asset
        const racePublicId = 'pulse_uploads/pre_race_asset_2';
        const scopeHash = crypto.createHash('sha256').update('me:u1_owner:127.0.0.1').digest('hex').slice(0, 16);
        const raceDiscardKey = `${scopeHash}:pre_race_2`;
        mediaRouter._pendingPreUploads.set(racePublicId, {
          publicId: racePublicId,
          resourceType: 'video',
          secureUrl: `https://res.cloudinary.com/demo/video/upload/${racePublicId}.mp4`,
          originalName: 'clip.mp4',
          mimetype: 'video/mp4',
          size: 8192,
          roomId: 'me',
          userId: 'u1_owner',
          scopeHash,
          discardKey: raceDiscardKey,
          createdAt: Date.now(),
        });
        mediaRouter._preUploadIdToPublicId.set(raceDiscardKey, racePublicId);

        const raceDiscard = await fetch(`${baseUrl}/api/upload/discard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-id': 'me',
            'x-user-id': 'u1_owner',
            'x-session-token': tokU1,
          },
          body: JSON.stringify({ uploadIds: ['pre_race_2'], publicIds: [], roomId: 'me', userId: 'u1_owner' }),
        });
        assert.strictEqual(raceDiscard.status, 200);
        assert.strictEqual(destroyedIds.includes(racePublicId), true);
        assert.strictEqual(mediaRouter._pendingPreUploads.has(racePublicId), false);
        assert.strictEqual(mediaRouter._preUploadIdToPublicId.has(raceDiscardKey), false);
      } finally {
        cloudinary.uploader.destroy = origDestroy;
        revokeRoomSessionToken('me', 'u1_owner', tokU1);
        revokeRoomSessionToken('me', 'u2_other', tokU2);
        stateMe.onlineUsers.delete('u1_owner');
        stateMe.onlineUsers.delete('u2_other');
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
