import styled, { keyframes } from 'styled-components';
import { fadeInUp, shake, drawLine, pulseGlow, shimmer } from './auth.animations';

export const PageWrapper = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 0;
  padding: 1.5rem;
`;

export const AnimatedBg = styled.div`
  position: fixed;
  inset: 0;
  background: var(--login-bg);
  overflow: hidden;
  z-index: 0;
  transition: background 0.5s ease;
`;

export const Orb = styled.div<{ $color: string; $darkColor: string; $size: number; $top: string; $left: string; $anim: ReturnType<typeof keyframes> }>`
  position: absolute;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  background: ${p => p.$color};
  filter: blur(80px);
  opacity: 0.6;
  animation: ${p => p.$anim} 20s ease-in-out infinite;
  top: ${p => p.$top};
  left: ${p => p.$left};
  will-change: transform;

  [data-theme='dark'] & {
    background: ${p => p.$darkColor};
    opacity: 0.3;
  }
`;

export const FormContainer = styled.div`
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
`;

export const GlassCard = styled.div<{ $hasError?: boolean }>`
  background: var(--login-card-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--login-card-border);
  border-radius: 24px;
  padding: 2.5rem;
  box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.15);
  animation: ${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1),
             ${(p: any) => p.$hasError ? shake : 'none'} 0.4s ease;
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  position: relative;

  [data-theme='dark'] & {
    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5);
  }

  @media (max-width: 480px) {
    padding: 2rem 1.5rem;
    border-radius: 20px;
  }
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`;

export const TopBarButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;

  &:hover {
    transform: scale(1.15);
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: rgba(59, 130, 246, 0.5);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4);
  }
  &:active { transform: scale(0.9); }

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  &.spin-on-hover:hover svg { transform: rotate(30deg); }
`;

export const FormHomeButton = styled.button`
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
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;

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

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
    
    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

export const InfoButton = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  
  &:hover {
    transform: translateY(-2px);
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.5);
    box-shadow: 0 10px 25px -5px rgba(59,130,246,0.4);
  }
`;

export const Tooltip = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: 0;
  left: calc(100% + 20px);
  width: 280px;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-primary);
  padding: 1rem;
  border-radius: 12px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-primary);
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transform: ${props => props.$visible ? 'translateX(0)' : 'translateX(-10px)'};
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 100;
  box-shadow: 0 10px 25px var(--shadow-color);
  text-align: left;
  
  @media (max-width: 768px) {
    top: calc(100% + 10px);
    left: auto;
    right: 0;
    transform: ${props => props.$visible ? 'translateY(0)' : 'translateY(-10px)'};
  }
`;

export const BrandSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 2rem;
`;

export const BrandLogo = styled.img`
  width: 90px;
  height: 90px;
  object-fit: contain;
  margin-bottom: 0.75rem;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
`;

export const BrandWordmark = styled.h1`
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 0.2rem;
  color: var(--text-heading);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: color 0.2s ease;

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

export const BrandTagline = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 0.35rem;
  transition: color 0.3s ease;
`;

export const HeartbeatSvg = styled.svg`
  display: block;
  margin: 0.6rem auto 0;
  overflow: visible;

  path {
    fill: none;
    stroke: var(--accent-indigo);
    strokeWidth: 2.5;
    strokeLinecap: round;
    strokeLinejoin: round;
    stroke-dasharray: 180;
    animation: ${drawLine} 1.5s ease-out forwards;
    filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.25));
  }
`;

export const BrandSubtitle = styled.p`
  font-size: 0.9rem;
  color: var(--text-tertiary);
  margin-top: 0.75rem;
  transition: color 0.3s ease;
`;

export const TempBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 1rem;
  margin-bottom: 1rem;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12));
  border: 1px solid rgba(99,102,241,0.2);
  color: var(--accent-indigo);
  font-size: 0.8rem;
  font-weight: 600;
  animation: ${pulseGlow} 2.5s ease-in-out infinite;
`;

export const InviteText = styled.p`
  font-size: 0.88rem;
  color: var(--text-tertiary);
  margin-bottom: 1.5rem;
  line-height: 1.55;
  transition: color 0.3s ease;
`;

export const InputGroup = styled.div<{ $focused?: boolean }>`
  position: relative;
  margin-bottom: 1rem;
  border-radius: 12px;
  border: 1.5px solid ${(p: any) => p.$focused ? 'var(--accent-indigo)' : 'var(--border-secondary)'};
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
  box-shadow: ${(p: any) => p.$focused ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none'};
  transform: ${(p: any) => p.$focused ? 'scale(1.01)' : 'scale(1)'};
  background: var(--bg-input);
  overflow: hidden;
  display: flex;
  align-items: center;
`;

export const InputIcon = styled.div<{ $focused?: boolean }>`
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${(p: any) => p.$focused ? 'var(--accent-indigo)' : 'var(--text-muted)'};
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  z-index: 1;
  svg { width: 18px; height: 18px; }
`;

export const StyledInput = styled.input`
  width: 100%;
  padding: 0.9rem 1rem 0.9rem 2.75rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: var(--text-primary);
  outline: none;
  transition: color 0.3s ease;

  &::placeholder {
    color: var(--text-muted);
    transition: color 0.3s ease;
  }
`;

export const PasswordToggle = styled.button`
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  z-index: 1;

  &:hover { color: var(--text-secondary); }
  svg { width: 18px; height: 18px; }
`;

export const SubmitBtn = styled.button<{ $loading?: boolean }>`
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #4F46E5, #3B82F6);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  margin-top: 0.5rem;

  &:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 12px 30px -5px rgba(79, 70, 229, 0.5);
  }
  &:active:not(:disabled) { transform: translateY(0) scale(0.98); }
  &:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    background-size: 200% 100%;
    animation: ${(p: any) => p.$loading ? shimmer : 'none'} 1.5s infinite;
  }
`;

export const ErrorText = styled.p`
  color: var(--accent-red);
  margin-top: 1rem;
  font-size: 0.85rem;
  text-align: center;
  animation: ${fadeInUp} 0.3s ease-out;
`;

export const SecuredLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 1.5rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  transition: color 0.3s ease;
  svg { width: 12px; height: 12px; }
`;
