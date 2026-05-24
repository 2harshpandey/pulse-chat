'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../db');
const Message = require('../models/message');
const { filterValidReactions, toReactionMap } = require('../reactions');

const countReactionUsers = (reactions) => Object.values(reactions).reduce((sum, users) => sum + users.length, 0);

const cleanupReactions = async () => {
  await connectDB();

  let scanned = 0;
  let changed = 0;
  let removedKeys = 0;
  let removedUsers = 0;

  const cursor = Message.find({ reactions: { $exists: true, $ne: null } }).cursor();

  for await (const message of cursor) {
    scanned += 1;

    const originalEntries = message.reactions instanceof Map
      ? Array.from(message.reactions.entries())
      : Object.entries(message.reactions || {});
    const originalUserCount = originalEntries.reduce((sum, [, users]) => sum + (Array.isArray(users) ? users.length : 0), 0);

    const filtered = filterValidReactions(message.reactions);
    const filteredEntries = Object.entries(filtered);
    const filteredUserCount = countReactionUsers(filtered);

    const originalKeys = originalEntries.map(([emoji]) => emoji);
    const filteredKeys = filteredEntries.map(([emoji]) => emoji);
    const keyChanged = originalKeys.length !== filteredKeys.length || originalKeys.some((emoji) => !filteredKeys.includes(emoji));
    const userCountChanged = originalUserCount !== filteredUserCount;

    if (!keyChanged && !userCountChanged) continue;

    if (filteredEntries.length === 0) {
      message.reactions = undefined;
    } else {
      message.reactions = toReactionMap(filtered);
    }
    message.markModified('reactions');
    await message.save();

    changed += 1;
    removedKeys += Math.max(0, originalKeys.length - filteredKeys.length);
    removedUsers += Math.max(0, originalUserCount - filteredUserCount);
  }

  console.log(JSON.stringify({ scanned, changed, removedKeys, removedUsers }, null, 2));
};

cleanupReactions()
  .then(() => mongoose.connection.close())
  .catch(async (error) => {
    console.error('Failed to cleanup reactions:', error);
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors
    }
    process.exitCode = 1;
  });
