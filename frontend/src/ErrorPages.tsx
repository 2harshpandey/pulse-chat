import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './ThemeContext';

// ═══════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  25%      { transform: translateY(-12px) rotate(1deg); }
  50%      { transform: translateY(-6px) rotate(-1deg); }
  75%      { transform: translateY(-14px) rotate(0.5deg); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50%      { box-shadow: 0 0 30px 10px rgba(59, 130, 246, 0.15); }
`;

const shimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const glitch = keyframes`
  0%, 100% { clip-path: inset(0 0 0 0); transform: translate(0); }
  20%      { clip-path: inset(20% 0 60% 0); transform: translate(-2px, 2px); }
  40%      { clip-path: inset(40% 0 20% 0); transform: translate(2px, -2px); }
  60%      { clip-path: inset(60% 0 10% 0); transform: translate(-1px, 1px); }
  80%      { clip-path: inset(10% 0 80% 0); transform: translate(1px, -1px); }
`;

const orbit = keyframes`
  from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
`;

const orbitReverse = keyframes`
  from { transform: rotate(0deg) translateX(80px) rotate(0deg); }
  to   { transform: rotate(-360deg) translateX(80px) rotate(360deg); }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.15); opacity: 0.3; }
`;

const scanLine = keyframes`
  0%   { top: -10%; }
  100% { top: 110%; }
`;

const particleDrift = keyframes`
  0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(-100vh) translateX(50px) scale(0); opacity: 0; }
`;

const waveMove = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

// ═══════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════

const PageWrapper = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg-primary);
  transition: background 0.3s ease;
  z-index: 0;
`;

const BackgroundCanvas = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
`;

const Orb = styled.div<{ $size: number; $x: string; $y: string; $color: string; $delay: number }>`
  position: absolute;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  background: ${p => p.$color};
  top: ${p => p.$y};
  left: ${p => p.$x};
  filter: blur(80px);
  opacity: 0.5;
  animation: ${breathe} ${p => 6 + p.$delay}s ease-in-out infinite;
  animation-delay: ${p => p.$delay}s;
  will-change: transform, opacity;

  [data-theme='dark'] & {
    opacity: 0.25;
  }
`;

const Particle = styled.div<{ $left: string; $delay: number; $duration: number; $size: number }>`
  position: absolute;
  bottom: -20px;
  left: ${p => p.$left};
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  background: var(--accent-blue);
  opacity: 0;
  animation: ${particleDrift} ${p => p.$duration}s ease-in-out infinite;
  animation-delay: ${p => p.$delay}s;

  [data-theme='dark'] & {
    background: var(--accent-indigo);
  }
`;

const ScanLineDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-blue), transparent);
  opacity: 0.15;
  animation: ${scanLine} 4s linear infinite;

  [data-theme='dark'] & {
    opacity: 0.08;
  }
`;

const ContentWrapper = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem;
  max-width: 600px;
  width: 100%;
`;

const ErrorCodeContainer = styled.div`
  position: relative;
  margin-bottom: 1.5rem;
  animation: ${fadeInUp} 0.8s ease-out forwards;
`;

const ErrorCode = styled.h1<{ $hasGlitch?: boolean }>`
  font-size: clamp(6rem, 15vw, 10rem);
  font-weight: 900;
  letter-spacing: -4px;
  line-height: 1;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo), #ec4899);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: ${shimmer} 3s ease-in-out infinite;
  position: relative;
  user-select: none;

  ${p => p.$hasGlitch && css`
    &::after {
      content: attr(data-code);
      position: absolute;
      top: 0;
      left: 0;
      background: linear-gradient(135deg, #ef4444, #f97316, #eab308);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: ${glitch} 3s ease-in-out infinite;
      opacity: 0.4;
    }
  `}
`;

const OrbitRing = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 240px;
  height: 240px;
  margin: -120px 0 0 -120px;
  border: 1px dashed var(--border-secondary);
  border-radius: 50%;
  opacity: 0.3;

  [data-theme='dark'] & {
    opacity: 0.15;
  }
`;

