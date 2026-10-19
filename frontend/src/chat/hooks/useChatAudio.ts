import { useState, useEffect, useRef, useCallback } from 'react';
import { NOTIFICATION_BEEP } from '../audioConstants';

export function useChatAudio(isUserLoggedIn: boolean) {
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('pulseSoundEnabled');
    return stored === null ? true : stored === 'true';
  });
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const [isSoundToggleAnimating, setIsSoundToggleAnimating] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioCtxUnlockedRef = useRef(false);
  const lastNotificationSoundAtRef = useRef<number>(0);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
    try {
      localStorage.setItem('pulseSoundEnabled', String(isSoundEnabled));
    } catch {
      // Ignore storage errors.
    }
  }, [isSoundEnabled]);

  useEffect(() => {
    if (!isUserLoggedIn) return;

    // Unlock the AudioContext on the first user interaction.
    const unlockAudio = () => {
      let justCreated = false;
      if (!audioCtxRef.current) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtxRef.current = ctx;
          justCreated = true;
          // Decode base64 WAV → ArrayBuffer → AudioBuffer
          const base64 = NOTIFICATION_BEEP.split(',')[1];
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          ctx.decodeAudioData(bytes.buffer).then(buf => {
            audioBufferRef.current = buf;
          }).catch(() => {});
        } catch {
          // Web Audio API not available
        }
      }

      const ctx = audioCtxRef.current;
      if (ctx && !audioCtxUnlockedRef.current) {
        audioCtxUnlockedRef.current = true;
        if (!justCreated && ctx.state === 'suspended') {
          ctx.resume().catch(() => {
            audioCtxUnlockedRef.current = false;
          });
        }
      }
    };

    window.addEventListener('click', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    window.addEventListener('touchstart', unlockAudio, { capture: true });

    return () => {
      window.removeEventListener('click', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
    };
  }, [isUserLoggedIn]);

  const shouldPlayNotificationSound = useCallback(() => {
    if (typeof document === 'undefined') return false;
    if (!isSoundEnabledRef.current) return false;
    const isHidden = document.visibilityState === 'hidden';
    const isBlurred = !document.hasFocus();
    return isHidden || isBlurred;
  }, []);

  const playNotificationSound = useCallback((_variant: 'join' | 'message') => {
    if (!shouldPlayNotificationSound()) return;
    const now = Date.now();
    if (now - lastNotificationSoundAtRef.current < 420) return;
    lastNotificationSoundAtRef.current = now;

    const ctx = audioCtxRef.current;
    const buf = audioBufferRef.current;
    if (!ctx || !buf) return;

    const tryPlay = () => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        // Ignore play errors
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        audioCtxUnlockedRef.current = true;
        tryPlay();
      }).catch(() => {});
    } else {
      tryPlay();
    }
  }, [shouldPlayNotificationSound]);

  const toggleSound = useCallback(() => {
    setIsSoundEnabled(prev => !prev);
    setIsSoundToggleAnimating(true);
  }, []);

  return {
    isSoundEnabled,
    setIsSoundEnabled,
    isSoundToggleAnimating,
    toggleSound,
    playNotificationSound,
  };
}
