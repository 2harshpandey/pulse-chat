'use strict';


const FORBIDDEN_REACTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

const normalizeReactionEmoji = (emoji) => {
  if (typeof emoji !== 'string') return null;
  const normalized = emoji.trim().normalize('NFC');
  if (!normalized || normalized.length > 20 || FORBIDDEN_REACTION_KEYS.has(normalized)) return null;
  return normalized;
};

const normalizeReactionUser = (user) => {
  if (typeof user === 'string' && user) {
    return { userId: user, username: user };
  }
  if (!user || typeof user !== 'object' || typeof user.userId !== 'string' || !user.userId) {
    return null;
  }
  return {
    userId: user.userId,
    username: typeof user.username === 'string' && user.username ? user.username : user.userId,
    ...(user.isAlbum ? { isAlbum: true } : {}),
  };
};

const reactionEntries = (reactions) => {
  if (!reactions || typeof reactions !== 'object') return [];
  if (reactions instanceof Map) return Array.from(reactions.entries());
  return Object.entries(reactions);
};

const filterValidReactions = (reactions) => {
  const safeMap = new Map();

  for (const [rawEmoji, users] of reactionEntries(reactions)) {
    const emoji = normalizeReactionEmoji(rawEmoji);
    if (!emoji || !Array.isArray(users)) continue;

    const validUsers = users.map(normalizeReactionUser).filter(Boolean);
    if (validUsers.length > 0) {
      const existing = safeMap.get(emoji) || [];
      safeMap.set(emoji, [...existing, ...validUsers]);
    }
  }

  return Object.fromEntries(safeMap);
};

const toReactionMap = (reactions) => {
  const map = new Map();
  const filtered = filterValidReactions(reactions);
  for (const [emoji, users] of Object.entries(filtered)) {
    map.set(emoji, users);
  }
  return map;
};

module.exports = {
  normalizeReactionEmoji,
  filterValidReactions,
  toReactionMap,
};
