import React from 'react';
import {
  FeaturesContainer,
  FeatureCard,
  IconWrapper
} from '../HomeStyledComponents';

export const FeaturesSection: React.FC = () => {
  return (
    <FeaturesContainer>
      <FeatureCard>
        <IconWrapper $color="#3b82f6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </IconWrapper>
        <h2>Secure Rooms</h2>
        <p>Create private, password-protected chat rooms or open public lounges. You control who enters.</p>
      </FeatureCard>
      <FeatureCard>
        <IconWrapper $color="#ec4899">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </IconWrapper>
        <h2>Rich Media</h2>
        <p>Upload photos, videos, files, and GIFs effortlessly. Link previews are automatically generated.</p>
      </FeatureCard>
      <FeatureCard>
        <IconWrapper $color="#8b5cf6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
          </svg>
        </IconWrapper>
        <h2>Real-time Sync</h2>
        <p>Lightning-fast WebSocket delivery with instant read receipts, typing indicators, and emoji reactions.</p>
      </FeatureCard>
    </FeaturesContainer>
  );
};
