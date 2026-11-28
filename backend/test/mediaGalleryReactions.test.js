'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const Message = require('../models/message');
const Room = require('../models/room');
const BlockedUser = require('../models/blockedUser');
const User = require('../models/user');
const mediaRoutesFactory = require('../routes/media');

describe('GET /api/media/gallery reactions projection and sanitization', () => {
  const origMsgFind = Message.find;
  const origRoomFindByIdOrAlias = Room.findByIdOrAlias;
  const origBlockedFindOne = BlockedUser.findOne;
  const origUserFindOne = User.findOne;
  let server;
  let baseUrl;
  let selectedFields = [];

  beforeEach(async () => {
    selectedFields = [];
    Room.findByIdOrAlias = async () => null;
    BlockedUser.findOne = () => ({ lean: async () => null });
    User.findOne = async () => null;

    const app = express();
    app.use(express.json());
    const router = mediaRoutesFactory(null, { broadcastToAdmins: () => {} });
    app.use('/', router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    Message.find = origMsgFind;
    Room.findByIdOrAlias = origRoomFindByIdOrAlias;
    BlockedUser.findOne = origBlockedFindOne;
    User.findOne = origUserFindOne;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('selects and returns sanitized reactions on media gallery items', async () => {
    const rawReactions = Object.create(null);
    rawReactions['❤️'] = [{ userId: 'u1', username: 'Harsh' }];
    rawReactions['👍'] = [{ userId: 'u2', username: 'Alice', isAlbum: true }];
    rawReactions.__proto__ = [{ userId: 'bad', username: 'Bad' }];

    const mockRows = [
      {
        id: 'photo-99',
        type: 'image',
        url: 'https://res.cloudinary.com/test/image/upload/v1/p99.jpg',
        originalName: 'p99.jpg',
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        userId: 'u1',
        username: 'Harsh',
        reactions: rawReactions,
      },
    ];

    Message.find = () => ({
      select: (fields) => {
        selectedFields.push(fields);
        return {
          sort: () => ({
            limit: () => ({
              lean: async () => mockRows,
            }),
          }),
        };
      },
    });

    const res = await fetch(`${baseUrl}/api/media/gallery?roomId=global&type=photo`, {
      headers: {
        'x-room-id': 'global',
        'x-user-id': 'u1',
      },
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(selectedFields.some((s) => s.includes('reactions')));
    assert.strictEqual(body.items.length, 1);
    assert.deepStrictEqual(body.items[0].reactions, {
      '❤️': [{ userId: 'u1', username: 'Harsh' }],
      '👍': [{ userId: 'u2', username: 'Alice', isAlbum: true }],
    });
  });
});
