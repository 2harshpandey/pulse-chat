import styled, { keyframes, css } from 'styled-components';

// --- ANIMATIONS ---
export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
`;

export const float1 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(40px, -60px) scale(1.1); }
  50% { transform: translate(-20px, 40px) scale(0.95); }
  75% { transform: translate(30px, 20px) scale(1.05); }
`;

export const float2 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 30px) scale(1.05); }
  50% { transform: translate(30px, -40px) scale(0.9); }
  75% { transform: translate(-20px, -20px) scale(1.1); }
`;

export const float3 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, 50px) scale(0.95); }
  50% { transform: translate(-40px, -30px) scale(1.1); }
  75% { transform: translate(30px, -20px) scale(1); }
`;

export const drawLine = keyframes`
  from { stroke-dashoffset: 180; }
  to { stroke-dashoffset: 0; }
`;

export const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

export const slideUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const tabContentFade = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

export const cardEntrance = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const badgePop = keyframes`
  0%   { transform: scale(0.7); opacity: 0; }
  70%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

export const emptyFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
`;

// --- STYLED COMPONENTS ---
export const AdminContainer = styled.div`
  padding: 2rem;
  background-color: var(--bg-primary);
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: ${slideUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  transition: background-color 0.3s ease;
  @media (max-width: 768px) { padding: 1.25rem 1rem; }
  @media (max-width: 480px) { padding: 1rem 0.75rem; }
  @media (max-height: 500px) { padding: 0.4rem 0.6rem; }
`;

export const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: bold;
  color: var(--text-heading);
  margin-bottom: 0;
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    color: var(--accent-blue);
  }
  span {
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  img {
    height: 44px;
    width: auto;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }
  @media (max-width: 768px) { font-size: 2rem; img { height: 36px; } }
  @media (max-width: 480px) { font-size: 1.5rem; img { height: 30px; } }
  @media (max-height: 500px) { font-size: 1.2rem; img { height: 22px; } }
`;

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

export const PanelThemeToggle = styled.button`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--border-primary);
  background: var(--bg-hover);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  &:hover { transform: scale(1.15); border-color: var(--accent-blue); box-shadow: 0 0 16px rgba(59,130,246,0.2), 0 0 0 3px rgba(59,130,246,0.08); }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
  &:hover svg { transform: rotate(30deg); }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
  flex-shrink: 0;
  @media (max-height: 500px) { margin-bottom: 0.3rem; }
`;

export const Input = styled.input`
  padding: 0.75rem 1rem;
  font-size: 1rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  width: 100%;
  max-width: 300px;
  box-sizing: border-box;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: all 0.25s ease;
  &:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
  &::placeholder { color: var(--text-muted); transition: color 0.3s ease; }
  @media (max-height: 500px) { padding: 0.28rem 0.5rem; font-size: 0.78rem; }
`;

export const TextArea = styled.textarea`
  padding: 0.75rem 1rem;
  font-size: 1rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  width: 100%;
  max-width: 300px;
  box-sizing: border-box;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: all 0.25s ease;
  font-family: inherit;
  resize: none;
  min-height: 150px;
  &:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
  &::placeholder { color: var(--text-muted); transition: color 0.3s ease; }
  @media (max-height: 500px) { padding: 0.28rem 0.5rem; font-size: 0.78rem; }
`;

export const SelectWrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 300px;
  margin-bottom: 1rem;
  box-sizing: border-box;
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 1rem;
    transform: translateY(-50%);
    width: 0.65rem;
    height: 0.65rem;
    background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236B7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.6-3.6%205.4-7.9%205.4-12.9%200-5-1.8-9.2-5.4-12.7z%22%2F%3E%3C%2Fsvg%3E');
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    pointer-events: none;
  }
`;

