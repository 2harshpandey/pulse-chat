'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const Room = require('../models/room');
const Message = require('../models/message');
const AuditLog = require('../models/auditLog');
const { hashPasswordAsync } = require('../security');
const { resetPasswordAttempts, resetAdminAttemptsAcrossScope } = require('../middleware');
const { getRoomState, deleteRoomState } = require('../state');
const roomsRouter = require('../routes/rooms');

const startTestServer = async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomsRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${addr.port}`,
  };
};

describe('Public Rooms Directory Active ID & Admin Join Password Validation', () => {
  const origRoomFind = Room.find;
  const origRoomCountDocuments = Room.countDocuments;
  const origRoomFindByIdOrAlias = Room.findByIdOrAlias;
  const origMsgAggregate = Message.aggregate;
  const origAuditCreate = AuditLog.create;
  const origAdminPassword = process.env.ADMIN_PASSWORD;

  let server;
  let baseUrl;

  beforeEach(async () => {
    process.env.ADMIN_PASSWORD = 'super_admin_test_pw';
    AuditLog.create = async () => ({});
    Message.aggregate = async () => [{ _id: 'orig_hex_id_1', count: 12 }];
    const srv = await startTestServer();
    server = srv.server;
    baseUrl = srv.baseUrl;
  });

  afterEach(async () => {
    Room.find = origRoomFind;
    Room.countDocuments = origRoomCountDocuments;
    Room.findByIdOrAlias = origRoomFindByIdOrAlias;
    Message.aggregate = origMsgAggregate;
    AuditLog.create = origAuditCreate;
    if (origAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = origAdminPassword;
    deleteRoomState('orig_hex_id_1');
    deleteRoomState('test_pw_room');
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns active alias as id on GET /api/rooms while keeping canonicalId and stats accurate', async () => {
    const mockRoom = {
      id: 'orig_hex_id_1',
      alias: 'new_dev_lounge',
      name: 'Dev Lounge',
      description: 'Public room with updated alias',
      isPrivate: false,
    };

    const roomState = getRoomState('orig_hex_id_1');
    roomState.onlineUsers.set('user-1', { username: 'Harsh' });

    Room.find = () => ({
      sort: () => ({
        skip: () => ({
          limit: async () => [mockRoom],
        }),
      }),
    });
    Room.countDocuments = async () => 1;

    const res = await fetch(`${baseUrl}/api/rooms?page=1`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.rooms.length, 1);
    assert.strictEqual(body.rooms[0].id, 'new_dev_lounge');
    assert.strictEqual(body.rooms[0].canonicalId, 'orig_hex_id_1');
    assert.strictEqual(body.rooms[0].alias, 'new_dev_lounge');
    assert.strictEqual(body.rooms[0].onlineCount, 1);
    assert.strictEqual(body.rooms[0].totalMessages, 12);
  });

  it('matches rooms by custom alias in GET /api/rooms/search and returns active id', async () => {
    let capturedQuery = null;
    const mockRoom = {
      id: 'orig_hex_id_1',
      alias: 'custom_alias_99',
      name: 'Custom Room',
      description: '',
      isPrivate: false,
    };

    Room.find = (query) => {
      capturedQuery = query;
      return {
        sort: () => ({
          skip: () => ({
            limit: async () => [mockRoom],
          }),
        }),
      };
    };
    Room.countDocuments = async () => 1;

    const res = await fetch(`${baseUrl}/api/rooms/search?q=custom_alias&page=1`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.rooms.length, 1);
    assert.strictEqual(body.rooms[0].id, 'custom_alias_99');
    assert.ok(
      Array.isArray(capturedQuery.$or) && capturedQuery.$or.some((clause) => Object.prototype.hasOwnProperty.call(clause, 'alias')),
      'Search query must inspect alias field'
    );
  });

  it('rejects setting a join password when a public room receives a non-empty currentPassword', async () => {
    let saveCalled = false;
    const publicRoomDoc = {
      id: 'test_pw_room',
      alias: 'test_pw_room',
      name: 'Test Public Room',
      isPrivate: false,
      joinPassword: null,
      adminPassword: await hashPasswordAsync('room_admin_pw'),
      save: async () => {
        saveCalled = true;
      },
    };

    Room.findByIdOrAlias = async () => publicRoomDoc;

    // 1. Supplying random currentPassword on a public room must be rejected with 400
    const rejectRes = await fetch(`${baseUrl}/api/rooms/admin/joinPassword`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-room-id': 'test_pw_room',
        'x-admin-password': 'room_admin_pw',
      },
      body: JSON.stringify({
        currentPassword: 'wrong_random_attempt',
        newPassword: 'secretNewPassword1',
      }),
    });

    assert.strictEqual(rejectRes.status, 400);
    const rejectBody = await rejectRes.json();
    assert.match(rejectBody.error, /public and has no join password/i);
    assert.strictEqual(saveCalled, false);
    assert.strictEqual(publicRoomDoc.isPrivate, false);
    assert.strictEqual(publicRoomDoc.joinPassword, null);

    // 2. Leaving currentPassword empty sets the password and marks room private
    const setRes = await fetch(`${baseUrl}/api/rooms/admin/joinPassword`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-room-id': 'test_pw_room',
        'x-admin-password': 'room_admin_pw',
      },
      body: JSON.stringify({
        currentPassword: '',
        newPassword: 'secretNewPassword1',
      }),
    });

    assert.strictEqual(setRes.status, 200);
    assert.strictEqual(saveCalled, true);
    assert.strictEqual(publicRoomDoc.isPrivate, true);
    assert.ok(publicRoomDoc.joinPassword && publicRoomDoc.joinPassword.startsWith('scrypt$'));

    // 3. Now that room is private, wrong currentPassword must be rejected without modifying joinPassword
    const prevHash = publicRoomDoc.joinPassword;
    const wrongRes = await fetch(`${baseUrl}/api/rooms/admin/joinPassword`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-room-id': 'test_pw_room',
        'x-admin-password': 'room_admin_pw',
      },
      body: JSON.stringify({
        currentPassword: 'wrong_password',
        newPassword: 'anotherPassword2',
      }),
    });
    assert.strictEqual(wrongRes.status, 400);
    const wrongBody = await wrongRes.json();
    assert.match(wrongBody.error, /current password is not correct/i);
    assert.strictEqual(publicRoomDoc.joinPassword, prevHash);

    resetPasswordAttempts('127.0.0.1_test_pw_room_joinpw');
    resetAdminAttemptsAcrossScope('127.0.0.1_test_pw_room', '127.0.0.1');
  });

  it('rejects reserved dot paths (. and ..) on /api/rooms/check-id and avoids wasting cooldown on no-op roomId update', async () => {
    const dotRes = await fetch(`${baseUrl}/api/rooms/check-id?id=.`);
    assert.strictEqual(dotRes.status, 200);
    assert.strictEqual((await dotRes.json()).available, false);

    const dotDotRes = await fetch(`${baseUrl}/api/rooms/check-id?id=..`);
    assert.strictEqual(dotDotRes.status, 200);
    assert.strictEqual((await dotDotRes.json()).available, false);

    let saveCalled = false;
    const legacyRoomDoc = {
      id: 'legacy_room_1',
      alias: undefined,
      lastIdChangeAt: null,
      adminPassword: await hashPasswordAsync('room_admin_pw'),
      save: async () => {
        saveCalled = true;
      },
    };
    Room.findByIdOrAlias = async () => legacyRoomDoc;

    const noOpRes = await fetch(`${baseUrl}/api/rooms/admin/roomId`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-room-id': 'legacy_room_1',
        'x-admin-password': 'room_admin_pw',
      },
      body: JSON.stringify({ newRoomId: 'legacy_room_1' }),
    });
    assert.strictEqual(noOpRes.status, 200);
    const noOpBody = await noOpRes.json();
    assert.strictEqual(noOpBody.success, true);
    assert.strictEqual(noOpBody.newAlias, undefined);
    assert.strictEqual(saveCalled, false);

    resetAdminAttemptsAcrossScope('127.0.0.1_legacy_room_1', '127.0.0.1');
  });
});
