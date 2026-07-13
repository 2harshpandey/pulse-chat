import React from 'react';

interface VirtualMessageWrapperProps {
  id: string;
  children: React.ReactNode;
  // Kept for prop compatibility with Chat.tsx, though unused internally now
  containerRef?: React.RefObject<HTMLDivElement>;
  messageHeightsRef?: React.MutableRefObject<{ [id: string]: number }>;
  initialIsVisible?: boolean;
}

export const VirtualMessageWrapper = React.memo(({ id, children }: VirtualMessageWrapperProps) => {
  return (
    <div
      data-virtual-id={id}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 100px',
      }}
    >
      {children}
    </div>
  );
});

VirtualMessageWrapper.displayName = 'VirtualMessageWrapper';

