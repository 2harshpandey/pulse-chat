// --- Clipboard & Device Interaction Helpers ---

/**
 * Universally copies text to clipboard across all platforms (Desktop, Android, iOS Safari),
 * supporting both secure contexts (HTTPS / localhost) and non-secure LAN IP contexts (http://192.168.x.x).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API if available in secure context
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand:', err);
    }
  }

  // 2. Synchronous execCommand fallback for non-secure contexts (e.g. mobile over HTTP) or unsupported environments
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.fontSize = '16px'; // Prevents iOS Safari auto-zoom
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    const isIOS = typeof navigator !== 'undefined' && /ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus({ preventScroll: true });
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.error('execCommand fallback failed:', fallbackErr);
    return false;
  }
}

/**
 * Detects whether the user is on a non-touch or mixed device (e.g. PC, desktop, laptop,
 * including touchscreen laptops with trackpad/mouse).
 * Touch-only devices (mobile phones, tablets) return false.
 */
export const isNonTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return true;

  // Laptops and desktops (including touch-screen laptops) have a fine pointer (trackpad/mouse) or hover support
  const hasFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const hasHover = window.matchMedia?.('(hover: hover)').matches ?? false;

  if (hasFinePointer || hasHover) {
    return true;
  }

  // Pure touch devices (smartphones, tablets) have a coarse primary pointer and no hover
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (isCoarse) {
    return false;
  }

  // Fallback for older browsers
  const hasTouch = 'ontouchstart' in window || ((navigator.maxTouchPoints || 0) > 0);
  return !hasTouch;
};

/**
 * Extracts and deduplicates File objects from a paste or drop DataTransfer payload.
 */
export function extractFilesFromClipboard(clipboardData: DataTransfer): File[] {
  const collectedFiles = new Map<string, File>();
  const addCollectedFile = (file: File | null) => {
    if (!file) return;

    const mime = file.type || 'application/octet-stream';
    const extensionFromMime = mime.includes('/') ? mime.split('/')[1].split('+')[0] : 'bin';
    const safeExt = (extensionFromMime || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const hasName = Boolean(file.name && file.name.trim());
    const fileName = hasName ? file.name : `pasted-${Date.now()}.${safeExt}`;
    const normalized = hasName
      ? file
      : new File([file], fileName, { type: mime, lastModified: Date.now() });

    const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
    if (!collectedFiles.has(key)) collectedFiles.set(key, normalized);
  };

  Array.from(clipboardData.files || []).forEach((file) => addCollectedFile(file));

  Array.from(clipboardData.items || []).forEach((item) => {
    if (item.kind !== 'file') return;
    addCollectedFile(item.getAsFile());
  });

  return Array.from(collectedFiles.values());
}