const OrbitDot = styled.div<{ $reverse?: boolean; $color: string; $duration: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
  background: ${p => p.$color};
  animation: ${p => p.$reverse ? orbitReverse : orbit} ${p => p.$duration}s linear infinite;
  box-shadow: 0 0 12px ${p => p.$color};
`;

const Title = styled.h2`
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 700;
  color: var(--text-heading);
  margin-bottom: 0.75rem;
  animation: ${fadeInUp} 0.8s ease-out 0.15s both;
`;

const Description = styled.p`
  font-size: clamp(0.95rem, 2.5vw, 1.1rem);
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 440px;
  margin-bottom: 2rem;
  animation: ${fadeInUp} 0.8s ease-out 0.3s both;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  animation: ${fadeInUp} 0.8s ease-out 0.45s both;
`;

const PrimaryButton = styled.button`
  position: relative;
  padding: 0.85rem 2rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: ${pulseGlow} 3s ease-in-out infinite;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.35);
  }

  &:active {
    transform: translateY(0);
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    animation: ${waveMove} 2.5s ease-in-out infinite;
  }
`;

const SecondaryButton = styled.button`
  padding: 0.85rem 2rem;
  border: 1.5px solid var(--border-secondary);
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);

  &:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    background: rgba(59, 130, 246, 0.05);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const IconContainer = styled.div`
  animation: ${float} 5s ease-in-out infinite;
  margin-bottom: 1rem;
  animation-delay: 0.6s;
  opacity: 0;
  animation: ${fadeInUp} 0.8s ease-out 0s both, ${float} 5s ease-in-out 0.8s infinite;
`;

const TypewriterText = styled.div`
  display: inline-block;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 2rem;
  animation: ${fadeInUp} 0.8s ease-out 0.6s both;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);

  code {
    color: var(--accent-blue);
  }

  [data-theme='dark'] & {
    background: var(--bg-secondary);
  }
`;

const CountdownText = styled.span`
  font-variant-numeric: tabular-nums;
  color: var(--accent-blue);
  font-weight: 700;
`;

const ThemeToggle = styled.button`
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 100;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);

  &:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-md);
  }
`;

