// --- Audio Duration Cache, Subscriptions & Metadata Probing ---

export const audioDurationCache = new Map<string, number>();

type AudioDurationSubscriber = (key: string, duration: number) => void;
const audioDurationSubscribers = new Set<AudioDurationSubscriber>();

export const setAudioDurationCache = (key: string | null | undefined, duration: number | null | undefined): void => {
  if (!key || typeof duration !== 'number' || isNaN(duration) || !isFinite(duration) || duration <= 0) return;
  const rounded = Math.round(duration * 10) / 10;
  audioDurationCache.set(key, rounded);
  audioDurationSubscribers.forEach((sub) => {
    try {
      sub(key, rounded);
    } catch (err) {
      console.error('Audio duration subscriber error:', err);
    }
  });
};

export const subscribeAudioDuration = (subscriber: AudioDurationSubscriber): (() => void) => {
  audioDurationSubscribers.add(subscriber);
  return () => {
    audioDurationSubscribers.delete(subscriber);
  };
};

export const resolveAudioDuration = async (url?: string | null, id?: string | null): Promise<number | null> => {
  if (id && audioDurationCache.has(id)) return audioDurationCache.get(id)!;
  if (url && audioDurationCache.has(url)) return audioDurationCache.get(url)!;
  if (!url || typeof window === 'undefined') return null;

  // 1. Fast check: If it's an HTTP/HTTPS CDN link, try a HEAD request to extract Server-Timing duration if present
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const headController = new AbortController();
      const headTimeout = setTimeout(() => headController.abort(), 2000);
      const headRes = await fetch(url, { method: 'HEAD', mode: 'cors', signal: headController.signal }).catch(() => null);
      clearTimeout(headTimeout);
      if (headRes && headRes.ok) {
        const serverTiming = headRes.headers.get('server-timing') || '';
        const duMatch = serverTiming.match(/du=([0-9.]+)/i);
        if (duMatch && duMatch[1]) {
          const parsedDu = parseFloat(duMatch[1]);
          if (!isNaN(parsedDu) && isFinite(parsedDu) && parsedDu > 0) {
            setAudioDurationCache(id, parsedDu);
            setAudioDurationCache(url, parsedDu);
            return parsedDu;
          }
        }
      }
    } catch {
      // Continue to audio element resolution
    }
  }

  // 2. Programmatic Audio Element Resolution
  if (typeof Audio === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      let resolved = false;

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('durationchange', onLoaded);
        audio.removeEventListener('canplay', onLoaded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('timeupdate', onSeekEnd);
        audio.removeEventListener('seeked', onSeekEnd);
        try {
          audio.src = '';
        } catch {}
      };

      const finishWithDuration = (dur: number) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        setAudioDurationCache(id, dur);
        setAudioDurationCache(url, dur);
        resolve(dur);
      };

      const onSeekEnd = () => {
        if (resolved) return;
        const dur = audio.duration;
        if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
          finishWithDuration(dur);
        }
      };

      const onLoaded = () => {
        if (resolved) return;
        const dur = audio.duration;
        // Chromium WebM recorded audio fix: duration is reported as Infinity initially
        if (dur === Infinity) {
          audio.addEventListener('timeupdate', onSeekEnd);
          audio.addEventListener('seeked', onSeekEnd);
          try {
            audio.currentTime = 1e101;
          } catch {
            // Seek failed
          }
          return;
        }

        if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
          finishWithDuration(dur);
        }
      };

      const onError = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(null);
      };

      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('durationchange', onLoaded);
      audio.addEventListener('canplay', onLoaded);
      audio.addEventListener('error', onError);

      audio.src = url;
      try {
        audio.load();
      } catch {}

      // 10 second timeout safety net
      setTimeout(() => {
        if (!resolved) {
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
            finishWithDuration(audio.duration);
          } else {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }
      }, 10000);
    } catch {
      resolve(null);
    }
  });
};
