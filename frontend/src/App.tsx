import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Routes, Route, useLocation, useParams, useNavigate } from 'react-router-dom';
import Home from './Home';
import Rooms from './Rooms';
import Chat from './Chat';
import Admin from './Admin';
import AboutDeveloper from './AboutDeveloper';
import { GlobalStyle } from './chat/ChatStyledComponents';
import { NotFoundPage, ForbiddenPage, ServerErrorPage, TimeoutPage, RateLimitPage, MaintenancePage } from './ErrorPages';

const GlobalHomeButton = styled.button`
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9999;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  &:hover {
    transform: scale(1.08);
    background: rgba(51, 65, 85, 0.9);
    border-color: rgba(59, 130, 246, 0.4);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  }

  [data-theme='light'] & {
    background: var(--bg-secondary);
    border: 1px solid var(--border-secondary);
    color: var(--text-secondary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    &:hover {
      background: var(--bg-hover);
      border-color: var(--text-muted);
    }
  }

  svg {
    width: 22px;
    height: 22px;
  }

  body.hide-global-home-btn & {
    display: none;
  }

  @media (max-width: 768px) {
    top: 1rem;
    left: 1rem;
    width: 40px;
    height: 40px;
    
    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

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
  { crashed: boolean; error: Error | null; info: React.ErrorInfo | null }
> {
  state = { crashed: false, error: null as Error | null, info: null as React.ErrorInfo | null };

  static getDerivedStateFromError(error: Error): { crashed: boolean; error: Error } {
    return { crashed: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary]', error, info);
    this.setState({ info });
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
            {this.state.error && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'left', fontSize: '0.8rem', overflowX: 'auto', color: '#f87171' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>{this.state.error.toString()}</strong>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.info?.componentStack || this.state.error.stack}
                </pre>
              </div>
            )}
          </FallbackDesc>
          <FallbackButton href="/">← Go to Home</FallbackButton>
        </FallbackPage>
      );
    }
    return this.props.children;
  }
}

// Wrapper so the boundary resets every time the pathname changes.
function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <RouteErrorBoundary key={location.pathname}>
      {location.pathname !== '/' && (
        <GlobalHomeButton onClick={() => navigate('/')} aria-label="Go to Home" title="Go to Home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </GlobalHomeButton>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room" element={<Rooms />} />
        <Route path="/room/:roomId" element={<Chat />} />
        <Route path="/me" element={<Chat isMe={true} />} />
        <Route path="/join/:token" element={<Chat isTempLink={true} />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/:roomId" element={<Admin />} />
        <Route path="/about-developer" element={<AboutDeveloper />} />
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
  React.useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      document.body.classList.add('is-scrolling');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 1000);
    };

    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return (
    <>
      <GlobalStyle />
      <AppRoutes />
    </>
  );
}

export default App;
