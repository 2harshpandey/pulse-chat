import type React from 'react';
import { useEffect } from 'react';
import { isTouchDevice } from '../constants';

/**
 * DOM element ID of the main chat message composer textarea.
 */
export const CHAT_INPUT_ID = 'chat-message-input';

/**
 * Prevents the browser from transferring focus away from the active element
 * (such as `#chat-message-input`) during pointer/mouse activation.
 */
export const preserveKeyboardFocus = (e: React.PointerEvent | React.MouseEvent): void => {
  e.preventDefault();
};

/**
 * Returns `desktopIndex` on non-touch environments and `undefined` on touch devices
 * so non-input interactive containers never steal focus via synthetic touch hit-testing.
 */
export const nonTouchTabIndex = (desktopIndex: number = 0): number | undefined =>
  (isTouchDevice() ? undefined : desktopIndex);

const FOCUSABLE_FORM_OR_EDIT_SELECTOR = [
  'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  'a[href]',
  '[data-allow-blur="true"]',
].join(', ');

const NON_BLURRING_CONTROL_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="slider"]',
  '[role="tab"]',
  '[tabindex]',
  '[data-preserve-keyboard="true"]',
  '[data-cvp-controls]',
  '[data-cvp-timeline]',
  '[data-checkbox]',
  'input[type="range"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="button"]',
].join(', ');

/**
 * Determines whether tapping `target` is intentionally moving focus to another
 * editable text field, link, or explicitly opted-in blur target.
 */
export const shouldAllowFocusTransfer = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(FOCUSABLE_FORM_OR_EDIT_SELECTOR));
};

const isChatComposerFocused = (): boolean => {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return Boolean(active instanceof HTMLElement && active.id === CHAT_INPUT_ID);
};

/**
 * Capture-phase guard that preserves virtual keyboard focus on `#chat-message-input`
 * when tapping non-input UI controls (audio players, reaction pills, download icons,
 * header toggles, video controls, pinned banners, etc.) on mobile and desktop browsers.
 */
export function usePreserveVirtualKeyboard(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const handleCapturePointerDown = (e: PointerEvent) => {
      if (!isChatComposerFocused()) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (shouldAllowFocusTransfer(e.target)) return;
      if (e.target instanceof Element && e.target.closest(NON_BLURRING_CONTROL_SELECTOR)) {
        e.preventDefault();
      }
    };

    const handleCaptureMouseDown = (e: MouseEvent) => {
      if (!isChatComposerFocused()) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (shouldAllowFocusTransfer(e.target)) return;
      const isControlTarget =
        e.target instanceof Element && Boolean(e.target.closest(NON_BLURRING_CONTROL_SELECTOR));
      if (!isTouchDevice() && !isControlTarget) return;
      // Calling preventDefault on touch mousedown (including synthetic touch mousedown)
      // and non-input controls prevents blurring the active textarea without blocking
      // desktop text selection across plain message text.
      e.preventDefault();
    };

    document.addEventListener('pointerdown', handleCapturePointerDown, true);
    document.addEventListener('mousedown', handleCaptureMouseDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleCapturePointerDown, true);
      document.removeEventListener('mousedown', handleCaptureMouseDown, true);
    };
  }, [enabled]);
}
