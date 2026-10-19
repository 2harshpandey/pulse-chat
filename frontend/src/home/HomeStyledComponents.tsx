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
  }
  body {
    background-color: var(--bg-primary);
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
  }
`;

export const gradientFlow = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

export const float = keyframes`
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(5deg); }
  100% { transform: translateY(0px) rotate(0deg); }
`;

export const pulseGlow = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
`;

export const HeroContainer = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: clip;
  background: var(--bg-primary);
`;

export const TopNav = styled.nav`
  padding: 2rem 4rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  position: relative;
  z-index: 10;
  
  @media (max-width: 768px) {
    padding: 1.5rem 1.5rem;
  }
`;

export const Logo = styled.a`
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
  line-height: 1.1;
  white-space: normal;
  
  @media (max-width: 480px) {
    font-size: 1.5rem;
    flex-shrink: 1;
    min-width: 0;
  }
  
  &::before {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #3b82f6;
    animation: ${pulseGlow} 2s infinite;
  }
`;

export const ContentWrapper = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 10;
  text-align: center;
`;

export const Title = styled.h1`
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: 900;
  line-height: 1.1;
  margin: 0 0 1.5rem;
  letter-spacing: -2px;
  max-width: 900px;
  
  span {
    background: linear-gradient(270deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
    background-size: 300% 300%;
    animation: ${gradientFlow} 8s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

export const Description = styled.p`
  font-size: clamp(1.1rem, 2.5vw, 1.5rem);
  color: var(--text-secondary);
  max-width: 650px;
  margin: 0 0 3rem;
  line-height: 1.6;
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
`;

export const PrimaryButton = styled.button`
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: #ffffff;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.125rem;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.5);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 20px 35px -5px rgba(139, 92, 246, 0.6);
  }

  &:active {
    transform: translateY(1px);
  }
`;

export const SecondaryButton = styled.button`
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-secondary);
  padding: 1rem 2rem;
  font-size: 1.125rem;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-focus);
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  }

  &:active {
    transform: translateY(1px);
  }
`;

export const Orb = styled.div<{ $color: string; $size: string; $top: string; $left: string; $delay: string }>`
  position: absolute;
  width: ${p => p.$size};
  height: ${p => p.$size};
  background: radial-gradient(circle at center, ${p => p.$color} 0%, transparent 65%);
  top: ${p => p.$top};
  left: ${p => p.$left};
  opacity: 0.15;
  animation: ${float} 10s ease-in-out infinite;
  animation-delay: ${p => p.$delay};
  pointer-events: none;
  z-index: 1;
`;

export const FeaturesContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2rem;
  width: 100%;
  max-width: 1200px;
  margin-top: 5rem;
  position: relative;
  z-index: 10;
`;

export const FeatureCard = styled.div`
  flex: 1 1 300px;
  max-width: 400px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  padding: 2rem;
  border-radius: 24px;
  text-align: left;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.3s ease, background 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    background: var(--bg-secondary);
    border-color: rgba(59, 130, 246, 0.3);
  }

  h2 {
    font-size: 1.25rem;
    margin: 0 0 1rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
    font-size: 0.95rem;
  }
`;

export const IconWrapper = styled.div<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${p => p.$color}20;
  color: ${p => p.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  svg {
    width: 24px;
    height: 24px;
  }
`;

export const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
`;

export const ThemeToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &:hover svg {
    transform: rotate(30deg);
  }
`;

export const NavIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  text-decoration: none;

  svg {
    width: 22px;
    height: 22px;
    transition: transform 0.3s ease, color 0.3s ease;
  }

  &:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--text-primary);
    transform: translateY(-3px) scale(1.05);
    box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);

    svg {
      transform: scale(1.1);
      color: #60a5fa;
    }
  }

  &:active {
    transform: translateY(1px);
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(var(--bg-primary-rgb, 15, 23, 42), 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  border-radius: 24px;
  padding: 2.5rem;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${float} 0.5s ease-out;

  @media (max-width: 480px) {
    padding: 1.5rem;
    border-radius: 20px;
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 1.5rem;
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
  padding: 0.875rem 1rem;
  border-radius: 12px;
  font-size: 1rem;
  transition: all 0.2s;
  box-sizing: border-box;

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
  
  &:hover {
    color: var(--text-primary);
  }
`;

export const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
`;

export const Button = styled.button<{ $primary?: boolean }>`
  background: ${p => p.$primary ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' : 'var(--bg-hover)'};
  color: ${p => p.$primary ? '#ffffff' : 'var(--text-primary)'};
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${p => p.$primary ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' : 'rgba(255, 255, 255, 0.15)'};
    transform: translateY(-1px);
  }
`;

export const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: -0.5rem;
  margin-bottom: 1rem;
`;
