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
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mimeType: 'audio/mp4', extension: 'mp4' },
    { mimeType: 'audio/aac', extension: 'aac' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', extension: 'webm' };
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

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Voice recording is not supported on this browser or platform.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

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
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
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
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setTimedError('Microphone access was denied. Please allow microphone permissions in browser settings.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setTimedError('No microphone found on this device.');
      } else {
        setTimedError('Unable to start recording. Please check your microphone settings.');
      }
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
        const blobType = recordedChunksRef.current[0]?.type || mimeType || 'audio/webm';
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
