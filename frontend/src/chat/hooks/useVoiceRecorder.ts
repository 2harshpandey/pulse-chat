import { useState, useRef, useCallback, useEffect } from 'react';
import { sendClientDiagnostic } from '../telemetry';

export interface VoiceRecordingResult {
  file: File;
  duration: number;
  waveform: number[];
}

export interface VoicePreviewSnapshot {
  previewUrl: string;
  duration: number;
  waveform: number[];
}

function encodeMonoWavFromBuffers(buffers: AudioBuffer[]): Blob | null {
  if (!buffers.length) return null;
  const sampleRate = buffers[0].sampleRate || 44100;
  let totalFrames = 0;
  for (const buf of buffers) {
    totalFrames += buf.length;
  }
  if (totalFrames <= 0) return null;

  const pcmLength = totalFrames * 2;
  const arrayBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate = sampleRate * 1 * 2
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, pcmLength, true);

  let writeOffset = 44;
  for (const buf of buffers) {
    const channels = buf.numberOfChannels || 1;
    const channelArrays: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      channelArrays.push(buf.getChannelData(ch));
    }
    for (let i = 0; i < buf.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += channelArrays[ch][i] || 0;
      }
      const sample = Math.max(-1, Math.min(1, sum / channels));
      view.setInt16(writeOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      writeOffset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function mergeAudioSegments(blobs: Blob[]): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  const validBlobs = blobs.filter(b => b && b.size > 0);
  const { mimeType, extension } = getAudioMimeType();
  const fallbackMime = validBlobs[0]?.type || mimeType || (extension === 'mp4' ? 'audio/mp4' : 'audio/webm');
  const fallbackExt = fallbackMime.includes('mp4') ? 'mp4' : fallbackMime.includes('wav') ? 'wav' : extension;

  if (validBlobs.length === 0) {
    return { blob: new Blob([], { type: fallbackMime }), mimeType: fallbackMime, extension: fallbackExt };
  }
  if (validBlobs.length === 1) {
    return { blob: validBlobs[0], mimeType: validBlobs[0].type || fallbackMime, extension: fallbackExt };
  }

  if (typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      let decodeCtx: AudioContext | null = null;
      try {
        decodeCtx = new AudioCtx();
        const decoded: AudioBuffer[] = [];
        for (const b of validBlobs) {
          const arr = await b.arrayBuffer();
          const buf = await decodeCtx.decodeAudioData(arr);
          decoded.push(buf);
        }
        const wavBlob = encodeMonoWavFromBuffers(decoded);
        if (wavBlob && wavBlob.size > 44) {
          return { blob: wavBlob, mimeType: 'audio/wav', extension: 'wav' };
        }
      } catch {
        // Fallback below when decodeAudioData is unavailable in environment
      } finally {
        if (decodeCtx) {
          try { await decodeCtx.close(); } catch {}
        }
      }
    }
  }

  return {
    blob: new Blob(validBlobs, { type: fallbackMime }),
    mimeType: fallbackMime,
    extension: fallbackExt,
  };
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

