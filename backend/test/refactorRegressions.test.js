const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const Room = require('../models/room');
const AuditLog = require('../models/auditLog');
const { adminAuthWithAudit, resetAdminAttemptsAcrossScope } = require('../middleware');
const { invalidateCachedRoom } = require('../state');
const { hashPassword, hashPasswordAsync, verifyPasswordAsync } = require('../security');
const { isAudioMimeOrExt, getUploadResourceType, getMessageFileType } = require('../mediaTypes');

describe('Backend Refactor & Bugfix Regression Tests', () => {
  const origFindByIdOrAlias = Room.findByIdOrAlias;
  const origRoomUpdateOne = Room.updateOne;
  const origAuditCreate = AuditLog.create;

  afterEach(() => {
    Room.findByIdOrAlias = origFindByIdOrAlias;
    Room.updateOne = origRoomUpdateOne;
    AuditLog.create = origAuditCreate;
    invalidateCachedRoom('legacy_upgrade_room');
    resetAdminAttemptsAcrossScope('198.51.100.55_legacy_upgrade_room', '198.51.100.55');
  });

  it('classifies upload resource & message file types consistently via shared mediaTypes helper', () => {
    assert.strictEqual(isAudioMimeOrExt('audio/webm', 'clip.webm'), true);
    assert.strictEqual(isAudioMimeOrExt('video/webm', 'voice-message.webm'), true);
    assert.strictEqual(getUploadResourceType('video/x-matroska', 'clip.mkv'), 'video');
    assert.strictEqual(getMessageFileType('image/avif', 'pic.avif'), 'image');
    assert.strictEqual(getMessageFileType('application/pdf', 'doc.pdf'), 'file');
  });

  it('upgrades legacy non-scrypt adminPassword automatically inside adminAuthWithAudit and audits failures', async () => {
    const legacyPlaintext = 'OldAdminPass123';
    const createdAuditLogs = [];
    const upgradedUpdates = [];

    Room.findByIdOrAlias = async (idOrAlias) => (
      idOrAlias === 'legacy_upgrade_room'
        ? { id: 'legacy_upgrade_room', alias: null, adminPassword: legacyPlaintext }
        : null
    );
    Room.updateOne = async (filter, update) => {
      upgradedUpdates.push({ filter, update });
      return { modifiedCount: 1 };
    };
    AuditLog.create = async (entry) => {
      createdAuditLogs.push(entry);
      return entry;
    };

    const failReq = {
      headers: { 'x-room-id': 'legacy_upgrade_room', 'x-admin-password': 'WrongPassword' },
      ip: '198.51.100.55',
    };
    let failStatus = null;
    await adminAuthWithAudit(
      failReq,
      { status: (c) => { failStatus = c; return { json: () => {} }; } },
      () => assert.fail('Should not call next on bad password')
    );
    assert.strictEqual(failStatus, 401);
    assert.ok(createdAuditLogs.some((e) => e.type === 'admin_auth_failed' && e.roomId === 'legacy_upgrade_room'));

    const okReq = {
      headers: { 'x-room-id': 'legacy_upgrade_room', 'x-admin-password': legacyPlaintext },
      ip: '198.51.100.55',
    };
    let nextCalled = false;
    await adminAuthWithAudit(
      okReq,
      { status: () => ({ json: () => {} }) },
      () => { nextCalled = true; }
    );
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(okReq.roomId, 'legacy_upgrade_room');
    assert.strictEqual(upgradedUpdates.length, 1);
    const newHash = upgradedUpdates[0].update.$set.adminPassword;
    assert.ok(newHash.startsWith('scrypt$'));
    assert.strictEqual(await verifyPasswordAsync(legacyPlaintext, newHash), true);

    // Ensure sync hashPassword + async hashPasswordAsync compatibility
    assert.ok(hashPassword('abc').startsWith('scrypt$'));
    assert.ok((await hashPasswordAsync('abc')).startsWith('scrypt$'));
  });
});
