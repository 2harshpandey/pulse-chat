const { describe, it } = require('node:test');
const assert = require('node:assert');
const { getRoomState, deleteRoomState } = require('../state');
const { handleSocketClose } = require('../websocket/presenceHandler');

describe('WebSocket Presence & Disconnect Grace Handling', () => {
  it('expires heartbeat-terminated dead sockets rapidly (1.5s) instead of holding 10s+ in onlineUsers', async () => {
    const roomId = 'test-room-heartbeat-close';
    const roomState = getRoomState(roomId);
    roomState.onlineUsers.clear();
    roomState.pendingDisconnects.clear();
    roomState.filePickerPresenceGrace.clear();

    roomState.onlineUsers.set('user-ghost', { userId: 'user-ghost', username: 'GhostUser' });

    const ws = {
      userId: 'user-ghost',
      roomId,
      terminatedByHeartbeat: true,
      readyState: 3, // CLOSED
    };
    const wss = { clients: new Set() };

    const broadcastedSystems = [];
    const broadcastedOnlineLists = [];

    handleSocketClose({
      ws,
      wss,
      broadcastToAdmins: () => {},
      _broadcast: (_rId, payload) => broadcastedSystems.push(payload),
      _broadcastOnlineUsers: (rId) => broadcastedOnlineLists.push(Array.from(getRoomState(rId).onlineUsers.keys())),
    });

    assert.ok(roomState.pendingDisconnects.has('user-ghost'));

    // Should still be pending briefly at 200ms, then gone before 2000ms (1500ms timer)
    await new Promise((r) => setTimeout(r, 1700));

    assert.strictEqual(roomState.onlineUsers.has('user-ghost'), false);
    assert.strictEqual(roomState.pendingDisconnects.has('user-ghost'), false);
    assert.ok(broadcastedSystems.some((m) => m.text === 'GhostUser has left the chat.'));

    deleteRoomState(roomId);
  });

  it('ignores dead other sockets (isAlive=false or terminatedByHeartbeat=true) when checking hasOtherActiveSocket', () => {
    const roomId = 'test-room-other-socket';
    const roomState = getRoomState(roomId);
    roomState.onlineUsers.clear();
    roomState.pendingDisconnects.clear();

    roomState.onlineUsers.set('user-1', { userId: 'user-1', username: 'UserOne' });

    const closingWs = { userId: 'user-1', roomId, readyState: 3 };
    const deadZombieWs = { userId: 'user-1', roomId, readyState: 1, isAlive: false, terminatedByHeartbeat: true };
    const wss = { clients: new Set([deadZombieWs]) };

    handleSocketClose({
      ws: closingWs,
      wss,
      broadcastToAdmins: () => {},
      _broadcast: () => {},
      _broadcastOnlineUsers: () => {},
    });

    // Dead zombie socket must NOT block scheduling disconnect cleanup
    assert.ok(roomState.pendingDisconnects.has('user-1'));
    const timer = roomState.pendingDisconnects.get('user-1');
    clearTimeout(timer);
    deleteRoomState(roomId);
  });
});
