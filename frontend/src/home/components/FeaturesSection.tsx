import React from 'react';
import {
  FeaturesContainer,
  FeatureCard,
  IconWrapper
} from '../HomeStyledComponents';

export const FeaturesSection: React.FC = () => {
  return (
    <FeaturesContainer as="section" aria-label="Core features of PulseChat">
      <FeatureCard as="article">
        <IconWrapper $variant="blue" $color="#3b82f6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </IconWrapper>
        <h2>Password-Protected Rooms</h2>
        <p>Create private, password-protected chat rooms, open public lounges, or share temporary /join invite links with zero signup.</p>
      </FeatureCard>
      <FeatureCard as="article">
        <IconWrapper $variant="pink" $color="#ec4899">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </IconWrapper>
        <h2>Mosaic Albums &amp; Voice Notes</h2>
        <p>Share photos, videos, documents, GIFs, and voice messages with 36-bar acoustic waveforms, fullscreen zoom lightbox, and ZIP downloads.</p>
      </FeatureCard>
      <FeatureCard as="article">
        <IconWrapper $variant="purple" $color="#8b5cf6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
          </svg>
        </IconWrapper>
        <h2>Real-Time WebSocket Sync</h2>
        <p>Instant bidirectional WebSocket messaging with threaded replies, emoji reactions, typing indicators, pinned banners, and side media galleries.</p>
      </FeatureCard>
    </FeaturesContainer>
  );
};
