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

  it('triggers onClick callback when banner container is clicked', () => {
    const handleClick = vi.fn();
    const pins = [
      {
        id: 'msg-1',
        text: 'Important reminder',
        type: 'text',
      },
    ];

    render(
      <PinnedMessageBanner
        pinnedMessages={pins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={handleClick}
      />
    );

    const banner = screen.getByText('Important reminder');
    banner.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles currentPinnedIndex exceeding activePins length via safeIndex', () => {
    const pins = [
      {
        id: 'msg-1',
        text: 'Only active announcement',
        type: 'text',
      },
    ];

    render(
      <PinnedMessageBanner
        pinnedMessages={pins}
        currentPinnedIndex={5} // out of bounds index
        isJumpingToPinned={false}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText('Only active announcement')).toBeTruthy();
  });

  it('renders and allows clicking pinned message with standard numeric timestamp ID', () => {
    const handleClick = vi.fn();
    const pins = [
      {
        id: '1782315628560',
        _id: '6a3bfa6ce17bc885af7e8a4e',
        text: 'rebrand.ly/harshphotos',
        type: 'text',
      },
    ];

    render(
      <PinnedMessageBanner
        pinnedMessages={pins}
        currentPinnedIndex={0}
        isJumpingToPinned={false}
        onClick={handleClick}
      />
    );

    const banner = screen.getByText('rebrand.ly/harshphotos');
    banner.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

