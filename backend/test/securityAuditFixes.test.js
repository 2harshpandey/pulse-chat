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
  });
});
