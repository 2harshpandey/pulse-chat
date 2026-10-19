import styled, { keyframes, css } from 'styled-components';

// ═══════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  25%      { transform: translateY(-12px) rotate(1deg); }
  50%      { transform: translateY(-6px) rotate(-1deg); }
  75%      { transform: translateY(-14px) rotate(0.5deg); }
`;

export const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50%      { box-shadow: 0 0 30px 10px rgba(59, 130, 246, 0.15); }
`;

export const pulseRipple = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
`;

export const shimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

export const glitch = keyframes`
  0%, 100% { clip-path: inset(0 0 0 0); transform: translate(0); }
  20%      { clip-path: inset(20% 0 60% 0); transform: translate(-2px, 2px); }
  40%      { clip-path: inset(40% 0 20% 0); transform: translate(2px, -2px); }
  60%      { clip-path: inset(60% 0 10% 0); transform: translate(-1px, 1px); }
  80%      { clip-path: inset(10% 0 80% 0); transform: translate(1px, -1px); }
`;

export const orbit = keyframes`
  from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
`;

export const orbitReverse = keyframes`
  from { transform: rotate(0deg) translateX(80px) rotate(0deg); }
  to   { transform: rotate(-360deg) translateX(80px) rotate(360deg); }
`;

export const breathe = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.15); opacity: 0.3; }
`;

export const scanLine = keyframes`
  0%   { top: -10%; }
  100% { top: 110%; }
`;

export const particleDrift = keyframes`
  0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(-100vh) translateX(50px) scale(0); opacity: 0; }
`;

export const waveMove = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

// ═══════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════

export const PageWrapper = styled.div`
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

export const BackgroundCanvas = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
`;

export const Orb = styled.div<{ $size: number; $x: string; $y: string; $color: string; $delay: number }>`
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

export const Particle = styled.div<{ $left: string; $delay: number; $duration: number; $size: number }>`
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

export const ScanLineDiv = styled.div`
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

export const ContentWrapper = styled.div`
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

export const ErrorCodeContainer = styled.div`
  position: relative;
  margin-bottom: 1.5rem;
  animation: ${fadeInUp} 0.8s ease-out forwards;
`;

export const ErrorCode = styled.h1<{ $hasGlitch?: boolean }>`
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

export const OrbitRing = styled.div`
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

export const OrbitDot = styled.div<{ $reverse?: boolean; $color: string; $duration: number }>`
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

export const Title = styled.h2`
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 700;
  color: var(--text-heading);
  margin-bottom: 0.75rem;
  animation: ${fadeInUp} 0.8s ease-out 0.15s both;
`;

export const Description = styled.p`
  font-size: clamp(0.95rem, 2.5vw, 1.1rem);
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 440px;
  margin-bottom: 2rem;
  animation: ${fadeInUp} 0.8s ease-out 0.3s both;
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  animation: ${fadeInUp} 0.8s ease-out 0.45s both;
`;

export const PrimaryButton = styled.button`
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

export const SecondaryButton = styled.button`
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

export const IconContainer = styled.div`
  animation: ${float} 5s ease-in-out infinite;
  margin-bottom: 1rem;
  animation-delay: 0.6s;
  opacity: 0;
  animation: ${fadeInUp} 0.8s ease-out 0s both, ${float} 5s ease-in-out 0.8s infinite;
`;

export const TypewriterText = styled.div`
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

export const CountdownText = styled.span`
  font-variant-numeric: tabular-nums;
  color: var(--accent-blue);
  font-weight: 700;
`;

export const ThemeToggle = styled.button`
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

export const PulseLogoMini = styled.div`
  position: fixed;
  top: 2rem;
  left: 4rem;
  z-index: 100;
  @media (max-width: 768px) {
    top: 1.5rem;
    left: 2rem;
  }
  
  font-size: 1.75rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  user-select: none;
  
  &::before {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #3b82f6;
    animation: ${pulseRipple} 2s infinite;
  }
`;
