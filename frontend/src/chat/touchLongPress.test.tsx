import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useMessageGestures } from './components/message/useMessageGestures';
import type { Message } from './types';
import { LONG_PRESS_DURATION_MS, LONG_PRESS_CANCEL_MOVE_PX } from './constants';
import { recordChatScroll, resetChatScrollStateForTesting } from './chatScrollState';
import { MessageReactions } from './components/message/MessageReactions';

const mockMsg: Message = {
  id: 'msg-test-1',
  userId: 'user-2',
  text: 'Hello touch test',
  username: 'Alex',
  timestamp: new Date().toISOString(),
  type: 'text',
};

function TestMessageGestureComponent({
  isMobileView = true,
  isSelectModeActive = false,
  onToggleSelect = vi.fn(),
  onReply = vi.fn(),
  children,
}: {
  isMobileView?: boolean;
  isSelectModeActive?: boolean;
  onToggleSelect?: (id: string) => void;
  onReply?: (msg: Message) => void;
  children?: React.ReactNode;
}) {
  const {
    messageRowRef,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    handleContextMenu,
    handleClickCapture,
  } = useMessageGestures({
    msg: mockMsg,
    isMobileView,
    isSelectModeActive,
    handleSetReply: onReply,
    handleToggleSelectMessage: onToggleSelect,
  });

  return (
    <div
      data-testid="message-row"
      ref={messageRowRef}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
      onTouchStart={handleLongPressStart}
      onTouchMove={handleLongPressMove}
      onTouchEnd={handleLongPressEnd}
    >
      <span>Message content</span>
      {children}
    </div>
  );
}

describe('Touch Screen Long Press & Haptic Behavior', () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    resetChatScrollStateForTesting();
    vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('triggers long press and haptic feedback exactly when LONG_PRESS_DURATION_MS elapses', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();

    // Advance to duration threshold
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
    });

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith('msg-test-1');
    expect(vibrateMock).toHaveBeenCalledWith(35);
  });

  it('does NOT cancel long press when user finger has micro-tremor or moves slightly up/down (within slop)', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    // Advance 150ms into touch
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Simulate thumb tremor: moving 6px down in Y and 4px in X
    const moveObj = { clientX: 104, clientY: 206, identifier: 0, target: row };
    fireEvent.touchMove(row, {
      touches: [moveObj],
      targetTouches: [moveObj],
      changedTouches: [moveObj],
    });

    // Advance the remaining time
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS - 150);
    });

    // Should still trigger successfully because 12px is within natural thumb resting slop
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith(35);
  });

  it('cancels long press when user performs an intentional large scroll movement (> slop)', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Simulate an intentional vertical scroll of 35px
    const moveScrollObj = { clientX: 100, clientY: 235, identifier: 0, target: row };
    fireEvent.touchMove(row, {
      touches: [moveScrollObj],
      targetTouches: [moveScrollObj],
      changedTouches: [moveScrollObj],
    });

    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
    });

    // Should NOT trigger because user is scrolling
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('resiliently completes if finger releases at the exact instant of vibration (>= 320ms hold)', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    // Hold for 330ms (exact vibration moment / a fraction before 370ms)
    act(() => {
      vi.advanceTimersByTime(330);
    });

    // Finger leaves at 330ms
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 200, identifier: 0 }],
    });

    // Should trigger reliably
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith(35);
  });

  it('does NOT trigger long press on quick normal taps (< 200ms)', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 200, identifier: 0 }],
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('triggers on mobile contextmenu event and prevents native browser context popup', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(contextMenuEvent, 'preventDefault');

    fireEvent(row, contextMenuEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith(35);
  });

  it('does NOT trigger long press when user scrolls and then keeps finger resting stationary on screen without lifting it', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    // 1. Touch down
    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    // 2. User drags down 30px to scroll
    act(() => {
      vi.advanceTimersByTime(80);
    });
    const scrollMoveObj = { clientX: 100, clientY: 230, identifier: 0, target: row };
    fireEvent.touchMove(row, {
      touches: [scrollMoveObj],
      targetTouches: [scrollMoveObj],
      changedTouches: [scrollMoveObj],
    });

    // 3. User keeps finger resting on the screen at (100, 230) without lifting it!
    act(() => {
      vi.advanceTimersByTime(800); // Wait long after 370ms
    });

    // Must NOT trigger long press!
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();

    // 4. User finally lifts finger
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ clientX: 100, clientY: 230, identifier: 0 }],
    });

    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('instantly cancels long press timer if chat container scrolls while finger is down, even if finger stays on screen', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    // Touch down on a message
    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Chat container scrolls (e.g. native scroll or touch scroll)
    recordChatScroll();

    // Finger stays resting on screen for another 600ms
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Must NOT trigger long press!
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('does NOT trigger long press when touching screen to stop an active momentum scroll', () => {
    const onToggleSelect = vi.fn();
    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect} />
    );

    const row = getByTestId('message-row');

    // Simulate chat currently in momentum scroll
    recordChatScroll();

    // 50ms later, user puts finger down on message to stop the scrolling list
    act(() => {
      vi.advanceTimersByTime(50);
    });

    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    // Finger rests on screen for 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Must NOT trigger long press!
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('does NOT suppress clicks on .mobile-reaction-picker after long-pressing a message', () => {
    const onToggleSelect = vi.fn();
    const onReactClick = vi.fn();

    const { getByTestId } = render(
      <TestMessageGestureComponent onToggleSelect={onToggleSelect}>
        <div className="mobile-reaction-picker">
          <button data-testid="reaction-emoji-btn" onClick={onReactClick}>
            ❤️
          </button>
        </div>
      </TestMessageGestureComponent>
    );

    const row = getByTestId('message-row');
    const emojiBtn = getByTestId('reaction-emoji-btn');

    // 1. Long press triggers
    const touchObj = { clientX: 100, clientY: 200, identifier: 0, target: row };
    fireEvent.touchStart(row, {
      touches: [touchObj],
      targetTouches: [touchObj],
      changedTouches: [touchObj],
    });

    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS);
    });

    // 2. User lifts finger
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [touchObj],
    });

    // 3. User taps on the reaction emoji
    fireEvent.click(emojiBtn);

    // Click must reach the button!
    expect(onReactClick).toHaveBeenCalledTimes(1);
  });

  it('triggers reaction when tapping an emoji in MessageReactions on touch devices', () => {
    const handleReact = vi.fn();
    const handleCancelSelectMode = vi.fn();

    const { getByText } = render(
      <MessageReactions
        msg={mockMsg}
        sender="other"
        isDeleted={false}
        selectedMessages={[mockMsg.id]}
        validReactions={{}}
        handleReact={handleReact}
        handleCancelSelectMode={handleCancelSelectMode}
        handleOpenFullEmojiPicker={vi.fn()}
        setReactionsPopup={vi.fn()}
      />
    );

    const heartEmoji = getByText('❤️');
    fireEvent.pointerDown(heartEmoji, { pointerType: 'touch', button: 0 });

    expect(handleReact).toHaveBeenCalledWith(mockMsg.id, '❤️');
    expect(handleCancelSelectMode).toHaveBeenCalledTimes(1);
  });
});