export const Select = styled.select`
  padding: 0.75rem 1rem;
  padding-right: 2.5rem;
  font-size: 1rem;
  width: 100%;
  margin-bottom: 0;
  flex: none;
  min-width: auto;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  transition: all 0.25s ease;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  &:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
  @media (max-height: 500px) { padding: 0.28rem 0.5rem; padding-right: 2rem; font-size: 0.78rem; }
`;

export const FilterContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: var(--bg-filter);
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
  flex-shrink: 0;
  transition: background-color 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  ${Input}, ${SelectWrapper} {
    flex: 1; min-width: 160px; max-width: none; margin-bottom: 0;
  }
  @media (max-width: 480px) {
    gap: 0.5rem; padding: 0.75rem;
    ${Input}, ${SelectWrapper} { flex: 1 1 100%; min-width: unset; }
  }
  @media (max-height: 500px) {
    flex-wrap: nowrap; gap: 0.3rem; padding: 0.3rem 0.5rem; margin-bottom: 0.3rem;
    ${Input}, ${SelectWrapper} { flex: 1; min-width: 60px; margin-bottom: 0; }
  }
`;

export const FilterToggleButton = styled.button<{ $open: boolean }>`
  align-self: flex-start;
  display: none;
  border: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &::after {
    content: '${(p: any) => (p.$open ? '\\25B2' : '\\25BC')}';
    margin-left: 0.45rem;
    font-size: 0.7rem;
  }

  &:hover {
    border-color: var(--border-focus);
    color: var(--accent-blue);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    display: inline-flex;
    align-items: center;
    position: relative;
    z-index: 2;
  }
`;

export const MessageFilterCollapse = styled.div<{ $open: boolean }>`
  @media (max-width: 768px) {
    display: ${(p: any) => (p.$open ? 'block' : 'none')};
    animation: ${(p: any) => (p.$open ? slideUp : 'none')} 0.22s ease;
  }

  @media (min-width: 769px) {
    display: block;
  }
`;

export const Button = styled.button`
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  background-color: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  &:hover { background-color: #2563EB; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.3); }
  &:active { transform: translateY(0) scale(0.97); box-shadow: none; }
  &:disabled { background-color: #9ca3af; cursor: not-allowed; transform: none; box-shadow: none; }
  @media (max-width: 480px) { padding: 0.6rem 1rem; font-size: 0.9rem; }
`;

export const ErrorMessage = styled.p`
  color: #EF4444;
  margin-top: 1rem;
  animation: ${fadeIn} 0.3s ease-out;
`;

export const TabContainer = styled.div`
  display: flex;
  padding-top: 4px; /* Prevents tabs from getting clipped when translating Y on hover */
  border-bottom: 1px solid var(--border-secondary);
  margin-bottom: -1px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  flex-shrink: 0;
  transition: border-color 0.3s ease;
  &::-webkit-scrollbar { display: none; }
`;

export const TabButton = styled.button<{ active: boolean }>`
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  background-color: ${(p: any) => p.active ? 'var(--bg-tab-active)' : 'transparent'};
  color: ${(p: any) => p.active ? 'var(--accent-blue)' : 'var(--text-secondary)'};
  border: 1px solid ${(p: any) => p.active ? 'var(--border-secondary)' : 'transparent'};
  border-bottom: 1px solid ${(p: any) => p.active ? 'var(--bg-tab-active)' : 'var(--border-secondary)'};
  margin-bottom: -1px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  outline: none;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%) scaleX(${(p: any) => p.active ? 1 : 0});
    width: 60%;
    height: 2px;
    background: var(--accent-blue);
    border-radius: 1px;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover {
    color: var(--accent-blue);
    transform: translateY(-1px);
  }
  &:active { transform: translateY(0) scale(0.97); }
  @media (max-width: 600px) { padding: 0.6rem 1rem; font-size: 0.875rem; }
  @media (max-width: 380px) { padding: 0.5rem 0.65rem; font-size: 0.78rem; }
`;

export const TabContent = styled.div`
  border: 1px solid var(--border-secondary);
  padding: 2rem;
  border-radius: 0 8px 8px 8px;
  background-color: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  animation: ${tabContentFade} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  @media (max-width: 768px) { padding: 1rem 0.85rem; }
  @media (max-width: 480px) { padding: 0.85rem 0.65rem; border-top-right-radius: 8px; }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--text-primary);
  transition: color 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
