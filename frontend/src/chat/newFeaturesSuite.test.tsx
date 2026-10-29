import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { usePhotoZoom } from './hooks/usePhotoZoom';
import { useChatReactions } from './hooks/useChatReactions';
import { MediaGalleryModal } from './components/modals/MediaGalleryModal';
import { FilePreviewModal } from './components/modals/FilePreviewModal';
import type { Message } from './types';

describe('New Chat Features Test Suite', () => {
  describe('usePhotoZoom Hook', () => {
    it('initializes with scale 1 and not zoomed', () => {
      const { result } = renderHook(() => usePhotoZoom());
      expect(result.current.transform.scale).toBe(1);
      expect(result.current.isZoomed).toBe(false);
      expect(result.current.canZoomOut).toBe(false);
      expect(result.current.canZoomIn).toBe(true);
    });

    it('zooms in on handleZoomIn and enables zoom out', () => {
      const { result } = renderHook(() => usePhotoZoom());
      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;

      act(() => {
        result.current.handleZoomIn(mockEvent);
      });

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(result.current.transform.scale).toBeGreaterThan(1);
      expect(result.current.isZoomed).toBe(true);
      expect(result.current.canZoomOut).toBe(true);
    });

    it('resets zoom back to scale 1 on resetZoom', () => {
      const { result } = renderHook(() => usePhotoZoom());
      const mockEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent<HTMLButtonElement>;

      act(() => {
        result.current.handleZoomIn(mockEvent);
      });
      expect(result.current.transform.scale).toBeGreaterThan(1);

      act(() => {
        result.current.resetZoom();
      });
      expect(result.current.transform.scale).toBe(1);
      expect(result.current.isZoomed).toBe(false);
    });

    it('zooms in on double tap and unzooms back to normal state on second double tap', () => {
      const { result } = renderHook(() => usePhotoZoom());
      expect(result.current.isZoomed).toBe(false);
      expect(result.current.transform.scale).toBe(1);

      const nowSpy = vi.spyOn(Date, 'now');
      const baseTime = 1000000;
      nowSpy.mockReturnValue(baseTime);

      // First double tap: zoom in
      act(() => {
        result.current.handleDoubleTap(200, 300);
      });
      expect(result.current.transform.scale).toBe(2.5);
      expect(result.current.isZoomed).toBe(true);

      // Advance clock past debounce (400ms)
      nowSpy.mockReturnValue(baseTime + 400);

      // Second double tap: restore to normal state (1x, x: 0, y: 0)
      act(() => {
        result.current.handleDoubleTap(200, 300);
      });
      expect(result.current.transform.scale).toBe(1);
      expect(result.current.transform.x).toBe(0);
      expect(result.current.transform.y).toBe(0);
      expect(result.current.isZoomed).toBe(false);
      nowSpy.mockRestore();
    });

    it('detects pointer double tap gesture and toggles zoom state', () => {
      const { result } = renderHook(() => usePhotoZoom());

      // Simulate first tap
      act(() => {
        result.current.handlePointerDown({
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerId: 1,
          clientX: 151,
          clientY: 150,
        } as any);
      });

      // Small delay between taps (150ms)
      const nowSpy = vi.spyOn(Date, 'now');
      const baseTime = Date.now();
      nowSpy.mockReturnValue(baseTime + 150);

      // Simulate second tap within double-tap window
      act(() => {
        result.current.handlePointerDown({
          pointerId: 1,
          clientX: 152,
          clientY: 151,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerId: 1,
          clientX: 152,
          clientY: 151,
        } as any);
      });

      expect(result.current.isZoomed).toBe(true);
      expect(result.current.transform.scale).toBe(2.5);

      // Second double tap sequence to unzoom
      nowSpy.mockReturnValue(baseTime + 600);
      act(() => {
        result.current.handlePointerDown({
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        } as any);
      });

      nowSpy.mockReturnValue(baseTime + 750);
      act(() => {
        result.current.handlePointerDown({
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        } as any);
      });

      expect(result.current.isZoomed).toBe(false);
      expect(result.current.transform.scale).toBe(1);
      nowSpy.mockRestore();
    });

    it('ignores synthetic emulated mouse dblclick fired shortly after touch gesture', () => {
      const { result } = renderHook(() => usePhotoZoom());
      const nowSpy = vi.spyOn(Date, 'now');
      const baseTime = 2000000;
      nowSpy.mockReturnValue(baseTime);

      // Simulate touch pointer down & up (touch device)
      act(() => {
        result.current.handlePointerDown({
          pointerType: 'touch',
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerType: 'touch',
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        } as any);
      });

      // Advance 120ms for second tap
      nowSpy.mockReturnValue(baseTime + 120);
      act(() => {
        result.current.handlePointerDown({
          pointerType: 'touch',
          pointerId: 1,
          clientX: 101,
          clientY: 100,
        } as any);
      });
      act(() => {
        result.current.handlePointerUp({
          pointerType: 'touch',
          pointerId: 1,
          clientX: 101,
          clientY: 100,
        } as any);
      });

      // The touch double-tap has zoomed in to 2.5x
      expect(result.current.isZoomed).toBe(true);
      expect(result.current.transform.scale).toBe(2.5);

      // Simulate synthetic emulated mouse dblclick fired by mobile browser 320ms after the touch gesture
      nowSpy.mockReturnValue(baseTime + 440);
      const mockDblClickEvent = {
        stopPropagation: vi.fn(),
        clientX: 101,
        clientY: 100,
      } as unknown as React.MouseEvent<HTMLElement>;

      act(() => {
        result.current.handleDoubleClick(mockDblClickEvent);
      });

      // The synthetic dblclick MUST be ignored, preserving the zoomed state!
      expect(result.current.isZoomed).toBe(true);
      expect(result.current.transform.scale).toBe(2.5);

      nowSpy.mockRestore();
    });

    it('handles native desktop mouse double click to zoom and unzoom', () => {
      const { result } = renderHook(() => usePhotoZoom());
      expect(result.current.isZoomed).toBe(false);

      const mockEvent = {
        stopPropagation: vi.fn(),
        clientX: 200,
        clientY: 200,
      } as unknown as React.MouseEvent<HTMLElement>;

      // Native desktop double click zooms in
      act(() => {
        result.current.handleDoubleClick(mockEvent);
      });
      expect(result.current.isZoomed).toBe(true);
      expect(result.current.transform.scale).toBe(2.5);

      // Advance past debounce (400ms)
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(Date.now() + 400);

      // Second native desktop double click unzooms back to 1.0x
      act(() => {
        result.current.handleDoubleClick(mockEvent);
      });
      expect(result.current.isZoomed).toBe(false);
      expect(result.current.transform.scale).toBe(1);
      expect(result.current.transform.x).toBe(0);
      expect(result.current.transform.y).toBe(0);

      nowSpy.mockRestore();
    });
  });

  describe('useChatReactions outside click and escape closing', () => {
    it('closes reaction picker when clicking outside', () => {
      const setMessages = vi.fn();
      const ws = { current: null };
      const chatContainerRef = { current: null };

      const { result } = renderHook(() =>
        useChatReactions({
          userId: 'user1',
          userProfile: { username: 'Alice' } as any,
          roomId: 'room1',
          ws: ws as any,
          setMessages,
          chatContainerRef,
        })
      );

      act(() => {
        result.current.handleOpenReactionPicker('msg1', new DOMRect(10, 10, 50, 50), 'me');
      });

      expect(result.current.reactionPickerData).not.toBeNull();
      expect(result.current.reactionPickerData?.messageId).toBe('msg1');

      // Click on arbitrary empty space outside
      act(() => {
        const outsideDiv = document.createElement('div');
        document.body.appendChild(outsideDiv);
        document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        document.body.removeChild(outsideDiv);
      });

      expect(result.current.reactionPickerData).toBeNull();
    });

    it('closes reaction picker when pressing Escape', () => {
      const setMessages = vi.fn();
      const ws = { current: null };
      const chatContainerRef = { current: null };

      const { result } = renderHook(() =>
        useChatReactions({
          userId: 'user1',
          userProfile: { username: 'Alice' } as any,
          roomId: 'room1',
          ws: ws as any,
          setMessages,
          chatContainerRef,
        })
      );

      act(() => {
        result.current.handleOpenReactionPicker('msg1', new DOMRect(10, 10, 50, 50), 'me');
      });

      expect(result.current.reactionPickerData).not.toBeNull();

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(result.current.reactionPickerData).toBeNull();
    });
  });

  describe('MediaGalleryModal Actions and Zoom', () => {
    const mockItems: Message[] = [
      {
        id: 'msg-photo-1',
        userId: 'user1',
        username: 'Harsh',
        type: 'image',
        url: 'https://example.com/photo1.jpg',
        originalName: 'photo1.jpg',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-photo-2',
        userId: 'user2',
        username: 'Sadhana',
        type: 'image',
        url: 'https://example.com/photo2.jpg',
        originalName: 'photo2.jpg',
        timestamp: new Date().toISOString(),
      },
    ];

    it('renders Reply, React, and Download buttons in the header beside each other', () => {
      const handleSetReply = vi.fn();
      const handleOpenReactionPicker = vi.fn();
      const handleClose = vi.fn();

      render(
        <MediaGalleryModal
          isOpen={true}
          items={mockItems}
          initialIndex={0}
          onClose={handleClose}
          onSetReply={handleSetReply}
          onOpenReactionPicker={handleOpenReactionPicker}
        />
      );

      const replyBtn = screen.getByTitle('Reply to message');
      const reactBtn = screen.getByTitle('React to message');
      const downloadBtn = screen.getByTitle('Download');
      const closeBtn = screen.getByTitle('Close viewer (Esc)');

      expect(replyBtn).toBeInTheDocument();
      expect(reactBtn).toBeInTheDocument();
      expect(downloadBtn).toBeInTheDocument();
      expect(closeBtn).toBeInTheDocument();

      // Clicking reply sets reply and closes gallery
      fireEvent.click(replyBtn);
      expect(handleSetReply).toHaveBeenCalledWith(mockItems[0]);
      expect(handleClose).toHaveBeenCalled();

      // Clicking react opens reaction picker with current item id and rect
      fireEvent.click(reactBtn);
      expect(handleOpenReactionPicker).toHaveBeenCalledWith(
        mockItems[0].id,
        expect.objectContaining({ top: expect.any(Number) }),
        'other'
      );
    });

    it('renders zoom controls for photo items', () => {
      render(
        <MediaGalleryModal
          isOpen={true}
          items={mockItems}
          initialIndex={0}
          onClose={vi.fn()}
        />
      );

      const zoomInBtn = screen.getByTitle('Zoom in');
      const zoomOutBtn = screen.getByTitle('Zoom out');

      expect(zoomInBtn).toBeInTheDocument();
      expect(zoomOutBtn).toBeInTheDocument();
      expect(zoomOutBtn).toBeDisabled();

      fireEvent.click(zoomInBtn);
      expect(zoomOutBtn).not.toBeDisabled();
    });
  });

  describe('FilePreviewModal Photo Crop Feature', () => {
    it('transitions from isOpen=false to isOpen=true without hook count mismatch errors', () => {
      const file = new File(['dummy photo content'], 'sample.jpg', { type: 'image/jpeg' });
      const handleClose = vi.fn();
      const handleSend = vi.fn();
      const handleUpdateFile = vi.fn();

      const { rerender } = render(
        <FilePreviewModal
          isOpen={false}
          stagedFiles={[]}
          previewActiveIndex={0}
          caption=""
          onCaptionChange={vi.fn()}
          onClose={handleClose}
          onSend={handleSend}
          onSelectActiveIndex={vi.fn()}
          onRemoveFile={vi.fn()}
          onAddMoreFiles={vi.fn()}
          onUpdateFile={handleUpdateFile}
        />
      );

      // Now rerender with isOpen=true and stagedFiles (simulating uploading a photo)
      expect(() => {
        rerender(
          <FilePreviewModal
            isOpen={true}
            stagedFiles={[file]}
            previewActiveIndex={0}
            caption=""
            onCaptionChange={vi.fn()}
            onClose={handleClose}
            onSend={handleSend}
            onSelectActiveIndex={vi.fn()}
            onRemoveFile={vi.fn()}
            onAddMoreFiles={vi.fn()}
            onUpdateFile={handleUpdateFile}
          />
        );
      }).not.toThrow();

      expect(screen.getByTitle('Crop photo')).toBeInTheDocument();
    });

    it('shows crop tools and Done button only when crop mode is toggled', () => {
      const file = new File(['dummy photo content'], 'sample.jpg', { type: 'image/jpeg' });
      const handleClose = vi.fn();
      const handleSend = vi.fn();
      const handleUpdateFile = vi.fn();

      render(
        <FilePreviewModal
          isOpen={true}
          stagedFiles={[file]}
          previewActiveIndex={0}
          caption=""
          onCaptionChange={vi.fn()}
          onClose={handleClose}
          onSend={handleSend}
          onSelectActiveIndex={vi.fn()}
          onRemoveFile={vi.fn()}
          onAddMoreFiles={vi.fn()}
          onUpdateFile={handleUpdateFile}
        />
      );

      const cropToggleBtn = screen.getByTitle('Crop photo');
      expect(cropToggleBtn).toBeInTheDocument();

      // Done button should NOT be visible initially before clicking Crop
      expect(screen.queryByText('Done')).not.toBeInTheDocument();

      // Click crop toggle
      fireEvent.click(cropToggleBtn);

      // Now Done button and crop actions (Reset, Undo, Redo) should be visible
      const doneBtn = screen.getByText('Done');
      expect(doneBtn).toBeInTheDocument();
      // Done button is disabled / greyed out when no crop has been adjusted
      expect(doneBtn).toBeDisabled();

      expect(screen.getByTitle('Reset')).toBeInTheDocument();
      expect(screen.getByTitle('Undo')).toBeInTheDocument();
      expect(screen.getByTitle('Redo')).toBeInTheDocument();
      expect(screen.getByTitle('Rotate 90° left')).toBeInTheDocument();
      expect(screen.getByTitle('Rotate 90° right')).toBeInTheDocument();
    });

    it('supports step-by-step undo, redo, rotate 90° left, and rotate 90° right before pressing Done', () => {
      const file = new File(['dummy photo content'], 'sample.jpg', { type: 'image/jpeg' });
      const handleClose = vi.fn();
      const handleSend = vi.fn();
      const handleUpdateFile = vi.fn();

      render(
        <FilePreviewModal
          isOpen={true}
          stagedFiles={[file]}
          previewActiveIndex={0}
          caption=""
          onCaptionChange={vi.fn()}
          onClose={handleClose}
          onSend={handleSend}
          onSelectActiveIndex={vi.fn()}
          onRemoveFile={vi.fn()}
          onAddMoreFiles={vi.fn()}
          onUpdateFile={handleUpdateFile}
        />
      );

      // Open crop mode
      fireEvent.click(screen.getByTitle('Crop photo'));

      // Verify photo preview image renders and does not vanish
      const previewImg = screen.getByAltText('Cropper preview');
      expect(previewImg).toBeInTheDocument();

      const undoBtn = screen.getByTitle('Undo');
      const redoBtn = screen.getByTitle('Redo');
      const rotateRightBtn = screen.getByTitle('Rotate 90° right');
      const rotateLeftBtn = screen.getByTitle('Rotate 90° left');
      const doneBtn = screen.getByText('Done');

      // Initially undo and redo are disabled, done is disabled
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();
      expect(doneBtn).toBeDisabled();

      // Step 1: Click Rotate Right (+90°)
      fireEvent.click(rotateRightBtn);

      // After rotating: Undo is enabled, Done is enabled, Redo is disabled
      expect(undoBtn).not.toBeDisabled();
      expect(doneBtn).not.toBeDisabled();
      expect(redoBtn).toBeDisabled();

      // Step 2: Undo one step
      fireEvent.click(undoBtn);

      // Reverts to initial step: Undo disabled, Redo enabled
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).not.toBeDisabled();

      // Step 3: Redo forward
      fireEvent.click(redoBtn);

      // Back to rotated state: Undo enabled, Done enabled, Redo disabled
      expect(undoBtn).not.toBeDisabled();
      expect(doneBtn).not.toBeDisabled();
      expect(redoBtn).toBeDisabled();

      // Step 4: Click Rotate Left (-90°)
      fireEvent.click(rotateLeftBtn);

      // New step recorded: Undo enabled
      expect(undoBtn).not.toBeDisabled();
    });
  });

  describe('ReactionPicker boundary clamping in grouped media album', () => {
    it('clamps reaction picker inside window boundaries even when opened from right-edge button', async () => {
      const { ReactionsOverlay } = await import('./components/ReactionsOverlay');

      // Simulate window innerWidth = 1000px, button at right edge (left: 920, right: 960)
      const fakeRect = {
        top: 15,
        bottom: 55,
        left: 920,
        right: 960,
        width: 40,
        height: 40,
      } as DOMRect;

      const reactionPickerRef = { current: null };

      render(
        <ReactionsOverlay
          reactionPickerData={{
            messageId: 'msg-right-edge',
            rect: fakeRect,
            sender: 'other',
          }}
          reactionPickerRef={reactionPickerRef as any}
          onReact={vi.fn()}
          onOpenFullEmojiPicker={vi.fn()}
          reactionsPopup={null}
          currentUserId="user1"
          onCloseReactionsPopup={vi.fn()}
        />
      );

      const picker = screen.getByRole('button', { name: '👍' }).parentElement;
      expect(picker).toBeInTheDocument();

      // Verify that computed left is clamped so left + 340 <= window.innerWidth - 12
      // window.innerWidth in jsdom is typically 1024
      const leftPx = parseInt(picker!.style.left, 10);
      expect(leftPx + 340).toBeLessThanOrEqual(window.innerWidth);
      expect(leftPx).toBeGreaterThanOrEqual(10);
    });
  });
});

