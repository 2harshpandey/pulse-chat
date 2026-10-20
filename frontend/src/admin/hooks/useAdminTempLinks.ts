import { useState } from 'react';
import type { TempLinkData } from '../types';
import { sanitizePathId } from '../utils';
import { copyTextToClipboard } from '../../chat/utils';

interface UseAdminTempLinksOptions {
  apiUrl: string;
  apiHeaders: () => Record<string, string>;
}

export function useAdminTempLinks({ apiUrl, apiHeaders }: UseAdminTempLinksOptions) {
  const [tempLinks, setTempLinks] = useState<TempLinkData[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);

  const handleCreateTempLink = async () => {
    setCreatingLink(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/temp-links`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (res.ok) {
        const newLink = await res.json();
        setTempLinks((prev) => {
          if (prev.some((l) => l._id === newLink._id)) return prev;
          return [newLink, ...prev];
        });
      } else {
        console.error('Failed to create temp link:', await res.text());
      }
    } catch (err) {
      console.error('Failed to create temp link', err);
    }
    setCreatingLink(false);
  };

  const handleRevokeTempLink = async (id: string) => {
    try {
      const safeId = sanitizePathId(id);
      const res = await fetch(`${apiUrl}/api/admin/temp-links/${safeId}/revoke`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (res.ok) {
        const revokedLink = await res.json();
        setTempLinks((prev) => prev.map((l) => (l._id === id ? revokedLink : l)));
      } else {
        const errText = await res.text();
        console.error('Failed to revoke temp link:', errText);
        alert('Failed to revoke link: ' + errText);
      }
    } catch (err: any) {
      console.error('Failed to revoke temp link', err);
      alert('Failed to revoke link: ' + err.message);
    }
  };

  const handleCopyLink = async (token: string, id: string) => {
    const link = `${window.location.origin}/join/${token}`;
    const ok = await copyTextToClipboard(link);
    if (ok) {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  return {
    tempLinks,
    setTempLinks,
    copiedLinkId,
    setCopiedLinkId,
    creatingLink,
    setCreatingLink,
    handleCreateTempLink,
    handleRevokeTempLink,
    handleCopyLink,
  };
}