`;

export const Th = styled.th`
  padding: 0.75rem;
  text-align: left;
  border-bottom: 2px solid var(--border-primary);
  background-color: var(--bg-primary);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
  @media (max-height: 500px) { padding: 0.3rem 0.5rem; font-size: 0.78rem; }
`;

export const StickyTh = styled(Th)`
  position: sticky;
  top: 0;
  z-index: 5;
  box-shadow: 0 1px 0 var(--border-primary);
`;

export const Td = styled.td`
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-primary);
  overflow-wrap: break-word;
  word-break: normal;
  color: var(--text-primary);
  transition: all 0.2s ease;
  tr:hover & { background-color: var(--bg-hover); }
  @media (max-height: 500px) { padding: 0.3rem 0.5rem; font-size: 0.78rem; }
`;

export const TableWrapper = styled.div`
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
`;

export const MessageLogScrollContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-right: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

export const MessageLogTableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-secondary);
`;

// Td variant that never wraps — used for compact columns (Date, Time, Event, Message ID)
export const NoWrapTd = styled(Td)`
  white-space: nowrap;
`;

// Td variant that absorbs all remaining horizontal space — used for the Details column
export const ExpandTd = styled(Td)`
  width: 100%;
`;

// Table variant with min-width for horizontal-scroll tables (audit log)
export const WideTable = styled(Table)`
  min-width: 700px;
`;

export const MessageLogTable = styled(WideTable)`
  margin-top: 0;
`;

export const LogoutButton = styled(Button)`
  background-color: #EF4444;
  flex-shrink: 0;
  &:hover { background-color: #DC2626; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35); }
`;

export const DangerButton = styled(Button)`
  background-color: #EF4444;
  text-shadow: 0 0 2px rgba(0,0,0,0.7);
  &:hover { background-color: #DC2626; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35); }
`;

export const SuccessButton = styled(Button)`
  background-color: #10B981;
  &:hover { background-color: #059669; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35); }
`;

export const SmallButton = styled(Button)`
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  border-radius: 8px;
  @media (max-width: 480px) { padding: 0.45rem 0.7rem; }
`;

export const SmallDangerButton = styled(SmallButton)`
  background-color: #EF4444;
  &:hover { background-color: #DC2626; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3); }
`;

export const SmallSuccessButton = styled(SmallButton)`
  background-color: #10B981;
  &:hover { background-color: #059669; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); }
`;

export const SmallWarningButton = styled(SmallButton)`
  background-color: #F59E0B;
  color: #1a202c;
  &:hover { background-color: #D97706; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3); }
`;

export const ActivityLogContainer = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  background-color: #1a202c;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  overflow-y: auto;
  border: 1px solid var(--border-primary);
  transition: border-color 0.3s ease;
  @media (max-width: 768px) { padding: 0.75rem; font-size: 0.78rem; }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; font-size: 0.75rem; }
`;

export const LogViewerContainer = styled.pre`
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: scroll;
  overflow-x: auto;
  background-color: #1a202c;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  border: 1px solid var(--border-primary);
  transition: border-color 0.3s ease;
  @media (max-width: 768px) { padding: 0.75rem; font-size: 0.78rem; }
  @media (max-height: 500px) { padding: 0.4rem 0.5rem; font-size: 0.75rem; }
`;

export const ActivityLogItem = styled.div`
  padding: 0.25rem 0;
  animation: ${cardEntrance} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
