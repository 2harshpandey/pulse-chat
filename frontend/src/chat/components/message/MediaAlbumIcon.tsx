import React from 'react';

export interface MediaAlbumIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Modern layered photo album SVG icon for grouped media items.
 */
export const MediaAlbumIcon: React.FC<MediaAlbumIconProps> = ({
  size = 18,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <rect x="3" y="3" width="13" height="13" rx="2" ry="2" />
    <path d="M7 21h12a2 2 0 0 0 2-2V7" />
    <polyline points="7 12 10 9 16 15" />
    <circle cx="8" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
