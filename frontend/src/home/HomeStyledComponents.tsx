import styled, { keyframes, createGlobalStyle } from 'styled-components';

export const GlobalHomeStyle = createGlobalStyle`
  html, body, #root {
    position: static !important;
    overflow: visible !important;
    height: auto !important;
    min-height: 100vh !important;
  }
  body {
    overflow-x: clip !important;
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

export const pulseGlow = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
  70% { box-shadow: 0 0 0 14px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
`;

export const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-12px); }
  100% { transform: translateY(0px); }
`;

export const modalScaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
`;

export const HeroContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: clip;
  background: var(--bg-primary);
  transition: background-color 0.3s ease;
`;

export const TopNav = styled.nav`
  padding: 1.75rem 3.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  position: relative;
  z-index: 20;
  box-sizing: border-box;

  @media (max-width: 768px) {
    padding: 1.25rem 1.25rem;
  }
`;

export const Logo = styled.a`
  font-size: 1.45rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  line-height: 1;
  white-space: nowrap;

  &::before {
    content: '';
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #3b82f6;
    animation: ${pulseGlow} 2.5s infinite;
    flex-shrink: 0;
  }
`;

export const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-shrink: 0;
`;

export const ThemeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.4);
    color: var(--text-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.15);

    svg {
      transform: rotate(20deg);
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

export const NavIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.25s ease, color 0.2s ease;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: rgba(59, 130, 246, 0.4);
    color: var(--text-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.15);

    svg {
      transform: scale(1.08);
      color: var(--accent-blue);
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

export const ContentWrapper = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem 5rem;
  z-index: 10;
  text-align: center;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 640px) {
    padding: 1.5rem 1.25rem 3.5rem;
  }
`;

export const Title = styled.h1`
  font-size: clamp(2.75rem, 6.5vw, 4.75rem);
  font-weight: 800;
  line-height: 1.15;
  margin: 0 0 1.25rem;
  letter-spacing: -0.03em;
  color: var(--text-heading);
  max-width: 960px;

  span {
    background: var(--hero-gradient, linear-gradient(90deg, #38bdf8 0%, #a78bfa 45%, #f472b6 90%));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
  }

  @media (max-width: 640px) {
    font-size: 2.75rem;
    margin-bottom: 1rem;
  }
`;

export const Description = styled.p`
  font-size: clamp(1.05rem, 2vw, 1.25rem);
  color: var(--text-secondary);
  max-width: 680px;
  margin: 0 auto 2.5rem;
  line-height: 1.65;
  font-weight: 400;

  @media (max-width: 640px) {
    font-size: 0.95rem;
    line-height: 1.55;
    margin-bottom: 2rem;
  }
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;

  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    width: 100%;
    max-width: 380px;
    margin: 0 auto;

    /* Hero CTA occupies the prominent top row full width */
    > :first-child {
      grid-column: 1 / -1;
      width: 100%;
      justify-content: center;
      padding: 0.95rem 1.5rem;
      font-size: 1rem;
      box-sizing: border-box;
    }

    /* Secondary actions sit symmetrically side-by-side */
    > :not(:first-child) {
      width: 100%;
      justify-content: center;
      padding: 0.8rem 0.5rem;
      font-size: 0.9rem;
      gap: 0.45rem;
      box-sizing: border-box;

      svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
    }
  }

  @media (max-width: 360px) {
    max-width: 320px;
    gap: 0.55rem;

    > :first-child {
      padding: 0.85rem 1rem;
      font-size: 0.95rem;
    }

    > :not(:first-child) {
      padding: 0.75rem 0.25rem;
      font-size: 0.825rem;
      gap: 0.35rem;

      svg {
        width: 16px;
        height: 16px;
      }
    }
  }
`;

export const PrimaryButton = styled.button`
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0.85rem 1.85rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 4px 14px -2px rgba(37, 99, 235, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  white-space: nowrap;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 8px 20px -3px rgba(37, 99, 235, 0.45);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 
      inset 0 1px 2px rgba(0, 0, 0, 0.2),
      0 1px 2px rgba(0, 0, 0, 0.05);
  }
`;

export const SecondaryButton = styled.button`
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  padding: 0.85rem 1.85rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 14px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  white-space: nowrap;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);

  svg {
    width: 20px;
    height: 20px;
    color: var(--text-secondary);
    transition: color 0.2s ease;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-secondary);
    color: var(--text-heading);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);

    svg {
      color: var(--text-primary);
    }
  }

  &:active {
    transform: translateY(0);
  }
`;

export const Orb = styled.div<{ $color: string; $size: string; $top: string; $left: string; $delay?: string }>`
  position: absolute;
  width: ${p => p.$size};
  height: ${p => p.$size};
  background: radial-gradient(circle at center, ${p => p.$color} 0%, transparent 68%);
  top: ${p => p.$top};
  left: ${p => p.$left};
  opacity: var(--orb-opacity, 0.14);
  filter: blur(80px);
  pointer-events: none;
  z-index: 1;
`;

export const FeaturesContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  width: 100%;
  max-width: 1100px;
  margin-top: 4.5rem;
  position: relative;
  z-index: 10;
  text-align: left;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin-top: 3.5rem;
  }
`;

export const FeatureCard = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  padding: 2rem;
  border-radius: 20px;
  text-align: left;
  box-shadow: var(--shadow-card);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
    border-color: rgba(59, 130, 246, 0.35);
  }

  h2 {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0 0 0.65rem;
    color: var(--text-heading);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: 0.925rem;
  }
`;

export const IconWrapper = styled.div<{ $color?: string; $variant?: 'blue' | 'pink' | 'purple' }>`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;

  background: ${p => {
    if (p.$variant === 'pink') return 'var(--badge-pink-bg)';
    if (p.$variant === 'purple') return 'var(--badge-purple-bg)';
    return 'var(--badge-blue-bg)';
  }};

  color: ${p => {
    if (p.$variant === 'pink') return 'var(--badge-pink-color)';
    if (p.$variant === 'purple') return 'var(--badge-purple-color)';
    return 'var(--badge-blue-color)';
  }};

  svg {
    width: 22px;
    height: 22px;
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: var(--modal-overlay-bg, rgba(15, 23, 42, 0.5));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 22px;
  padding: 2.25rem;
  width: 100%;
  max-width: 450px;
  box-shadow: var(--shadow-modal);
  animation: ${modalScaleIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

export const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

export const Input = styled.input`
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-secondary);
  color: var(--text-primary);
  padding: 0.8rem 1rem;
  border-radius: 12px;
  font-size: 0.95rem;
  font-family: inherit;
  transition: all 0.2s ease;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-tertiary);
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
`;

export const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const EyeButton = styled.button`
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: color 0.2s ease;

  &:hover {
    color: var(--text-primary);
  }
`;

export const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.75rem;
`;

export const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--bg-hover)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: ${p => p.$primary ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-primary)'};
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${p => p.$primary ? 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(37, 99, 235, 0.35)' : '0 1px 2px rgba(0, 0, 0, 0.04)'};

  &:hover {
    background: ${p => p.$primary ? 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)' : 'var(--bg-secondary)'};
    border-color: ${p => p.$primary ? 'rgba(255, 255, 255, 0.3)' : 'var(--border-secondary)'};
    color: ${p => p.$primary ? '#ffffff' : 'var(--text-heading)'};
    transform: translateY(-1px);
    box-shadow: ${p => p.$primary ? 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.12), 0 6px 16px rgba(37, 99, 235, 0.45)' : '0 4px 12px rgba(0, 0, 0, 0.08)'};
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

export const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: -0.25rem;
  margin-bottom: 1rem;
`;