function buildNormalizedWaveform(sampled: number[], targetBars = 32): number[] {
  const normalizedWaveform: number[] = [];
  if (sampled.length >= targetBars) {
    const step = sampled.length / targetBars;
    for (let i = 0; i < targetBars; i++) {
      const index = Math.floor(i * step);
      const val = sampled[index] || 0.2;
      normalizedWaveform.push(Math.round(Math.max(0.15, Math.min(1.0, val * 1.8)) * 100) / 100);
    }
  } else {
    const sampleLen = sampled.length || 1;
    for (let i = 0; i < targetBars; i++) {
      const sampleVal = sampled.length > 0 ? (sampled[i % sampleLen] || 0.1) : 0.1;
      const wave = 0.25 + 0.5 * Math.abs(Math.sin((i / targetBars) * Math.PI * 3 + sampleVal));
      normalizedWaveform.push(Math.round(Math.max(0.15, Math.min(0.95, wave)) * 100) / 100);
    }
  }
  return normalizedWaveform;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>(() => new Array(24).fill(0.15));
  const [error, setError] = useState<string | null>(null);
  const [cachedPreviewSnapshot, setCachedPreviewSnapshot] = useState<VoicePreviewSnapshot | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const segmentsRef = useRef<Blob[]>([]);
  const sampledLevelsRef = useRef<number[]>([]);
  const durationRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onErrorHandlerRef = useRef<((msg: string) => void) | undefined>(undefined);
  const pendingSegmentFinalizeRef = useRef<Promise<void> | null>(null);
  const cachedPreviewRef = useRef<{
    segmentCount: number;
    snapshot: VoicePreviewSnapshot;
    file: File;
  } | null>(null);

  const setTimedError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, 5000);
  }, []);

  // Sync refs with state
  isRecordingRef.current = isRecording;
  isPausedRef.current = isPaused;
  durationRef.current = duration;

  const clearCachedPreview = useCallback(() => {
    if (cachedPreviewRef.current?.snapshot.previewUrl) {
      try {
        URL.revokeObjectURL(cachedPreviewRef.current.snapshot.previewUrl);
      } catch {}
    }
    cachedPreviewRef.current = null;
    setCachedPreviewSnapshot(null);
  }, []);

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
      clearCachedPreview();
      cleanupAudioHardware();
    };
  }, [clearCachedPreview, cleanupAudioHardware]);

  const startSegmentRecorder = useCallback((stream: MediaStream): string => {
    recordedChunksRef.current = [];
    const { mimeType } = getAudioMimeType();
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      mediaRecorder = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.start(200);
    return mimeType;
  }, []);

  const finalizeCurrentSegment = useCallback((): Promise<void> => {
    if (pendingSegmentFinalizeRef.current) {
      return pendingSegmentFinalizeRef.current;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      if (recordedChunksRef.current.length > 0) {
        const { mimeType, extension } = getAudioMimeType();
        let blobType = recordedChunksRef.current[0]?.type || mimeType || (extension === 'mp4' ? 'audio/mp4' : 'audio/webm');
        if (blobType.startsWith('video/')) blobType = blobType.replace(/^video\//, 'audio/');
        if (!blobType || blobType === 'application/octet-stream') {
          blobType = extension === 'mp4' ? 'audio/mp4' : 'audio/webm';
        }
        const segBlob = new Blob(recordedChunksRef.current, { type: blobType });
        if (segBlob.size > 0) segmentsRef.current.push(segBlob);
        recordedChunksRef.current = [];
      }
      mediaRecorderRef.current = null;
      return Promise.resolve();
    }

    const promise = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const { mimeType, extension } = getAudioMimeType();
        let blobType = recordedChunksRef.current[0]?.type || mimeType || (extension === 'mp4' ? 'audio/mp4' : 'audio/webm');
        if (blobType.startsWith('video/')) {
          blobType = blobType.replace(/^video\//, 'audio/');
        }
        if (!blobType || blobType === 'application/octet-stream') {
          blobType = extension === 'mp4' ? 'audio/mp4' : 'audio/webm';
        }
        const segBlob = new Blob(recordedChunksRef.current, { type: blobType });
        if (recordedChunksRef.current.length > 0 && segBlob.size > 0) {
          segmentsRef.current.push(segBlob);
        }
        recordedChunksRef.current = [];
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        resolve();
      };

      try {
        recorder.stop();
      } catch {
        recordedChunksRef.current = [];
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        resolve();
      }
    }).finally(() => {
      if (pendingSegmentFinalizeRef.current === promise) {
        pendingSegmentFinalizeRef.current = null;
      }
    });

    pendingSegmentFinalizeRef.current = promise;
    return promise;
  }, []);

  const acquireMicrophoneStream = useCallback(async (): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      // Fallback for mobile browsers/devices where complex audio constraints fail
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }, []);

  const reportMicrophoneError = useCallback((err: unknown, overrideHandler?: (msg: string) => void) => {
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
    sendClientDiagnostic('voice_record_error', { error: errName, message: errMsg });
    setTimedError(errMsg);
    (overrideHandler || onErrorHandlerRef.current)?.(errMsg);
  }, [setTimedError]);

  const isStreamLive = useCallback((stream: MediaStream | null): boolean => {
    if (!stream) return false;
    const tracks = typeof stream.getAudioTracks === 'function'
      ? stream.getAudioTracks()
      : (typeof stream.getTracks === 'function' ? stream.getTracks() : []);
    if (!tracks || tracks.length === 0) return false;
    return tracks.some((track) => track.readyState !== 'ended');
  }, []);

  const attachAnalyserToStream = useCallback((stream: MediaStream) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
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
  }, []);

  const startRecording = useCallback(async (onErrorHandler?: (msg: string) => void): Promise<boolean> => {
    onErrorHandlerRef.current = onErrorHandler;

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
      const stream = await acquireMicrophoneStream();

      clearCachedPreview();
      segmentsRef.current = [];
      streamRef.current = stream;
      recordedChunksRef.current = [];
      sampledLevelsRef.current = [];
      setDuration(0);
      durationRef.current = 0;
      setIsPaused(false);
      isPausedRef.current = false;

      attachAnalyserToStream(stream);

      const mimeType = startSegmentRecorder(stream);
      isRecordingRef.current = true;
      setIsRecording(true);
      sendClientDiagnostic('voice_record_start', { mimeType });

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
      reportMicrophoneError(err, onErrorHandler);
      return false;
    }
  }, [acquireMicrophoneStream, attachAnalyserToStream, cleanupAudioHardware, clearCachedPreview, reportMicrophoneError, setTimedError, startSegmentRecorder]);

  const preparePreview = useCallback(async (): Promise<VoicePreviewSnapshot | null> => {
    if (!isRecordingRef.current) return null;
    if (!isPausedRef.current) {
      setIsPaused(true);
      isPausedRef.current = true;
    }
    await finalizeCurrentSegment();
    if (!isRecordingRef.current || !isPausedRef.current || segmentsRef.current.length === 0) {
      return null;
    }

    if (
      cachedPreviewRef.current &&
      cachedPreviewRef.current.segmentCount === segmentsRef.current.length
    ) {
      setCachedPreviewSnapshot(cachedPreviewRef.current.snapshot);
      return cachedPreviewRef.current.snapshot;
    }

    const merged = await mergeAudioSegments(segmentsRef.current);
    if (!isRecordingRef.current || !isPausedRef.current || merged.blob.size === 0) {
      return null;
    }

    const previewDuration = Math.max(1, durationRef.current);
    const waveform = buildNormalizedWaveform(sampledLevelsRef.current);
    const file = new File([merged.blob], `voice-message-${Date.now()}.${merged.extension}`, {
      type: merged.mimeType,
    });

    clearCachedPreview();
    const previewUrl = URL.createObjectURL(file);
    const snapshot: VoicePreviewSnapshot = {
      previewUrl,
      duration: previewDuration,
      waveform,
    };
    cachedPreviewRef.current = {
      segmentCount: segmentsRef.current.length,
      snapshot,
      file,
    };
    setCachedPreviewSnapshot(snapshot);
    return snapshot;
  }, [clearCachedPreview, finalizeCurrentSegment]);

  const pauseRecording = useCallback(() => {
    if (!isRecordingRef.current || isPausedRef.current) return;
    setIsPaused(true);
    isPausedRef.current = true;
    sendClientDiagnostic('voice_record_pause', { durationSeconds: durationRef.current });
    void preparePreview();
  }, [preparePreview]);

  const resumeRecording = useCallback(async (): Promise<boolean> => {
    if (!isRecordingRef.current || !isPausedRef.current) return false;
    await finalizeCurrentSegment();
    if (!isRecordingRef.current) return false;

    let activeStream = streamRef.current;
    if (!isStreamLive(activeStream)) {
      if (activeStream) {
        try {
          activeStream.getTracks().forEach((t) => t.stop());
        } catch {}
        streamRef.current = null;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reportMicrophoneError(Object.assign(new Error('No microphone found'), { name: 'NotFoundError' }));
        return false;
      }
      try {
        activeStream = await acquireMicrophoneStream();
        if (!isStreamLive(activeStream)) {
          reportMicrophoneError(Object.assign(new Error('No microphone found'), { name: 'NotFoundError' }));
          return false;
        }
        streamRef.current = activeStream;
        attachAnalyserToStream(activeStream);
      } catch (err) {
        reportMicrophoneError(err);
        return false;
      }
    }

    if (!activeStream) {
      reportMicrophoneError(Object.assign(new Error('No microphone found'), { name: 'NotFoundError' }));
      return false;
    }

    try {
      clearCachedPreview();
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      startSegmentRecorder(activeStream);
      setIsPaused(false);
      isPausedRef.current = false;
      sendClientDiagnostic('voice_record_resume', { durationSeconds: durationRef.current });
      return true;
    } catch (err) {
      reportMicrophoneError(err);
      return false;
    }
  }, [
    acquireMicrophoneStream,
    attachAnalyserToStream,
    clearCachedPreview,
    finalizeCurrentSegment,
    isStreamLive,
    reportMicrophoneError,
    startSegmentRecorder,
  ]);

  const cancelRecording = useCallback(() => {
    sendClientDiagnostic('voice_record_cancel', { durationSeconds: durationRef.current });
    isRecordingRef.current = false;
    isPausedRef.current = false;
    clearCachedPreview();
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    pendingSegmentFinalizeRef.current = null;
    cleanupAudioHardware();
    recordedChunksRef.current = [];
    segmentsRef.current = [];
    sampledLevelsRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    durationRef.current = 0;
    setLiveLevels(new Array(24).fill(0.15));
  }, [cleanupAudioHardware, clearCachedPreview]);

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

  // Pause handler declared above preparePreview consumer order

  const stopRecording = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    if (!isRecordingRef.current && !mediaRecorderRef.current && segmentsRef.current.length === 0) {
      cancelRecording();
      return null;
    }

    await finalizeCurrentSegment();

    if (segmentsRef.current.length === 0) {
      cancelRecording();
      return null;
    }

    const finalDuration = Math.max(1, durationRef.current);
    let audioFile: File;
    let normalizedWaveform: number[];

    if (
      cachedPreviewRef.current &&
      cachedPreviewRef.current.segmentCount === segmentsRef.current.length
    ) {
      audioFile = cachedPreviewRef.current.file;
      normalizedWaveform = cachedPreviewRef.current.snapshot.waveform;
    } else {
      const merged = await mergeAudioSegments(segmentsRef.current);
      if (merged.blob.size === 0) {
        cancelRecording();
        return null;
      }
      audioFile = new File([merged.blob], `voice-message-${Date.now()}.${merged.extension}`, {
        type: merged.mimeType,
      });
      normalizedWaveform = buildNormalizedWaveform(sampledLevelsRef.current);
    }

    isRecordingRef.current = false;
    isPausedRef.current = false;
    clearCachedPreview();
    cleanupAudioHardware();
    recordedChunksRef.current = [];
    segmentsRef.current = [];
    sampledLevelsRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    durationRef.current = 0;
    setLiveLevels(new Array(24).fill(0.15));

    sendClientDiagnostic('voice_record_complete', { durationSeconds: finalDuration, fileSize: audioFile.size });

    return {
      file: audioFile,
      duration: finalDuration,
      waveform: normalizedWaveform,
    };
  }, [cancelRecording, cleanupAudioHardware, clearCachedPreview, finalizeCurrentSegment]);

  return {
    isRecording,
    isPaused,
    duration,
    liveLevels,
    error,
    cachedPreviewSnapshot,
    startRecording,
    pauseRecording,
    resumeRecording,
    preparePreview,
    cancelRecording,
    stopRecording,
  };
}
