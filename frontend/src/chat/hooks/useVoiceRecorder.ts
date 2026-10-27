import { useState, useRef, useCallback, useEffect } from 'react';

export interface VoiceRecordingResult {
  file: File;
  duration: number;
  waveform: number[];
}

export function getAudioMimeType(): { mimeType: string; extension: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent || '');
  const candidates = isApple
    ? [
        { mimeType: 'audio/mp4', extension: 'mp4' },
        { mimeType: 'audio/aac', extension: 'aac' },
        { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
        { mimeType: 'audio/webm', extension: 'webm' },
        { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
      ]
    : [
        { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
        { mimeType: 'audio/webm', extension: 'webm' },
        { mimeType: 'audio/mp4', extension: 'mp4' },
        { mimeType: 'audio/aac', extension: 'aac' },
        { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
      ];

  for (const c of candidates) {
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    } catch {}
  }
  return { mimeType: '', extension: isApple ? 'mp4' : 'webm' };
}

export function isOriginSecureContext(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }
  try {
    const { protocol, hostname } = window.location;
    return (
      protocol === 'https:' ||
      protocol === 'wss:' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    );
  } catch {
    return true;
  }
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>(() => new Array(24).fill(0.15));
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const sampledLevelsRef = useRef<number[]>([]);
  const durationRef = useRef(0);
  const isPausedRef = useRef(false);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const setTimedError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, 5000);
  }, []);

  // Sync ref with state
  isPausedRef.current = isPaused;
  durationRef.current = duration;

  const cleanupAudioHardware = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioHardware();
    };
  }, [cleanupAudioHardware]);

  const startRecording = useCallback(async (onErrorHandler?: (msg: string) => void): Promise<boolean> => {
    if (!isOriginSecureContext()) {
      const errMsg = 'Microphone requires a secure connection (HTTPS or localhost).';
      setTimedError(errMsg);
      onErrorHandler?.(errMsg);
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errMsg = 'Voice recording is not supported on this browser or platform.';
      setTimedError(errMsg);
      onErrorHandler?.(errMsg);
      return false;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (constraintErr) {
        // Fallback for mobile browsers/devices where complex audio constraints fail
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;
      recordedChunksRef.current = [];
      sampledLevelsRef.current = [];
      setDuration(0);
      durationRef.current = 0;
      setIsPaused(false);
      isPausedRef.current = false;

      // Setup Web Audio Analyser for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          // Safari/iOS requires explicit resume on user gesture
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLiveLevels = () => {
            if (!analyserRef.current || !streamRef.current) return;
            if (!isPausedRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              // Pick 24 frequency levels normalized between 0.1 and 1.0
              const barsCount = 24;
              const step = Math.max(1, Math.floor(dataArray.length / barsCount));
              const currentBars: number[] = [];
              let sum = 0;

              for (let i = 0; i < barsCount; i++) {
                const val = (dataArray[i * step] || 0) / 255;
                const normalized = Math.max(0.12, Math.min(1.0, val * 1.6));
                currentBars.push(normalized);
                sum += val;
              }

              const avgVolume = sum / barsCount;
              sampledLevelsRef.current.push(avgVolume);
              setLiveLevels(currentBars);
            }
            animFrameRef.current = requestAnimationFrame(updateLiveLevels);
          };

          animFrameRef.current = requestAnimationFrame(updateLiveLevels);
        }
      } catch {
        // Fallback animated levels if AudioContext fails
      }

      const { mimeType } = getAudioMimeType();
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        // If the specified mimeType is rejected by browser constructor, construct default
        mediaRecorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200); // 200ms timeslices for smooth data chunking
      setIsRecording(true);

      // Start duration counter with precise active-time accumulation
      let accumulatedMs = 0;
      let lastTick = Date.now();

      timerRef.current = setInterval(() => {
        const now = Date.now();
        if (!isPausedRef.current) {
          accumulatedMs += (now - lastTick);
          const totalElapsed = Math.floor(accumulatedMs / 1000);
          setDuration(totalElapsed);
          durationRef.current = totalElapsed;
          // Safety cap: auto stop if recording exceeds 60 minutes
          if (totalElapsed >= 3600 && timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              try { mediaRecorderRef.current.stop(); } catch {}
            }
          }
        }
        lastTick = now;
      }, 250);

      return true;
    } catch (err: unknown) {
      cleanupAudioHardware();
      const errName = (err && typeof err === 'object' && 'name' in err)
        ? String((err as { name?: unknown }).name)
        : (err instanceof Error ? err.name : '');
      let errMsg = 'Unable to start recording. Please check your microphone settings.';
      if (!isOriginSecureContext()) {
        errMsg = 'Microphone requires a secure connection (HTTPS or localhost).';
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        errMsg = 'Microphone access was denied. Please allow microphone permissions in browser settings.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        errMsg = 'No microphone found on this device.';
      }
      setTimedError(errMsg);
      onErrorHandler?.(errMsg);
      return false;
    }
  }, [cleanupAudioHardware, setTimedError]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
      } catch {}
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        isPausedRef.current = false;
      } catch {}
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
    }
    cleanupAudioHardware();
    recordedChunksRef.current = [];
    sampledLevelsRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    durationRef.current = 0;
    setLiveLevels(new Array(24).fill(0.15));
  }, [cleanupAudioHardware]);

  // Cancel recording on Escape key press
  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, cancelRecording]);

  const stopRecording = useCallback((): Promise<VoiceRecordingResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cancelRecording();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const finalDuration = Math.max(1, durationRef.current);
        const { mimeType, extension } = getAudioMimeType();
        let blobType = recordedChunksRef.current[0]?.type || mimeType || (extension === 'mp4' ? 'audio/mp4' : 'audio/webm');
        if (blobType.startsWith('video/')) {
          blobType = blobType.replace(/^video\//, 'audio/');
        }
        if (!blobType || blobType === 'application/octet-stream') {
          blobType = extension === 'mp4' ? 'audio/mp4' : 'audio/webm';
        }
        const audioBlob = new Blob(recordedChunksRef.current, { type: blobType });

        if (recordedChunksRef.current.length === 0 || audioBlob.size === 0) {
          cleanupAudioHardware();
          setIsRecording(false);
          setIsPaused(false);
          setDuration(0);
          durationRef.current = 0;
          setLiveLevels(new Array(24).fill(0.15));
          resolve(null);
          return;
        }

        const fileName = `voice-message-${Date.now()}.${extension}`;
        const audioFile = new File([audioBlob], fileName, { type: blobType });

        // Normalize sampled levels to 32 waveform bars
        const targetBars = 32;
        const sampled = sampledLevelsRef.current;
        const normalizedWaveform: number[] = [];

        if (sampled.length >= targetBars) {
          const step = sampled.length / targetBars;
          for (let i = 0; i < targetBars; i++) {
            const index = Math.floor(i * step);
            const val = sampled[index] || 0.2;
            normalizedWaveform.push(Math.round(Math.max(0.15, Math.min(1.0, val * 1.8)) * 100) / 100);
          }
        } else {
          // If short recording, generate pseudo-natural voice waveform bars
          const sampleLen = sampled.length || 1;
          for (let i = 0; i < targetBars; i++) {
            const sampleVal = sampled.length > 0 ? (sampled[i % sampleLen] || 0.1) : 0.1;
            const wave = 0.25 + 0.5 * Math.abs(Math.sin((i / targetBars) * Math.PI * 3 + sampleVal));
            normalizedWaveform.push(Math.round(Math.max(0.15, Math.min(0.95, wave)) * 100) / 100);
          }
        }

        cleanupAudioHardware();
        setIsRecording(false);
        setIsPaused(false);
        setDuration(0);
        durationRef.current = 0;
        setLiveLevels(new Array(24).fill(0.15));

        resolve({
          file: audioFile,
          duration: finalDuration,
          waveform: normalizedWaveform,
        });
      };

      try {
        recorder.stop();
      } catch {
        cancelRecording();
        resolve(null);
      }
    });
  }, [cancelRecording, cleanupAudioHardware]);

  return {
    isRecording,
    isPaused,
    duration,
    liveLevels,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    stopRecording,
  };
}
