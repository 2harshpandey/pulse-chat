import React, { useState, useRef, useEffect } from 'react';
import { copyTextToClipboard } from '../../chat/utils';
import { LogsCopyButton as StyledCopyBtn } from '../AdminStyledComponents';

export interface LogsCopyButtonProps {
  getLogsText: () => string;
  hasLogs: boolean;
  label?: string;
}

export function LogsCopyButton({
  getLogsText,
  hasLogs,
  label = 'Copy Logs',
}: LogsCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!hasLogs || copied) return;

    const text = getLogsText();
    if (!text || text.trim().length === 0) return;

    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  return (
    <StyledCopyBtn
      type="button"
      onClick={handleCopy}
      disabled={!hasLogs}
      $copied={copied}
      title={copied ? 'Copied to clipboard!' : `Copy all ${label.toLowerCase()} to clipboard`}
      aria-label={copied ? 'Copied to clipboard' : label}
    >
      {copied ? (
        <>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </StyledCopyBtn>
  );
}
