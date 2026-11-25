import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { repairMojibakeText, sanitizeFilename, reconcileUploadedMessageInList } from './chat/utils';
import { classifyUploadFile, isAudioMedia, isVideoMedia, isImageMedia } from './shared/mediaTypes';
import { useChatLightbox } from './chat/hooks/useChatLightbox';
import { DownloadProgressRing } from './chat/styles/chat.video.styles';

describe('Audit Fixes & Consolidations Regression Suite', () => {
  it('preserves ASCII hyphens in repairMojibakeText and sanitizeFilename while repairing mojibake', () => {
    expect(repairMojibakeText('my-report-2026-v1.pdf')).toBe('my-report-2026-v1.pdf');
    expect(sanitizeFilename('Q4-Sales-Report_final-v2.pdf')).toBe('Q4-Sales-Report_final-v2.pdf');

    // Repairs Latin-1 / Win-1252 mojibake without corrupting normal text
    expect(repairMojibakeText('It\u00e2\u20ac\u2122s \u00e2\u20ac\u0153ok\u00e2\u20ac\u009d \u00e2\u20ac\u201c test\u00e2\u20ac\u00a6')).toBe('It\'s "ok" - test...');
    expect(repairMojibakeText('100\u00e2\u201a\u00ac')).toBe('100EUR');
  });

  it('classifies images, videos, and audio consistently including modern extensions', () => {
    expect(classifyUploadFile({ name: 'photo.avif', type: '' })).toBe('image');
    expect(classifyUploadFile({ name: 'shot.heic', type: '' })).toBe('image');
    expect(classifyUploadFile({ name: 'clip.mkv', type: '' })).toBe('video');
    expect(classifyUploadFile({ name: 'movie.m4v', type: '' })).toBe('video');
    expect(classifyUploadFile({ name: 'track.opus', type: '' })).toBe('audio');
    expect(classifyUploadFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe('file');

    expect(isAudioMedia({ type: 'file', originalName: 'voice-message.webm', url: 'https://cdn.example/voice.webm' })).toBe(true);
    expect(isVideoMedia({ type: 'video', originalName: 'clip.mkv', url: 'https://cdn.example/clip.mkv' })).toBe(true);
    expect(isImageMedia({ originalName: 'photo.avif', url: 'https://cdn.example/photo.avif?v=1' })).toBe(true);
  });

  it('delegates useChatLightbox zoom state and actions cleanly via usePhotoZoom', () => {
    const { result } = renderHook(() => useChatLightbox());
    expect(result.current.lightboxUrl).toBeNull();
    expect(result.current.lightboxTransform.scale).toBe(1);

    act(() => {
      result.current.openLightbox('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg');
    });
    expect(result.current.lightboxUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg');

    const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;
    act(() => {
      result.current.handleLightboxZoomIn(mockEvent);
    });
    expect(result.current.lightboxTransform.scale).toBeGreaterThan(1);
    expect(result.current.canZoomOutLightbox).toBe(true);

    act(() => {
      result.current.closeLightbox();
    });
    expect(result.current.lightboxUrl).toBeNull();
  });

  it('reconciles temp upload IDs on both uploaded message and pending reply references', () => {
    const updated = reconcileUploadedMessageInList(
      [
        {
          id: 'temp-1',
          userId: 'u1',
          username: 'Alice',
          type: 'image',
          url: 'blob:temp',
          text: '',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          id: 'msg-2',
          userId: 'u2',
          username: 'Bob',
          type: 'text',
          text: 'Nice!',
          timestamp: '2026-01-01T00:00:01Z',
          replyingTo: { id: 'temp-1', username: 'Alice', text: 'Image', type: 'image', url: 'blob:temp' },
        },
      ],
      'temp-1',
      {
        id: 'server-99',
        userId: 'u1',
        username: 'Alice',
        type: 'image',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/final.jpg',
        text: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
    );

    expect(updated[0].id).toBe('server-99');
    expect(updated[1].replyingTo?.id).toBe('server-99');
    expect(updated[1].replyingTo?.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/final.jpg');
  });

  it('renders styled-components with valid kebab-case SVG CSS properties (no camelCase strokeWidth)', () => {
    render(
      <DownloadProgressRing $progress={0.5} $visible={true}>
        <svg viewBox="0 0 36 36">
          <circle className="track" cx="18" cy="18" r="15" />
          <circle className="progress" cx="18" cy="18" r="15" />
        </svg>
      </DownloadProgressRing>
    );
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent || '')
      .join('\n');
    expect(styleText).toContain('stroke-width:3');
    expect(styleText).toContain('stroke-linecap:round');
    expect(styleText).not.toContain('strokeWidth');
  });
});
