import styled, { keyframes } from 'styled-components';
import { fadeIn, drawLine, shimmer } from './admin.animations';

export const LoginFormContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--login-bg);
  padding: 1.5rem;
  position: relative;
  overflow: hidden;
  transition: background-color 0.5s ease;
`;

export const LoginBox = styled.div`
  padding: 3rem;
  background: var(--login-card-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--login-card-border);
  border-radius: 24px;
  box-shadow: 0 25px 60px -12px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 440px;
  animation: ${fadeIn} 0.6s cubic-bezier(0.16,1,0.3,1);
  transition: background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
  position: relative;
  z-index: 1;
  [data-theme='dark'] & { box-shadow: 0 25px 60px -12px rgba(0,0,0,0.5); }
  @media (max-width: 480px) { padding: 2rem 1.5rem; border-radius: 20px; }
`;

export const AdminOrb = styled.div<{ $color: string; $size: number; $top: string; $left: string; $anim: ReturnType<typeof keyframes> }>`
  position: absolute;
  width: ${(p: any) => p.$size}px;
  height: ${(p: any) => p.$size}px;
  border-radius: 50%;
  background: ${(p: any) => p.$color};
  filter: blur(80px);
  opacity: 0.6;
  animation: ${(p: any) => p.$anim} 20s ease-in-out infinite;
  top: ${(p: any) => p.$top};
  left: ${(p: any) => p.$left};
  will-change: transform;
  pointer-events: none;
  [data-theme='dark'] & { opacity: 0.25; }
`;

export const AdminLoginBrand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 1.75rem;
  width: 100%;
`;

export const AdminBrandLogo = styled.img`
  width: 80px;
  height: 80px;
  object-fit: contain;
  margin-bottom: 0.75rem;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
`;

export const AdminBrandWordmark = styled.h1`
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 0.35rem 0;
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

export const AdminHeartbeatSvg = styled.svg`
  display: block;
  margin: 0.5rem auto;
  overflow: visible;
  path {
    fill: none;
    stroke: var(--accent-indigo);
    strokeWidth: 2.5;
    strokeLinecap: round;
    strokeLinejoin: round;
    stroke-dasharray: 180;
    animation: ${drawLine} 1.5s ease-out forwards;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.3));
  }
`;

export const AdminBrandSubtitle = styled.p`
  font-size: 0.9rem;
  color: var(--text-tertiary);
  margin-top: 0.75rem;
  transition: color 0.3s ease;
`;

export const AdminInputGroup = styled.div<{ $focused?: boolean }>`
  position: relative;
  width: 100%;
  max-width: 340px;
  margin-bottom: 1rem;
  border-radius: 12px;
  border: 1.5px solid ${(p: any) => p.$focused ? 'var(--accent-indigo)' : 'var(--border-secondary)'};
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  box-shadow: ${(p: any) => p.$focused ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none'};
  background: var(--bg-input);
  overflow: hidden;
  @media (max-width: 480px) { max-width: 100%; }
`;

export const AdminInputIcon = styled.div<{ $focused?: boolean }>`
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

export const AdminStyledInput = styled.input`
  width: 100%;
  padding: 0.9rem 3rem 0.9rem 2.75rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: var(--text-primary);
  outline: none;
  transition: color 0.3s ease;
  &::placeholder { color: var(--text-muted); transition: color 0.3s; }
`;

export const AdminEyeBtn = styled.button`
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

export const AdminSubmitBtn = styled.button<{ $loading?: boolean }>`
  width: 100%;
  max-width: 340px;
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
  &:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 12px 30px -5px rgba(79,70,229,0.5); }
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
  @media (max-width: 480px) { max-width: 100%; }
`;

export const AdminThemeToggle = styled.button`
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
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1); }
  &:hover svg { transform: rotate(30deg); }
`;

export const AdminFormHomeButton = styled.button`
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

export const AdminSecuredLine = styled.div`
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
