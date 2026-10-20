import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Gif } from '../types';

interface UseChatGifPickerOptions {
  apiBase: string;
  setPresenceActivity: (act: 'typing' | 'gif_selecting' | null) => void;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  isDesktopInteraction: boolean;
  onGifSelectCallback?: (gif: Gif) => void;
}

export function useChatGifPicker({
  apiBase,
  setPresenceActivity,
  messageInputRef,
  isDesktopInteraction,
  onGifSelectCallback,
}: UseChatGifPickerOptions) {
  const [stagedGif, setStagedGif] = useState<Gif | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifResults, setGifResults] = useState<Gif[]>([]);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifError, setGifError] = useState('');
  const [gifFetchKey, setGifFetchKey] = useState(0);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);

  const gifPickerRef = useRef<HTMLDivElement>(null!);
  const gifSearchInputRef = useRef<HTMLInputElement>(null);
  const gifPickerOpenedAtRef = useRef<number>(0);
  const keyboardWasOpenBeforeGifRef = useRef<boolean>(false);

  // GIF fetch effect
  useEffect(() => {
    if (!showGifPicker) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const doFetch = async () => {
      setIsLoadingGifs(true);
      setGifError('');
      try {
        const q = gifSearchTerm.trim();
        const url = q
          ? `${apiBase}/api/gifs/search?q=${encodeURIComponent(q)}`
          : `${apiBase}/api/gifs/trending`;

        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `Failed to fetch GIFs (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setGifResults(data || []);
      } catch (err: any) {
        if (cancelled) return;
        console.error('GIF fetch error', err);
        setGifError(err.message || 'Failed to load GIFs');
        setGifResults([]);
      } finally {
        if (!cancelled) setIsLoadingGifs(false);
      }
    };

    timer = setTimeout(doFetch, gifSearchTerm.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showGifPicker, gifSearchTerm, gifFetchKey, apiBase]);

  const setPresenceActivityRef = useRef(setPresenceActivity);
  useEffect(() => {
    setPresenceActivityRef.current = setPresenceActivity;
  }, [setPresenceActivity]);

  const prevShowGifPickerRef = useRef(showGifPicker);

  useEffect(() => {
    if (showGifPicker) {
      setPresenceActivityRef.current('gif_selecting');
    } else if (prevShowGifPickerRef.current) {
      setGifSearchTerm('');
      setGifResults((prev) => (prev.length > 0 ? [] : prev));
      setGifError('');
      setGifFetchKey(0);
      setIsLoadingGifs(false);
      setPresenceActivityRef.current(null);
      if (keyboardWasOpenBeforeGifRef.current) {
        messageInputRef.current?.focus();
        keyboardWasOpenBeforeGifRef.current = false;
      }
    }
    prevShowGifPickerRef.current = showGifPicker;
  }, [showGifPicker, messageInputRef]);

  useEffect(() => {
    return () => {
      if (prevShowGifPickerRef.current) {
        setPresenceActivityRef.current(null);
      }
    };
  }, []);

  const openGifPicker = useCallback(() => {
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setShowGifPicker(true);
  }, []);

  const closeGifPicker = useCallback(() => {
    setShowGifPicker(false);
    setGifSearchTerm('');
    setGifResults([]);
    setGifError('');
    setIsLoadingGifs(false);
  }, []);

  const handleGifSelect = useCallback(
    (gif: Gif) => {
      setStagedGif(gif);
      if (onGifSelectCallback) {
        onGifSelectCallback(gif);
      }
      closeGifPicker();
    },
    [closeGifPicker, onGifSelectCallback]
  );

  useEffect(() => {
    if (!showGifPicker || !isDesktopInteraction) return;
    requestAnimationFrame(() => {
      const input = gifSearchInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isDesktopInteraction, showGifPicker]);

  return {
    stagedGif,
    setStagedGif,
    showGifPicker,
    setShowGifPicker,
    gifResults,
    setGifResults,
    gifSearchTerm,
    setGifSearchTerm,
    gifError,
    setGifError,
    gifFetchKey,
    setGifFetchKey,
    isLoadingGifs,
    gifPickerRef,
    gifSearchInputRef,
    gifPickerOpenedAtRef,
    keyboardWasOpenBeforeGifRef,
    openGifPicker,
    closeGifPicker,
    handleGifSelect,
  };
}