const PulseLogoMini = styled.div`
  position: fixed;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 100;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text-heading);
  cursor: pointer;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  user-select: none;

  &:hover {
    color: var(--accent-blue);
  }

  span {
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

// ═══════════════════════════════════════════════
// BACKGROUND PARTICLES COMPONENT
// ═══════════════════════════════════════════════

const BackgroundEffects: React.FC<{ variant: 'blue' | 'red' | 'amber' }> = ({ variant }) => {
  const colors = useMemo(() => {
    switch (variant) {
      case 'red': return { orb1: '#ef4444', orb2: '#f97316', orb3: '#ec4899' };
      case 'amber': return { orb1: '#f59e0b', orb2: '#f97316', orb3: '#eab308' };
      default: return { orb1: '#3b82f6', orb2: '#8b5cf6', orb3: '#06b6d4' };
    }
  }, [variant]);

  return (
    <BackgroundCanvas>
      <Orb $size={400} $x="10%" $y="20%" $color={colors.orb1} $delay={0} />
      <Orb $size={300} $x="70%" $y="60%" $color={colors.orb2} $delay={2} />
      <Orb $size={250} $x="50%" $y="10%" $color={colors.orb3} $delay={4} />
      <ScanLineDiv />
      {Array.from({ length: 12 }).map((_, i) => (
        <Particle
          key={i}
          $left={`${5 + (i * 8)}%`}
          $delay={i * 0.8}
          $duration={8 + (i % 4) * 2}
          $size={2 + (i % 3)}
        />
      ))}
    </BackgroundCanvas>
  );
};

// ═══════════════════════════════════════════════
// SVG ILLUSTRATIONS
// ═══════════════════════════════════════════════

const Ghost404 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 10C25.088 10 13 22.088 13 37V62C13 64 15 66 17 64L21 60L25 64C27 66 29 66 31 64L35 60L39 64C41 66 43 66 45 64L49 60L53 64C55 66 57 66 59 64L63 60L67 64C69 66 71 64 71 62V37C71 22.088 58.912 10 44 10H40Z" 
      fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="2"/>
    <circle cx="30" cy="35" r="4" fill="var(--accent-blue)">
      <animate attributeName="cy" values="35;33;35" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="50" cy="35" r="4" fill="var(--accent-blue)">
      <animate attributeName="cy" values="35;33;35" dur="2s" begin="0.3s" repeatCount="indefinite"/>
    </circle>
    <path d="M33 46C33 46 36 50 40 50C44 50 47 46 47 46" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" fill="none">
      <animate attributeName="d" values="M33 46C33 46 36 50 40 50C44 50 47 46 47 46;M33 47C33 47 36 44 40 44C44 44 47 47 47 47;M33 46C33 46 36 50 40 50C44 50 47 46 47 46" dur="3s" repeatCount="indefinite"/>
    </path>
  </svg>
);

const Shield403 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 8L12 22V38C12 56 24 72 40 76C56 72 68 56 68 38V22L40 8Z" 
      fill="var(--accent-red)" opacity="0.12" stroke="var(--accent-red)" strokeWidth="2"/>
    <path d="M30 40L36 46L50 32" stroke="none" fill="none"/>
    <line x1="32" y1="32" x2="48" y2="48" stroke="var(--accent-red)" strokeWidth="3" strokeLinecap="round">
      <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
    </line>
    <line x1="48" y1="32" x2="32" y2="48" stroke="var(--accent-red)" strokeWidth="3" strokeLinecap="round">
      <animate attributeName="opacity" values="1;0.5;1" dur="2s" begin="0.5s" repeatCount="indefinite"/>
    </line>
  </svg>
);

const ServerDown500 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="12" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="20" r="3" fill="var(--accent-green)">
      <animate attributeName="fill" values="var(--accent-green);var(--accent-red);var(--accent-green)" dur="2s" repeatCount="indefinite"/>
    </circle>
    <rect x="15" y="32" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="40" r="3" fill="var(--accent-red)">
      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>
    </circle>
    <rect x="15" y="52" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="60" r="3" fill="var(--accent-red)">
      <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <line x1="55" y1="38" x2="55" y2="42" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="55" y1="58" x2="55" y2="62" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="55" y1="18" x2="55" y2="22" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const Clock408 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="28" fill="var(--accent-blue)" opacity="0.1" stroke="var(--accent-blue)" strokeWidth="2"/>
    <line x1="40" y1="40" x2="40" y2="24" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="8s" repeatCount="indefinite"/>
    </line>
    <line x1="40" y1="40" x2="52" y2="40" stroke="var(--accent-indigo)" strokeWidth="2" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="60s" repeatCount="indefinite"/>
    </line>
    <circle cx="40" cy="40" r="3" fill="var(--accent-blue)"/>
  </svg>
);

const Lock429 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="22" y="36" width="36" height="28" rx="5" fill="var(--accent-yellow)" opacity="0.15" stroke="var(--accent-yellow)" strokeWidth="2"/>
    <path d="M30 36V28C30 21.373 35.373 16 42 16H38C44.627 16 50 21.373 50 28V36" stroke="var(--accent-yellow)" strokeWidth="2.5" fill="none"/>
    <circle cx="40" cy="48" r="4" fill="var(--accent-yellow)">
      <animate attributeName="r" values="4;5;4" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <line x1="40" y1="52" x2="40" y2="57" stroke="var(--accent-yellow)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const Maintenance503 = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 14L44 26H56L46 34L50 46L40 38L30 46L34 34L24 26H36L40 14Z" 
      fill="var(--accent-yellow)" opacity="0.15" stroke="var(--accent-yellow)" strokeWidth="1.5"/>
    <circle cx="40" cy="58" r="12" fill="none" stroke="var(--accent-yellow)" strokeWidth="2" strokeDasharray="4 4">
      <animateTransform attributeName="transform" type="rotate" from="0 40 58" to="360 40 58" dur="6s" repeatCount="indefinite"/>
    </circle>
    <circle cx="40" cy="58" r="5" fill="var(--accent-yellow)" opacity="0.3"/>
  </svg>
);

// ═══════════════════════════════════════════════
// ERROR PAGE COMPONENT
// ═══════════════════════════════════════════════

interface ErrorPageProps {
  code: number;
  title?: string;
  description?: string;
  showHomeButton?: boolean;
  showRefreshButton?: boolean;
  autoRedirectSeconds?: number;
}

const ERROR_CONFIGS: Record<number, { title: string; description: string; variant: 'blue' | 'red' | 'amber'; icon: React.FC; hasGlitch?: boolean }> = {
  404: {
    title: "Page Not Found",
    description: "Looks like this page drifted away into the void. The link may be broken, or the page may have been removed.",
    variant: 'blue',
    icon: Ghost404,
    hasGlitch: true,
  },
  403: {
    title: "Access Denied",
    description: "You don't have permission to access this page. If you believe this is a mistake, please check your credentials.",
    variant: 'red',
    icon: Shield403,
  },
  500: {
    title: "Internal Server Error",
    description: "Something went wrong on our end. Our servers are having a moment — we're working to fix it.",
    variant: 'red',
    icon: ServerDown500,
  },
  408: {
    title: "Request Timeout",
    description: "The server took too long to respond. Your connection may be slow, or the server is under heavy load.",
    variant: 'blue',
    icon: Clock408,
  },
  429: {
    title: "Too Many Requests",
    description: "You've sent too many requests in a short period. Please wait a moment before trying again.",
    variant: 'amber',
    icon: Lock429,
  },
  503: {
    title: "Service Unavailable",
    description: "Pulse Chat is temporarily undergoing maintenance. We'll be back shortly — hang tight!",
    variant: 'amber',
    icon: Maintenance503,
  },
};

const ErrorPage: React.FC<ErrorPageProps> = ({
  code,
  title: customTitle,
  description: customDescription,
  showHomeButton = true,
  showRefreshButton = false,
  autoRedirectSeconds,
}) => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [countdown, setCountdown] = useState(autoRedirectSeconds || 0);

  const config = ERROR_CONFIGS[code] || {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
    variant: 'blue' as const,
    icon: Ghost404,
  };

  const title = customTitle || config.title;
  const description = customDescription || config.description;
  const IconComponent = config.icon;

  // Auto-redirect countdown
  useEffect(() => {
    if (!autoRedirectSeconds || autoRedirectSeconds <= 0) return;
    setCountdown(autoRedirectSeconds);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRedirectSeconds, navigate]);

  const handleGoHome = useCallback(() => navigate('/'), [navigate]);
  const handleRefresh = useCallback(() => window.location.reload(), []);
  const handleGoBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <PageWrapper>
      <BackgroundEffects variant={config.variant} />

      <PulseLogoMini onClick={handleGoHome}>
        <span>Pulse</span> Chat
      </PulseLogoMini>

      <ThemeToggle onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
        {isDark ? '☀️' : '🌙'}
      </ThemeToggle>

      <ContentWrapper>
        <IconContainer>
          <IconComponent />
        </IconContainer>

        <ErrorCodeContainer>
          <ErrorCode $hasGlitch={config.hasGlitch} data-code={String(code)}>
            {code}
          </ErrorCode>
          <OrbitRing />
          <OrbitDot $color="var(--accent-blue)" $duration={8} />
          <OrbitDot $reverse $color="var(--accent-indigo)" $duration={12} />
        </ErrorCodeContainer>

        <Title>{title}</Title>
        <Description>{description}</Description>

        <ButtonGroup>
          {showHomeButton && (
            <PrimaryButton onClick={handleGoHome}>
              Go to Chat
            </PrimaryButton>
          )}
          {showRefreshButton && (
            <SecondaryButton onClick={handleRefresh}>
              Try Again
            </SecondaryButton>
          )}
          <SecondaryButton onClick={handleGoBack}>
            Go Back
          </SecondaryButton>
        </ButtonGroup>

        {autoRedirectSeconds && countdown > 0 && (
          <TypewriterText>
            Redirecting in <CountdownText>{countdown}</CountdownText>s…
          </TypewriterText>
        )}

        <TypewriterText>
          <code>HTTP {code}</code> · {title}
        </TypewriterText>
      </ContentWrapper>
    </PageWrapper>
  );
};

// ═══════════════════════════════════════════════
// EXPORTED PAGE COMPONENTS
// ═══════════════════════════════════════════════

/** 404 — Page Not Found (catch-all for unknown routes) */
export const NotFoundPage: React.FC = () => (
  <ErrorPage code={404} showHomeButton showRefreshButton={false} autoRedirectSeconds={15} />
);

/** 403 — Forbidden (wrong password, unauthorized access) */
export const ForbiddenPage: React.FC = () => (
  <ErrorPage code={403} showHomeButton showRefreshButton={false} />
);

/** 500 — Internal Server Error */
export const ServerErrorPage: React.FC = () => (
  <ErrorPage code={500} showHomeButton showRefreshButton />
);

/** 408 — Request Timeout */
export const TimeoutPage: React.FC = () => (
  <ErrorPage code={408} showHomeButton showRefreshButton />
);

/** 429 — Too Many Requests (rate-limited) */
export const RateLimitPage: React.FC = () => (
  <ErrorPage code={429} showHomeButton showRefreshButton={false} autoRedirectSeconds={30} />
);

/** 503 — Service Unavailable / Maintenance */
export const MaintenancePage: React.FC = () => (
  <ErrorPage code={503} showHomeButton={false} showRefreshButton autoRedirectSeconds={60} />
);

/** Generic — wraps ErrorPage for any custom code */
export const GenericErrorPage: React.FC<ErrorPageProps> = (props) => (
  <ErrorPage {...props} />
);

export default ErrorPage;
