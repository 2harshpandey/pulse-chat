import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Routes, Route, useLocation } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';
import { GlobalStyle } from './Chat';
import { NotFoundPage, ForbiddenPage, ServerErrorPage, TimeoutPage, RateLimitPage, MaintenancePage } from './ErrorPages';

// ─── Premium crash-fallback components ────────────────────────────────────
const fallbackShimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
`;
const FallbackPage = styled.div`
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 1.75rem; padding: 2rem;
  background: var(--bg-primary); overflow: hidden;
  text-align: center;
`;
const FallbackOrb = styled.div<{ $x: string; $y: string; $color: string; $size: number }>`
  position: absolute;
  width: ${p => p.$size}px; height: ${p => p.$size}px;
  border-radius: 50%;
  background: ${p => p.$color};
  top: ${p => p.$y}; left: ${p => p.$x};
  filter: blur(80px); opacity: 0.4;
  pointer-events: none;
  [data-theme='dark'] & { opacity: 0.2; }
`;
const FallbackCode = styled.h1`
  font-size: clamp(7rem, 18vw, 12rem);
  font-weight: 900; letter-spacing: -4px;
  line-height: 1; margin: 0;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo), #ec4899);
  background-size: 200% 200%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: ${fallbackShimmer} 3s ease-in-out infinite;
  position: relative; z-index: 1;
`;
const FallbackTitle = styled.p`
  font-size: clamp(1.2rem, 3vw, 1.6rem); font-weight: 700;
  color: var(--text-heading); margin: 0;
  position: relative; z-index: 1;
`;
const FallbackDesc = styled.p`
  font-size: 1rem; color: var(--text-secondary);
  margin: 0; max-width: 400px; line-height: 1.6;
  position: relative; z-index: 1;
`;
const FallbackButton = styled.a`
  position: relative; z-index: 1;
  display: inline-block;
  padding: 0.85rem 2.25rem;
  border-radius: 12px; font-size: 1rem;
  font-weight: 600; color: #fff;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
  cursor: pointer; text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  &:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(59,130,246,0.35); }
  &:active { transform: translateY(0); }
`;

// ─── Error Boundary ────────────────────────────────────────────────────────
// Catches any runtime crash inside a route so the page never goes fully blank.
// Keyed by pathname in AppRoutes so it resets automatically on navigation.
class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary]', err, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <FallbackPage>
          <FallbackOrb $size={420} $x="5%"  $y="10%" $color="#3b82f6" />
          <FallbackOrb $size={320} $x="65%" $y="55%" $color="#8b5cf6" />
          <FallbackOrb $size={260} $x="45%" $y="-5%" $color="#06b6d4" />
          <FallbackCode>Oops!</FallbackCode>
          <FallbackTitle>Something went wrong</FallbackTitle>
          <FallbackDesc>
            The application encountered an unexpected error. Refreshing the page
            usually fixes this.
          </FallbackDesc>
          <FallbackButton href="/">← Go to Chat</FallbackButton>
        </FallbackPage>
      );
    }
    return this.props.children;
  }
}

// Wrapper so the boundary resets every time the pathname changes.
function AppRoutes() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/join/:token" element={<Chat />} />
        <Route path="/admin" element={<Admin />} />
        {/* Explicit error pages */}
        <Route path="/error/403" element={<ForbiddenPage />} />
        <Route path="/error/404" element={<NotFoundPage />} />
        <Route path="/error/500" element={<ServerErrorPage />} />
        <Route path="/error/408" element={<TimeoutPage />} />
        <Route path="/error/429" element={<RateLimitPage />} />
        <Route path="/error/503" element={<MaintenancePage />} />
        {/* Catch-all — must be last */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RouteErrorBoundary>
  );
}

function App() {
  return (
    <>
      <GlobalStyle />
      <AppRoutes />
    </>
  );
}

export default App;
