import React from 'react';
import type { Gif } from '../../types';
import {
  GifPickerModal as StyledGifPickerModal,
  GifPickerContent,
  GifSearchBar,
  GifGrid,
  GifGridItem,
} from '../../Chat.styles';

export interface GifPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  isLoading: boolean;
  error: string;
  onRetry: () => void;
  results: Gif[];
  onSelectGif: (gif: Gif) => void;
  openedAtRef?: React.RefObject<number>;
  contentRef?: React.RefObject<HTMLDivElement>;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export const GifPickerModal: React.FC<GifPickerModalProps> = ({
  isOpen,
  onClose,
  searchTerm,
  onSearchTermChange,
  isLoading,
  error,
  onRetry,
  results,
  onSelectGif,
  openedAtRef,
  contentRef,
  inputRef,
}) => {
  if (!isOpen) return null;

  return (
    <StyledGifPickerModal
      onClick={() => {
        if (openedAtRef && openedAtRef.current && Date.now() - openedAtRef.current < 500) return;
        onClose();
      }}
    >
      <GifPickerContent ref={contentRef} onClick={(e) => e.stopPropagation()}>
        <GifSearchBar
          ref={inputRef}
          type="text"
          placeholder="Search for GIFs..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
        />
        {isLoading ? (
          <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
            Loading GIFs...
          </p>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#ef4444' }}>
            <svg
              style={{ width: '32px', height: '32px', marginBottom: '0.5rem', opacity: 0.8 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', lineHeight: '1.4' }}>
              {error.includes('not configured')
                ? 'GIFs are not available right now.'
                : 'Could not load GIFs. Please check your connection.'}
            </p>
            <button
              onClick={onRetry}
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
                borderRadius: '8px',
                padding: '0.4rem 1rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        ) : results.length === 0 && !isLoading ? (
          <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {searchTerm.trim() ? `No GIFs found for "${searchTerm}"` : 'No GIFs available.'}
          </p>
        ) : (
          <GifGrid>
            {results.map((gif) => (
              <GifGridItem key={gif.id} src={gif.preview} onClick={() => onSelectGif(gif)} />
            ))}
          </GifGrid>
        )}
      </GifPickerContent>
    </StyledGifPickerModal>
  );
};
