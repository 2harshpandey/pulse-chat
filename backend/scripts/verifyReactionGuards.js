'use strict';

const assert = require('assert');
const { QUICK_REACTIONS, normalizeReactionEmoji, filterValidReactions, toReactionMap } = require('../reactions');

const corruptedThumbsUp = 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚Â';
const corruptedHeart = 'ÃƒÂ¢Ã‚ÂÃ‚Â¤ÃƒÂ¯Ã‚Â¸Ã‚Â';

assert.deepStrictEqual(QUICK_REACTIONS, ['👍', '❤️', '😂', '😮', '😢', '🙏']);
assert.strictEqual(normalizeReactionEmoji('👍'), '👍');
assert.strictEqual(normalizeReactionEmoji(' 👍 '), '👍');
assert.strictEqual(normalizeReactionEmoji(corruptedThumbsUp), null);
assert.strictEqual(normalizeReactionEmoji(corruptedHeart), null);
assert.strictEqual(normalizeReactionEmoji('not-an-emoji'), null);

const filtered = filterValidReactions({
  '👍': [{ userId: 'u1', username: 'Sadhana' }],
  [corruptedThumbsUp]: [{ userId: 'u2', username: 'Bad Data' }],
  '❤️': ['u3'],
});

assert.deepStrictEqual(filtered, {
  '👍': [{ userId: 'u1', username: 'Sadhana' }],
  '❤️': [{ userId: 'u3', username: 'u3' }],
});

const map = toReactionMap(filtered);
assert(map instanceof Map);
assert.deepStrictEqual(Array.from(map.keys()), ['👍', '❤️']);

console.log('Reaction guard verification passed.');
