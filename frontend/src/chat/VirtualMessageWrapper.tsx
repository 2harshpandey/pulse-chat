import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { scrollDiag } from '../Chat';

type VisibilityCallback = (isVisible: boolean) => void;

class SharedVisibilityObserver {
  private observer: IntersectionObserver | null = null;
  private currentContainer: HTMLElement | null = null;
  private callbacks = new Map<Element, VisibilityCallback>();

  observe(element: Element, container: HTMLElement, callback: VisibilityCallback) {
    if (this.currentContainer !== container) {
      if (this.observer) this.observer.disconnect();
      this.callbacks.clear();
      this.currentContainer = container;
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const cb = this.callbacks.get(entry.target);
            if (cb) {
              cb(entry.isIntersecting);
            }
          }
        },
        {
          root: container,
          // 2500px is roughly 3 screens. Keeps 1.5 screens above and 1.5 screens below loaded.
          rootMargin: '2500px 0px 2500px 0px',
        }
      );
    }
    this.callbacks.set(element, callback);
    this.observer?.observe(element);
  }

  unobserve(element: Element) {
    this.callbacks.delete(element);
    if (this.observer) {
      this.observer.unobserve(element);
    }
  }
}

export const sharedMessageObserver = new SharedVisibilityObserver();

interface VirtualMessageWrapperProps {
  id: string;
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  messageHeightsRef: React.MutableRefObject<{ [id: string]: number }>;
  initialIsVisible: boolean;
  estimatedHeight: number;
}

export const VirtualMessageWrapper = React.memo(({ id, children, containerRef, messageHeightsRef, initialIsVisible, estimatedHeight }: VirtualMessageWrapperProps) => {
  const [isVisible, setIsVisible] = useState(initialIsVisible);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Continuously measure and cache height while visible using ResizeObserver.
  // This is critical because messages can change height asynchronously AFTER mount
  // (e.g., images loading natively, link previews fetching metadata).
  useLayoutEffect(() => {
    if (!isVisible || !wrapperRef.current) return;
    
    // Measure immediately on mount
    const initialHeight = wrapperRef.current.getBoundingClientRect().height;
    if (initialHeight > 0) {
      if (messageHeightsRef.current[id] !== initialHeight) {
        scrollDiag(`msg[${id}] mounted. height: ${initialHeight}`);
      }
      messageHeightsRef.current[id] = initialHeight;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // borderBoxSize is more accurate but fallback to contentRect height if needed
        const newHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (newHeight > 0 && messageHeightsRef.current[id] !== newHeight) {
          scrollDiag(`msg[${id}] resized to: ${newHeight}`);
          messageHeightsRef.current[id] = newHeight;
        }
      }
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [isVisible, id, messageHeightsRef]);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const handleVisibilityChange = (intersecting: boolean) => {
      if (intersecting) {
        setIsVisible(true);
      } else {
        // Cache height right before hiding just to be perfectly sure
        const height = el.getBoundingClientRect().height;
        if (height > 0) {
          messageHeightsRef.current[id] = height;
        }
        scrollDiag(`msg[${id}] unmounting. cachedHeight: ${height || estimatedHeight}`);
        setIsVisible(false);
      }
    };

    sharedMessageObserver.observe(el, container, handleVisibilityChange);

    return () => {
      sharedMessageObserver.unobserve(el);
    };
  }, [containerRef, id, messageHeightsRef]);

  const cachedHeight = messageHeightsRef.current[id];

  return (
    <div
      ref={wrapperRef}
      data-virtual-id={id}
    >
      {children}
    </div>
  );
});

VirtualMessageWrapper.displayName = 'VirtualMessageWrapper';