`;

export const SectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-heading);
  margin: 1.5rem 0 0.75rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--border-primary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  transition: color 0.3s ease, border-color 0.3s ease;
  animation: ${slideUp} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 40px;
    height: 2px;
    background: var(--accent-blue);
    border-radius: 1px;
    transition: width 0.3s ease;
  }
  &:hover::after { width: 80px; }

  &:first-child { margin-top: 0; }
  @media (max-width: 480px) { font-size: 1rem; margin: 1.25rem 0 0.6rem 0; }
`;

export const Card = styled.div<{ $variant?: 'default' | 'success' | 'warning' | 'danger' }>`
  background: ${(p: any) => {
    switch (p.$variant) {
      case 'success': return 'linear-gradient(135deg, #f0fdf4, #dcfce7)';
      case 'warning': return 'linear-gradient(135deg, #fffbeb, #fef3c7)';
      case 'danger': return 'linear-gradient(135deg, #fef2f2, #fee2e2)';
      default: return 'var(--bg-secondary)';
    }
  }};
  border: 1px solid ${(p: any) => {
    switch (p.$variant) {
      case 'success': return '#86efac';
      case 'warning': return '#fcd34d';
      case 'danger': return '#fca5a5';
      default: return 'var(--border-primary)';
    }
  }};
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: ${cardEntrance} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  &:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
  &:active { transform: translateY(0); }
  @media (max-width: 480px) { padding: 1rem; border-radius: 8px; }
`;

export const LinkCard = styled(Card)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

export const Badge = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' | 'purple' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  animation: ${badgePop} 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition: transform 0.2s ease;
  ${(p: any) => {
    switch (p.$color) {
      case 'green': return 'background: #dcfce7; color: #166534;';
      case 'red': return 'background: #fee2e2; color: #991b1b;';
      case 'yellow': return 'background: #fef3c7; color: #92400e;';
      case 'gray': return 'background: #f3f4f6; color: #374151;';
      case 'blue': return 'background: #dbeafe; color: #1e40af;';
      default: return '';
    }
  }}
`;

export const StatusDot = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  background-color: ${(p: any) => {
    switch (p.$color) {
      case 'green': return '#22c55e';
      case 'red': return '#ef4444';
      case 'yellow': return '#f59e0b';
      case 'gray': return '#9ca3af';
      default: return '#9ca3af';
    }
  }};
  ${(p: any) => p.$color === 'green' && css`animation: ${pulse} 2s ease-in-out infinite;`}
`;

export const LinkUrlBox = styled.div`
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 0.6rem 1rem;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
  word-break: break-all;
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.25s ease;
  &:hover { border-color: var(--accent-blue); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08); }
`;

export const CopyButton = styled.button`
  background: none;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 0.75rem;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  &:hover { background: var(--bg-hover); border-color: var(--text-muted); color: var(--text-primary); transform: scale(1.05); }
  &:active { transform: scale(0.95); }
`;

export const UsedByList = styled.div`
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 0.5rem;
  transition: color 0.3s ease;
`;

export const LockdownPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  margin-bottom: 1rem;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  &:hover { box-shadow: var(--shadow-sm); }
  @media (max-width: 480px) { padding: 0.75rem; gap: 0.4rem; }
`;

export const LockdownOption = styled.button<{ $active?: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid ${(p: any) => p.$active ? '#3B82F6' : 'var(--border-secondary)'};
  background: ${(p: any) => p.$active ? '#3B82F6' : 'var(--bg-secondary)'};
  color: ${(p: any) => p.$active ? 'white' : 'var(--text-secondary)'};
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: ${(p: any) => p.$active ? '0 4px 14px rgba(59, 130, 246, 0.3)' : 'none'};
  &:hover { border-color: #3B82F6; transform: translateY(-2px); box-shadow: 0 4px 14px rgba(59, 130, 246, 0.2); }
  &:active { transform: translateY(0) scale(0.97); }
`;

