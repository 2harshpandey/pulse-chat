/**
 * Normalizes user input for room identification.
 * Accepts:
 * - Room ID / alias with any casing (e.g. "dev_lounge", "Dev_Lounge", "GLOBAL", "ME")
 * - Direct paths (e.g. "/room/dev_lounge", "/ROOM/Dev_Lounge", "/me", "/ME", "/global", "/GLOBAL")
 * - Full URLs with any scheme/host (e.g. "https://pulsechat.tech/room/dev_lounge", "http://localhost:3000/ROOM/Dev_Lounge", "https://pulsechat.tech/me")
 */
export function extractRoomIdFromInput(input: string): string {
  let val = String(input || '').trim();
  if (!val) return '';

  // 1. If it looks like a URL with protocol, extract the pathname
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(val)) {
    try {
      const url = new URL(val);
      val = url.pathname;
    } catch {
      // If URL parsing fails, continue with string extraction
    }
  }

  // 2. Strip query string and hash
  val = val.split('?')[0].split('#')[0];

  // 3. Match /room/<roomId> (case-insensitive)
  const roomMatch = val.match(/(?:^|\/)room\/([^/?#]+)/i);
  if (roomMatch && roomMatch[1]) {
    val = roomMatch[1];
  } else if (/(?:^|\/)me(?:\/|$)/i.test(val) || val.toLowerCase() === 'me' || val.toLowerCase() === '/me') {
    return 'me';
  } else if (/(?:^|\/)global(?:\/|$)/i.test(val) || val.toLowerCase() === 'global' || val.toLowerCase() === '/global') {
    return 'global';
  } else {
    // Strip leading and trailing slashes
    val = val.replace(/^\/+|\/+$/g, '');
  }

  // Handle special 'me' and 'global' rooms
  if (val.toLowerCase() === 'me') return 'me';
  if (val.toLowerCase() === 'global') return 'global';

  // Keep alphanumeric, dots, underscores, dashes
  return val.replace(/[^a-zA-Z0-9._-]/g, '').trim();
}

