import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';

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
}

export const VirtualMessageWrapper = React.memo(({ id, children, containerRef, messageHeightsRef, initialIsVisible }: VirtualMessageWrapperProps) => {
  const [isVisible, setIsVisible] = useState(initialIsVisible);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Measure and cache height if visible
  useLayoutEffect(() => {
    if (isVisible && wrapperRef.current) {
      // Use getBoundingClientRect for sub-pixel precision if needed, but offsetHeight is usually fine
      const height = wrapperRef.current.getBoundingClientRect().height;
      if (height > 0) {
        messageHeightsRef.current[id] = height;
      }
    }
  });

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
      style={{
        // If it is hidden, lock the height to exactly what was measured.
        // If it is visible, let it flow naturally (height: undefined) so it can resize with the window.
        height: !isVisible && cachedHeight !== undefined ? `${cachedHeight}px` : undefined,
        // We use minHeight as a fallback just in case
        minHeight: !isVisible && cachedHeight !== undefined ? `${cachedHeight}px` : undefined,
      }}
    >
      {isVisible ? children : null}
    </div>
  );
});

VirtualMessageWrapper.displayName = 'VirtualMessageWrapper';
