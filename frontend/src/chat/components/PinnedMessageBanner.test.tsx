import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PinnedMessageBanner } from './PinnedMessageBanner';

describe('PinnedMessageBanner', () => {
  it('renders nothing when pinnedMessages array is empty', () => {
    const { container } = render(
      <PinnedMessageBanner
        pinnedMessages={[]}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when pinned message is marked isDeleted', () => {
    const deletedPins = [
      {
        id: 'msg-1',
        text: 'How can i access',
        isDeleted: true,
        type: 'text',
      },
    ];

    const { container } = render(
      <PinnedMessageBanner
        pinnedMessages={deletedPins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('How can i access')).toBeNull();
  });

  it('renders nothing when pinned message is vanished', () => {
    const vanishedPins = [
      {
        id: 'msg-1',
        text: 'Secret info',
        vanished: true,
        type: 'text',
      },
    ];

    const { container } = render(
      <PinnedMessageBanner
        pinnedMessages={vanishedPins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when pinned message has admin deletion placeholder text', () => {
    const adminDeletedPins = [
      {
        id: 'msg-1',
        text: 'This message has been deleted by an admin.',
        type: 'text',
      },
    ];

    const { container } = render(
      <PinnedMessageBanner
        pinnedMessages={adminDeletedPins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('filters out deleted pins and only displays valid active pins', () => {
    const mixedPins = [
      {
        id: 'msg-1',
        text: 'Deleted question',
        isDeleted: true,
        type: 'text',
      },
      {
        id: 'msg-2',
        text: 'Active pinned announcement',
        type: 'text',
      },
    ];

    render(
      <PinnedMessageBanner
        pinnedMessages={mixedPins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );

    expect(screen.queryByText('Deleted question')).toBeNull();
    expect(screen.getByText('Active pinned announcement')).toBeTruthy();
    expect(screen.getByText('Pinned Message')).toBeTruthy();
  });
});
