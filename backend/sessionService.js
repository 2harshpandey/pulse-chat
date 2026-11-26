'use strict';

const User = require('./models/user');
const {
  timingSafeEqualStr,
  verifySignedSessionToken,
  hashSessionToken,
  matchesStoredSessionToken,
} = require('./security');

/**
 * Checks whether an incoming raw/hashed session token matches any active token
 * stored on an in-memory room session object (including multi-device sessionTokens).
 */
const doesTokenMatchInMemorySession = (session, rawToken, tokenHash) => {
  if (!session || !rawToken || typeof rawToken !== 'string') return false;

  if (session.sessionToken && timingSafeEqualStr(rawToken, session.sessionToken)) {
    return true;
  }

  if (session.sessionTokens instanceof Set) {
    for (const candidateToken of session.sessionTokens) {
      if (timingSafeEqualStr(rawToken, candidateToken)) {
        return true;
      }
    }
  }

  const computedHash = tokenHash || hashSessionToken(rawToken);
  if (session.sessionTokenHash && computedHash && timingSafeEqualStr(computedHash, session.sessionTokenHash)) {
    return true;
  }

  return false;
};

/**
 * Hydrates or updates an in-memory room session while preserving multi-device sessionTokens.
 */
const hydrateInMemorySession = ({
  roomState,
  userId,
  username,
  sessionToken,
  tokenHash,
  ip = '',
  userAgent = '',
  preserveTimestampSession = false,
}) => {
  if (!roomState || !roomState.loggedInUsers || !userId || !sessionToken) return;

  const existingSession = roomState.loggedInUsers.get(userId);
  if (existingSession) {
    let primaryToken = sessionToken;
    let primaryHash = tokenHash || hashSessionToken(sessionToken);

    if (preserveTimestampSession && existingSession.sessionToken) {
      const existingData = verifySignedSessionToken(existingSession.sessionToken);
      const incomingData = verifySignedSessionToken(sessionToken);
      if (
        existingData &&
        typeof existingData.iat === 'number' &&
        incomingData &&
        typeof incomingData.iat === 'number' &&
        existingData.iat >= incomingData.iat
      ) {
        primaryToken = existingSession.sessionToken;
        primaryHash = existingSession.sessionTokenHash || hashSessionToken(primaryToken);
      }
    }

    if (!(existingSession.sessionTokens instanceof Set)) {
      existingSession.sessionTokens = new Set(
        existingSession.sessionToken ? [existingSession.sessionToken] : []
      );
    }
    existingSession.sessionTokens.add(sessionToken);
    if (!preserveTimestampSession) {
      existingSession.sessionToken = primaryToken;
      existingSession.sessionTokenHash = primaryHash;
    } else {
      existingSession.sessionToken = primaryToken;
      existingSession.sessionTokenHash = primaryHash;
    }
    if (username && !existingSession.username) existingSession.username = username;
    return;
  }

  roomState.loggedInUsers.set(userId, {
    userId,
    username: username || userId,
    sessionToken,
    sessionTokenHash: tokenHash || hashSessionToken(sessionToken),
    sessionTokens: new Set([sessionToken]),
    loginTime: new Date(),
    ip,
    userAgent,
  });
};

/**
 * Verifies an active user session token against in-memory room state first,
 * falling back across restarts/devices to HMAC signature + MongoDB User token hashes.
 */
const verifyActiveSessionToken = async ({
  roomId,
  rawRoomId,
  userId,
  sessionToken,
  roomState,
  ip = '',
  userAgent = '',
  fallbackUsername = '',
  hydrateIfMissing = true,
  preserveTimestampSession = false,
}) => {
  const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
  const cleanToken = typeof sessionToken === 'string' && sessionToken.trim() ? sessionToken.trim() : '';
  if (!cleanUserId || !cleanToken) {
    return { valid: false, fromMemory: false, dbUser: null, dbError: null, needsTokenHashPersist: false };
  }

  const incomingHash = hashSessionToken(cleanToken);
  const existingSession = roomState?.loggedInUsers?.get(cleanUserId) || null;

  if (existingSession && doesTokenMatchInMemorySession(existingSession, cleanToken, incomingHash)) {
    return {
      valid: true,
      fromMemory: true,
      matchedToken: cleanToken,
      dbUser: null,
      dbError: null,
      needsTokenHashPersist: false,
    };
  }

  const canonicalRoomId = (!roomId || roomId === 'me') ? 'me' : String(roomId);
  const cleanRawRoom = rawRoomId ? String(rawRoomId).trim() : '';
  const verified = verifySignedSessionToken(cleanToken);
  const isRoomMatch = Boolean(
    verified &&
    (
      verified.roomId === canonicalRoomId ||
      (cleanRawRoom && verified.roomId === cleanRawRoom) ||
      (canonicalRoomId === 'me' && (verified.roomId === 'me' || verified.roomId === ''))
    )
  );

  if (!verified || verified.userId !== cleanUserId || !isRoomMatch) {
    return { valid: false, fromMemory: false, dbUser: null, dbError: null, needsTokenHashPersist: false };
  }

  try {
    const dbUser = await User.findOne({ roomId: canonicalRoomId, userId: cleanUserId }).lean();
    if (!matchesStoredSessionToken(dbUser, cleanToken, incomingHash)) {
      return { valid: false, fromMemory: false, dbUser, dbError: null, needsTokenHashPersist: false };
    }

    if (dbUser?.sessionToken && !dbUser?.sessionTokenHash) {
      const targetFilter = dbUser._id
        ? { _id: dbUser._id }
        : { roomId: canonicalRoomId, userId: cleanUserId };
      User.updateOne(
        targetFilter,
        { $set: { sessionTokenHash: incomingHash, lastSeen: new Date() }, $unset: { sessionToken: 1 } }
      ).catch(() => {});
    }

    if (existingSession || hydrateIfMissing) {
      hydrateInMemorySession({
        roomState,
        userId: cleanUserId,
        username: dbUser?.username || fallbackUsername || cleanUserId,
        sessionToken: cleanToken,
        tokenHash: incomingHash,
        ip,
        userAgent,
        preserveTimestampSession,
      });
    }

    const needsTokenHashPersist = Boolean(
      (dbUser?.sessionToken && !dbUser?.sessionTokenHash) ||
      !Array.isArray(dbUser?.sessionTokenHashes) ||
      !incomingHash ||
      !dbUser.sessionTokenHashes.includes(incomingHash)
    );

    return {
      valid: true,
      fromMemory: false,
      matchedToken: cleanToken,
      dbUser,
      dbError: null,
      needsTokenHashPersist,
    };
  } catch (dbError) {
    return { valid: false, fromMemory: false, dbUser: null, dbError, needsTokenHashPersist: false };
  }
};

module.exports = {
  doesTokenMatchInMemorySession,
  hydrateInMemorySession,
  verifyActiveSessionToken,
};