export const AuditLogEntry = styled.div<{ $type?: string }>`
  padding: 0.6rem 0.8rem;
  border-left: 3px solid ${(p: any) => {
    if (p.$type?.includes('blocked')) return '#ef4444';
    if (p.$type?.includes('unblocked')) return '#22c55e';
    if (p.$type?.includes('failed')) return '#f59e0b';
    if (p.$type?.includes('temp_link')) return '#3B82F6';
    if (p.$type?.includes('lockdown')) return '#8b5cf6';
    if (p.$type?.includes('force')) return '#f97316';
    return '#94a3b8';
  }};
  background: var(--bg-tertiary);
  margin-bottom: 0.5rem;
  border-radius: 0 8px 8px 0;
  font-size: 0.85rem;
  animation: ${cardEntrance} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-primary);
  transition: all 0.25s ease;
  &:hover { transform: translateX(4px); background: var(--bg-hover); }
  @media (max-width: 480px) { padding: 0.5rem 0.6rem; font-size: 0.8rem; }
`;

export const AdminLogLink = styled.a`
  color: #3B82F6;
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
  [data-theme='dark'] & { color: #f59e0b; }
`;

export const ScrollContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  padding-right: 0.5rem;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
  text-align: center;
  gap: 0.75rem;
  transition: color 0.3s ease;
  animation: ${slideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1);

  svg { animation: ${emptyFloat} 3s ease-in-out infinite; }
`;

export const CustomTimeInput = styled.input`
  padding: 0.5rem;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  font-size: 0.85rem;
  width: 100px;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: border-color 0.3s ease, background-color 0.3s ease, color 0.3s ease;
  &:focus { outline: none; border-color: var(--border-focus); }
`;

export const ClearHistoryButton = styled(Button)`
  background-color: #e53e3e;
  flex-shrink: 0;
  &:hover { background-color: #c53030; }
`;

export const DeleteRoomButton = styled(Button)`
  background-color: #991b1b;
  color: white;
  border: none;
  flex-shrink: 0;
  transition: all 0.2s;
  &:hover { 
    background-color: #7f1d1d; 
    box-shadow: 0 4px 12px rgba(153, 27, 27, 0.4);
  }
`;

export const HideFrontendButton = styled(Button)`
  background-color: #d97706;
  flex-shrink: 0;
  &:hover { background-color: #b45309; }
`;

// --- Responsive table: visible on desktop, hidden on mobile ---
export const ResponsiveTableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-width: 640px) { display: none; }
`;

// --- Mobile card list: hidden on desktop, visible on mobile ---
export const MobileCardList = styled.div`
  display: none;
  flex-direction: column;
  gap: 0.6rem;
  @media (max-width: 640px) { display: flex; }
`;

export const UserCard = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  box-shadow: var(--shadow-sm);
  animation: ${cardEntrance} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
`;

export const UserCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
`;

export const UserCardMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  margin-bottom: 0.6rem;
  transition: background-color 0.3s ease;
`;

export const UserCardMetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
`;

export const UserCardMetaLabel = styled.span`
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  transition: color 0.3s ease;
`;

export const UserCardMetaValue = styled.span`
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-align: right;
  word-break: break-all;
  transition: color 0.3s ease;
`;

export const UserCardActions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
`;

export const ModalContent = styled.div`
  background: var(--bg-elevated, #1e293b);
  border: 1px solid var(--border-primary, #334155);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  padding: 1.5rem;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
  color: white;
`;

export const ModalHeader = styled.h3`
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: var(--text-heading, #f8fafc);
`;

export const ModalBody = styled.p`
  margin: 0 0 1.5rem 0;
  font-size: 0.95rem;
  color: var(--text-secondary, #94a3b8);
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
`;

export const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1.5rem 0;
`;

export const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-primary, #334155);
  background: rgba(255,255,255,0.02);
  transition: all 0.2s;
  &:hover { background: rgba(255,255,255,0.05); }
  input:checked + span {
    color: var(--accent-blue, #3b82f6);
    font-weight: 600;
  }
`;
