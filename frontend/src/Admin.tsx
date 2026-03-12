import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useTheme } from './ThemeContext';

/**
 * Sanitizes a URL before using it as an href/src attribute.
 */
const sanitizeUrl = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.href;
  } catch {
    return '';
  }
};

const isTenorUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'tenor.com' || hostname.endsWith('.tenor.com');
  } catch {
    return false;
  }
};

// Sanitize a server-issued ID before interpolating it into a URL path segment.
// Our userIds are base-36 alphanumeric; MongoDB ObjectIds are 24 hex chars.
// Stripping anything outside [a-zA-Z0-9_-] + percent-encoding prevents path traversal.
const sanitizePathId = (id: string): string =>
  encodeURIComponent(id.replace(/[^a-zA-Z0-9_-]/g, ''));

// --- ANIMATIONS ---
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
`;

const float1 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(40px, -60px) scale(1.1); }
  50% { transform: translate(-20px, 40px) scale(0.95); }
  75% { transform: translate(30px, 20px) scale(1.05); }
`;

const float2 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 30px) scale(1.05); }
  50% { transform: translate(30px, -40px) scale(0.9); }
  75% { transform: translate(-20px, -20px) scale(1.1); }
`;

const float3 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, 50px) scale(0.95); }
  50% { transform: translate(-40px, -30px) scale(1.1); }
  75% { transform: translate(30px, -20px) scale(1); }
`;

const drawLine = keyframes`
  from { stroke-dashoffset: 180; }
  to { stroke-dashoffset: 0; }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const tabContentFade = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const cardEntrance = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const badgePop = keyframes`
  0%   { transform: scale(0.7); opacity: 0; }
  70%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

const emptyFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
`;

// --- STYLED COMPONENTS ---
const AdminContainer = styled.div`
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

const Title = styled.h1`
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

const LoginFormContainer = styled.div`
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

const LoginBox = styled.div`
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

const AdminOrb = styled.div<{ $color: string; $size: number; $top: string; $left: string; $anim: ReturnType<typeof keyframes> }>`
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

const AdminLoginBrand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 1.75rem;
  width: 100%;
`;

const AdminBrandLogo = styled.img`
  width: 80px;
  height: 80px;
  object-fit: contain;
  margin-bottom: 0.75rem;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
`;
const AdminBrandWordmark = styled.h1`
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

const AdminHeartbeatSvg = styled.svg`
  display: block;
  margin: 0.5rem auto;
  overflow: visible;
  path {
    fill: none;
    stroke: var(--accent-indigo);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 180;
    animation: ${drawLine} 1.5s ease-out forwards;
    filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.3));
  }
`;

const AdminBrandSubtitle = styled.p`
  font-size: 0.9rem;
  color: var(--text-tertiary);
  margin-top: 0.75rem;
  transition: color 0.3s ease;
`;

const AdminInputGroup = styled.div<{ $focused?: boolean }>`
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

const AdminInputIcon = styled.div<{ $focused?: boolean }>`
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

const AdminStyledInput = styled.input`
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

const AdminEyeBtn = styled.button`
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

const AdminSubmitBtn = styled.button<{ $loading?: boolean }>`
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

const AdminThemeToggle = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-primary);
  background: var(--bg-elevated);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 2;
  &:hover { transform: scale(1.15); border-color: var(--accent-blue); box-shadow: 0 0 16px rgba(59,130,246,0.2); }
  &:active { transform: scale(0.9); }
  svg { width: 18px; height: 18px; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
  &:hover svg { transform: rotate(30deg); }
`;

const AdminSecuredLine = styled.div`
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

const PanelThemeToggle = styled.button`
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

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
  flex-shrink: 0;
  @media (max-height: 500px) { margin-bottom: 0.3rem; }
`;

const Input = styled.input`
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

const SelectWrapper = styled.div`
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

const Select = styled.select`
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

const FilterContainer = styled.div`
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

const Button = styled.button`
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

const ErrorMessage = styled.p`
  color: #EF4444;
  margin-top: 1rem;
  animation: ${fadeIn} 0.3s ease-out;
`;

const TabContainer = styled.div`
  display: flex;
  border-bottom: 1px solid var(--border-secondary);
  margin-bottom: -1px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  flex-shrink: 0;
  transition: border-color 0.3s ease;
  &::-webkit-scrollbar { display: none; }
`;

const TabButton = styled.button<{ active: boolean }>`
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

const TabContent = styled.div`
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

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--text-primary);
  transition: color 0.3s ease;
  animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1);
`;
const Th = styled.th`
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

const Td = styled.td`
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

const TableWrapper = styled.div`
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
`;

// Td variant that never wraps — used for compact columns (Date, Time, Event, Message ID)
const NoWrapTd = styled(Td)`
  white-space: nowrap;
`;

// Td variant that absorbs all remaining horizontal space — used for the Details column
const ExpandTd = styled(Td)`
  width: 100%;
`;

// Table variant with min-width for horizontal-scroll tables (audit log)
const WideTable = styled(Table)`
  min-width: 700px;
`;

const LogoutButton = styled(Button)`
  background-color: #EF4444;
  flex-shrink: 0;
  &:hover { background-color: #DC2626; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35); }
`;

const DangerButton = styled(Button)`
  background-color: #EF4444;
  text-shadow: 0 0 2px rgba(0,0,0,0.7);
  &:hover { background-color: #DC2626; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35); }
`;

const SuccessButton = styled(Button)`
  background-color: #10B981;
  &:hover { background-color: #059669; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35); }
`;

const SmallButton = styled(Button)`
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  border-radius: 8px;
  @media (max-width: 480px) { padding: 0.45rem 0.7rem; }
`;

const SmallDangerButton = styled(SmallButton)`
  background-color: #EF4444;
  &:hover { background-color: #DC2626; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3); }
`;

const SmallSuccessButton = styled(SmallButton)`
  background-color: #10B981;
  &:hover { background-color: #059669; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); }
`;

const SmallWarningButton = styled(SmallButton)`
  background-color: #F59E0B;
  color: #1a202c;
  &:hover { background-color: #D97706; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3); }
`;

const ActivityLogContainer = styled.div`
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

const LogViewerContainer = styled.pre`
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

const ActivityLogItem = styled.div`
  padding: 0.25rem 0;
  animation: ${cardEntrance} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
`;

const SectionTitle = styled.h3`
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

const Card = styled.div<{ $variant?: 'default' | 'success' | 'warning' | 'danger' }>`
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

const LinkCard = styled(Card)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const Badge = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' }>`
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

const StatusDot = styled.span<{ $color: 'green' | 'red' | 'yellow' | 'gray' }>`
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

const LinkUrlBox = styled.div`
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

const CopyButton = styled.button`
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

const UsedByList = styled.div`
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 0.5rem;
  transition: color 0.3s ease;
`;

const LockdownPanel = styled.div`
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

const LockdownOption = styled.button<{ $active?: boolean }>`
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

const AuditLogEntry = styled.div<{ $type?: string }>`
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

const AdminLogLink = styled.a`
  color: #3B82F6;
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
  [data-theme='dark'] & { color: #f59e0b; }
`;

const ScrollContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  padding-right: 0.5rem;
`;

const EmptyState = styled.div`
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

const CustomTimeInput = styled.input`
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

const ClearHistoryButton = styled(Button)`
  background-color: #e53e3e;
  flex-shrink: 0;
  &:hover { background-color: #c53030; }
`;

// --- Responsive table: visible on desktop, hidden on mobile ---
const ResponsiveTableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-width: 640px) { display: none; }
`;

// --- Mobile card list: hidden on desktop, visible on mobile ---
const MobileCardList = styled.div`
  display: none;
  flex-direction: column;
  gap: 0.6rem;
  @media (max-width: 640px) { display: flex; }
`;

const UserCard = styled.div`
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  box-shadow: var(--shadow-sm);
  animation: ${cardEntrance} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  &:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
`;

const UserCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
`;

const UserCardMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  margin-bottom: 0.6rem;
  transition: background-color 0.3s ease;
`;

const UserCardMetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
`;

const UserCardMetaLabel = styled.span`
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  transition: color 0.3s ease;
`;

const UserCardMetaValue = styled.span`
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-align: right;
  word-break: break-all;
  transition: color 0.3s ease;
`;

const UserCardActions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

// --- INTERFACES ---
interface UserProfile {
  userId: string;
  username: string;
  createdAt?: string;
}

interface TempLinkData {
  _id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  isRevoked: boolean;
  revokedAt: string | null;
  usedBy: { username: string; joinedAt: string }[];
}

interface BlockedUserData {
  _id: string;
  userId: string;
  username: string;
  isBlocked: boolean;
  blockedAt: string;
  unblockedAt: string | null;
  reason: string;
  fingerprints: {
    ips: string[];
    userAgents: string[];
    deviceHashes: string[];
  };
}

interface LockdownData {
  isActive: boolean;
  type?: string;
  startTime?: string;
  endTime?: string | null;
}

interface AuditLogData {
  _id: string;
  type: string;
  details: any;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

interface LoggedInUser {
  userId: string;
  username: string;
  loginTime: string;
  ip?: string;
  userAgent?: string;
  viaTempLink?: boolean;
}

type Tab = 'messages' | 'users' | 'access' | 'security' | 'activity' | 'logs';

// --- HELPERS ---
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDateTime = (dateString: string) => `${formatDate(dateString)} ${formatTime(dateString)}`;

// Rewrites the "timestamp" field inside a raw Winston JSON log line to IST
const formatServerLogLine = (line: string): string => {
  try {
    const parsed = JSON.parse(line);
    if (parsed.timestamp) {
      // Try to parse the timestamp and convert to IST
      const date = new Date(parsed.timestamp);
      if (!isNaN(date.getTime())) {
        const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        parsed.timestamp =
          `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
          `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())} IST`;
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return line;
  }
};

const getTimeRemaining = (expiresAt: string): string => {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const getLinkStatus = (link: TempLinkData): { status: 'active' | 'expired' | 'revoked'; label: string } => {
  if (link.isRevoked) return { status: 'revoked', label: 'Revoked' };
  if (new Date() > new Date(link.expiresAt)) return { status: 'expired', label: 'Expired' };
  return { status: 'active', label: 'Active' };
};

const auditTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'user_blocked': '🚫 User Blocked',
    'user_unblocked': '✅ User Unblocked',
    'user_force_logged_out': '🔒 Force Logged Out',
    'join_failed_blocked': '⛔ Join Failed (Blocked)',
    'join_failed_lockdown': '🔐 Join Failed (Lockdown)',
    'join_failed_password': '❌ Join Failed (Wrong Password)',
    'join_failed_username_taken': '⚠️ Join Failed (Username Taken)',
    'temp_link_created': '🔗 Temp Link Created',
    'temp_link_revoked': '🔗 Temp Link Revoked',
    'temp_link_used': '🔗 Temp Link Used',
    'temp_link_expired_attempt': '🔗 Expired Link Attempt',
    'lockdown_enabled': '🔒 Lockdown Enabled',
    'lockdown_disabled': '🔓 Lockdown Disabled',
  };
  return labels[type] || type;
};

// ===================== ADMIN COMPONENT =====================
const Admin = () => {
  const { isDark, toggleTheme } = useTheme();
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [activityLogs, setActivityLogs] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('admin-activity-logs');
    return saved ? JSON.parse(saved) : [];
  });
  const ws = useRef<WebSocket | null>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<string>('');

  // Message Log filters
  const [filterMessageId, setFilterMessageId] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterEventType, setFilterEventType] = useState('All');
  const [filterContent, setFilterContent] = useState('');

  // New feature states
  const [tempLinks, setTempLinks] = useState<TempLinkData[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserData[]>([]);
  const [lockdownStatus, setLockdownStatus] = useState<LockdownData>({ isActive: false });
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [loggedInUsersList, setLoggedInUsersList] = useState<LoggedInUser[]>([]);
  const [onlineUsersList, setOnlineUsersList] = useState<UserProfile[]>([]);
  const [customLockdownMinutes, setCustomLockdownMinutes] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [, setLinkTimerKey] = useState(0);

  // Refresh link countdown timers every second
  useEffect(() => {
    const interval = setInterval(() => setLinkTimerKey(k => k + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activityLogRef.current) activityLogRef.current.scrollTop = 0;
  }, [activityLogs]);

  // --- WebSocket ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const storedPassword = passwordRef.current;
    if (!storedPassword) return;

    const wsUrl = `${process.env.REACT_APP_API_URL?.replace('http', 'ws') || 'ws://localhost:8080'}?admin=true`;
    ws.current = new WebSocket(wsUrl);
    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'admin_auth', password: storedPassword }));
    };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'activity':
          setActivityLogs(prev => {
            const newLogs = [`[${new Date().toLocaleTimeString()}] ${message.data}`, ...prev].slice(0, 50);
            sessionStorage.setItem('admin-activity-logs', JSON.stringify(newLogs));
            return newLogs;
          });
          break;
        case 'history':
          setHistoryLogs(prev => [message.data, ...prev].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          break;
        case 'chat_cleared':
          setHistoryLogs([]);
          setActivityLogs(prev => [`[${new Date().toLocaleTimeString()}] Chat history permanently cleared.`, ...prev]);
          break;
        case 'user_joined':
          setOnlineUsersList(prev => prev.some(u => u.userId === message.data.userId) ? prev : [...prev, message.data]);
          break;
        case 'user_left':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'users':
          setUsers(message.data);
          break;
        case 'online_users_admin':
          setOnlineUsersList(message.data);
          break;
        case 'logged_in_users':
          setLoggedInUsersList(message.data);
          break;
        case 'server_logs':
          setServerLogs(message.data.split('\n').reverse());
          break;
        case 'temp_link_created':
          setTempLinks(prev => [message.data, ...prev]);
          break;
        case 'temp_link_revoked':
          setTempLinks(prev => prev.map(l => l._id === message.data._id ? message.data : l));
          break;
        case 'user_blocked':
          setBlockedUsers(prev => [message.data, ...prev.filter(u => u.userId !== message.data.userId)]);
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'user_unblocked':
          setBlockedUsers(prev => prev.map(u => u.userId === message.data.userId ? message.data : u));
          break;
        case 'user_force_logged_out':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'user_logged_out':
          setOnlineUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          setLoggedInUsersList(prev => prev.filter(u => u.userId !== message.data.userId));
          break;
        case 'lockdown_update':
          setLockdownStatus(message.data);
          break;
        case 'audit_log':
          setAuditLogs(prev => [{ ...message.data, _id: Date.now().toString() }, ...prev].slice(0, 200));
          break;
        default: break;
      }
    };
    ws.current.onclose = () => console.log('Admin WebSocket disconnected');
    ws.current.onerror = (error) => console.error('Admin WebSocket error:', error);
    return () => { if (ws.current) ws.current.close(); };
  }, [isAuthenticated]);

  const apiHeaders = useCallback(() => ({
    'x-admin-password': passwordRef.current,
    'Content-Type': 'application/json',
  }), []);
  const apiUrl = process.env.REACT_APP_API_URL || '';

  // --- Auth ---
  const handleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const headers = { 'x-admin-password': password };
      const [usersRes, historyRes, serverLogsRes, tempLinksRes, blockedRes, lockdownRes, auditRes, loggedInRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/users`, { headers }),
        fetch(`${apiUrl}/api/admin/history`, { headers }),
        fetch(`${apiUrl}/api/admin/server-logs`, { headers }),
        fetch(`${apiUrl}/api/admin/temp-links`, { headers }),
        fetch(`${apiUrl}/api/admin/blocked-users`, { headers }),
        fetch(`${apiUrl}/api/admin/login-lockdown`, { headers }),
        fetch(`${apiUrl}/api/admin/audit-logs`, { headers }),
        fetch(`${apiUrl}/api/admin/logged-in-users`, { headers }),
      ]);
      if (usersRes.ok && historyRes.ok) {
        passwordRef.current = password;
        setUsers(await usersRes.json());
        setHistoryLogs((await historyRes.json()).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setServerLogs((await serverLogsRes.text()).split('\n').reverse());
        if (tempLinksRes.ok) setTempLinks(await tempLinksRes.json());
        if (blockedRes.ok) setBlockedUsers(await blockedRes.json());
        if (lockdownRes.ok) setLockdownStatus(await lockdownRes.json());
        if (auditRes.ok) setAuditLogs(await auditRes.json());
        if (loggedInRes.ok) setLoggedInUsersList(await loggedInRes.json());
        setIsAuthenticated(true);
      } else {
        setError('Incorrect password.');
      }
    } catch {
      setError('An error occurred while trying to log in.');
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    if (ws.current) ws.current.close();
    passwordRef.current = '';
    sessionStorage.removeItem('admin-activity-logs');
    setIsAuthenticated(false);
    setPassword('');
    setActivityLogs([]);
  };

  const handlePermanentClear = async () => {
    const enteredPassword = prompt("Re-enter admin password to confirm:");
    if (enteredPassword !== passwordRef.current) { alert("Incorrect password."); return; }
    if (window.confirm("ARE YOU SURE?\n\nThis will permanently delete all messages and events.")) {
      try {
        const res = await fetch(`${apiUrl}/api/messages/all`, {
          method: 'DELETE',
          headers: { 'x-admin-secret': process.env.REACT_APP_ADMIN_SECRET || '' },
        });
        if (res.ok) { alert("All chat history deleted."); setHistoryLogs([]); }
        else { const d = await res.json(); alert(`Error: ${d.error || 'Failed.'}`); }
      } catch { alert("A network error occurred."); }
    }
  };

  const handleRefreshServerLogs = async () => {
    if (!passwordRef.current) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/server-logs`, { headers: { 'x-admin-password': passwordRef.current } });
      if (res.ok) setServerLogs((await res.text()).split('\n').reverse());
    } catch (err) { console.error("Failed to fetch server logs", err); }
  };

  // --- Temp Link Actions ---
  const handleCreateTempLink = async () => {
    setCreatingLink(true);
    try {
      // State is updated via the WebSocket 'temp_link_created' broadcast — do NOT also
      // update from the HTTP response or the link will appear twice in the list.
      const res = await fetch(`${apiUrl}/api/admin/temp-links`, { method: 'POST', headers: apiHeaders() });
      if (!res.ok) { console.error('Failed to create temp link:', await res.text()); }
    } catch (err) { console.error('Failed to create temp link', err); }
    setCreatingLink(false);
  };

  const handleRevokeTempLink = async (id: string) => {
    try {
      const safeId = sanitizePathId(id);
      // State is updated via the WebSocket 'temp_link_revoked' broadcast — do NOT also
      // update from the HTTP response or the link status will flicker / update twice.
      const res = await fetch(`${apiUrl}/api/admin/temp-links/${safeId}/revoke`, { method: 'POST', headers: apiHeaders() });
      if (!res.ok) { console.error('Failed to revoke temp link:', await res.text()); }
    } catch (err) { console.error('Failed to revoke temp link', err); }
  };

  const handleCopyLink = (token: string, id: string) => {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    });
  };

  // --- User Actions ---
  const handleForceLogout = async (userId: string) => {
    if (!window.confirm('Force logout this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      await fetch(`${apiUrl}/api/admin/force-logout/${safeId}`, { method: 'POST', headers: apiHeaders() });
      setOnlineUsersList(prev => prev.filter(u => u.userId !== userId));
      setLoggedInUsersList(prev => prev.filter(u => u.userId !== userId));
    } catch (err) { console.error('Failed to force logout', err); }
  };

  const handleForceLogoutAll = async () => {
    if (!window.confirm(`Force logout ALL ${onlineUsersList.length} online user(s)? This cannot be undone.`)) return;
    try {
      await fetch(`${apiUrl}/api/admin/force-logout-all`, { method: 'POST', headers: apiHeaders() });
      setOnlineUsersList([]);
      setLoggedInUsersList([]);
    } catch (err) { console.error('Failed to force logout all', err); }
  };

  const handleBlockUser = async (userId: string, username: string) => {
    const reason = prompt(`Block user "${username}"? Enter a reason (optional):`);
    if (reason === null) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/block-user`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ userId, username, reason }),
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(prev => [data.blockedUser, ...prev.filter(u => u.userId !== userId)]);
        setOnlineUsersList(prev => prev.filter(u => u.userId !== userId));
        setLoggedInUsersList(prev => prev.filter(u => u.userId !== userId));
      }
    } catch (err) { console.error('Failed to block user', err); }
  };

  const handleUnblockUser = async (userId: string) => {
    if (!window.confirm('Unblock this user?')) return;
    try {
      const safeId = sanitizePathId(userId);
      const res = await fetch(`${apiUrl}/api/admin/unblock-user/${safeId}`, { method: 'POST', headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(prev => prev.map(u => u.userId === userId ? data.blockedUser : u));
      }
    } catch (err) { console.error('Failed to unblock user', err); }
  };

  // --- Lockdown Actions ---
  const handleSetLockdown = async (type: string) => {
    try {
      const body: any = { type };
      if (type === 'custom') {
        const mins = parseInt(customLockdownMinutes);
        if (!mins || mins <= 0) { alert('Enter a valid number of minutes.'); return; }
        body.customMinutes = mins;
      }
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) setLockdownStatus(await res.json());
    } catch (err) { console.error('Failed to set lockdown', err); }
  };

  const handleRemoveLockdown = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/login-lockdown`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) setLockdownStatus({ isActive: false });
    } catch (err) { console.error('Failed to remove lockdown', err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  // --- Render Helpers ---
  const renderEventType = (logType: string) => {
    switch (logType) {
      case 'create': return 'Create';
      case 'edit': return 'Edit';
      case 'upload': return 'Upload';
      case 'delete_everyone': return 'Delete (Everyone)';
      default: return logType;
    }
  };

  const renderMessageDetails = (log: any) => {
    const formatMedia = (content: any) => {
      if (!content) return '"[Empty]"';
      const text = content.text || '';
      if (content.url) {
        const isGif = isTenorUrl(content.url);
        const fileName = content.originalName || (isGif ? 'GIF' : 'Uploaded File');
        const safeHref = sanitizeUrl(content.url);
        return <>{text && `"${text}" `}{safeHref ? <AdminLogLink href={safeHref} target="_blank" rel="noopener noreferrer">[{fileName}]</AdminLogLink> : <span>[{fileName}]</span>}</>;
      }
      return `"${text}"`;
    };
    switch (log.type) {
      case 'create': return <>Content: {formatMedia(log.message)}</>;
      case 'edit': return <>Old: "{log.oldText}" → New: "{log.newText}"</>;
      case 'delete_everyone': return <>Deleted: {formatMedia(log.deletedContent)}</>;
      case 'upload': return `File: '${log.file.originalname}' (${(log.file.size / 1024).toFixed(2)} KB)`;
      default: return JSON.stringify(log);
    }
  };

  const enrichedHistoryLogs = useMemo(() => {
    const userMap = new Map(users.map(u => [u.userId, u.username]));
    return historyLogs.map(log => ({ ...log, username: log.username || userMap.get(log.userId) || 'Unknown' }));
  }, [historyLogs, users]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [users]);

  const filteredHistoryLogs = useMemo(() => {
    return enrichedHistoryLogs.filter(log => {
      const messageIdMatch = filterMessageId ? (log.messageId || log.message?.id)?.toLowerCase().includes(filterMessageId.toLowerCase()) : true;
      const userMatch = filterUser ? (log.username || '').toLowerCase().includes(filterUser.toLowerCase()) : true;
      const eventTypeMatch = filterEventType === 'All' ? true : log.type === filterEventType.toLowerCase().replace(' (everyone)', '_everyone');
      const contentMatch = !filterContent ? true : (() => {
        const lc = filterContent.toLowerCase();
        if (log.type === 'create' && log.message?.text) return log.message.text.toLowerCase().includes(lc);
        if (log.type === 'edit') return (log.oldText?.toLowerCase().includes(lc)) || (log.newText?.toLowerCase().includes(lc));
        if (log.type === 'delete_everyone' && log.deletedContent?.text) return log.deletedContent.text.toLowerCase().includes(lc);
        if (log.type === 'upload' && log.file?.originalname) return log.file.originalname.toLowerCase().includes(lc);
        return false;
      })();
      return messageIdMatch && userMatch && eventTypeMatch && contentMatch;
    });
  }, [enrichedHistoryLogs, filterMessageId, filterUser, filterEventType, filterContent]);

  // =========== LOGIN SCREEN ===========
  if (!isAuthenticated) {
    return (
      <LoginFormContainer>
        <AdminOrb $color="rgba(99,102,241,0.3)" $size={500} $top="-10%" $left="-10%" $anim={float1} />
        <AdminOrb $color="rgba(59,130,246,0.25)" $size={400} $top="60%" $left="60%" $anim={float2} />
        <AdminOrb $color="rgba(236,72,153,0.18)" $size={350} $top="30%" $left="70%" $anim={float3} />
        <LoginBox>
          <AdminThemeToggle onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </AdminThemeToggle>
          <AdminLoginBrand>
            <AdminBrandLogo src="/pulse_logo.png" alt="Pulse Admin" />
            <AdminBrandWordmark><span>Pulse</span> Chat</AdminBrandWordmark>
            <AdminHeartbeatSvg viewBox="0 0 120 30" width="120" height="30">
              <path d="M0 15 L30 15 L38 5 L46 25 L54 8 L60 15 L90 15 L98 5 L106 25 L114 8 L120 15" />
            </AdminHeartbeatSvg>
            <AdminBrandSubtitle>Admin Control Panel</AdminBrandSubtitle>
          </AdminLoginBrand>
          <AdminInputGroup $focused={passwordFocused}>
            <AdminInputIcon $focused={passwordFocused}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </AdminInputIcon>
            <AdminStyledInput
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoFocus
            />
            <AdminEyeBtn type="button" onClick={() => setIsPasswordVisible(prev => !prev)}>
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </AdminEyeBtn>
          </AdminInputGroup>
          <AdminSubmitBtn onClick={handleLogin} disabled={isLoading} $loading={isLoading}>
            {isLoading ? 'Authenticating...' : 'Login'}
          </AdminSubmitBtn>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <AdminSecuredLine>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Protected admin access
          </AdminSecuredLine>
        </LoginBox>
      </LoginFormContainer>
    );
  }

  // =========== MAIN ADMIN PANEL ===========
  return (
    <AdminContainer>
      <HeaderRow>
        <Title>
          <a href="/admin">
            <img src="/pulse_logo.png" alt="Pulse Admin Panel" />
            <span>Pulse</span> Chat
          </a>
        </Title>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lockdownStatus.isActive && (
            <Badge $color="red"><StatusDot $color="red" /> Lockdown Active</Badge>
          )}
          <PanelThemeToggle onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </PanelThemeToggle>
          <LogoutButton onClick={handleLogout}>Logout</LogoutButton>
        </div>
      </HeaderRow>

      <TabContainer>
        <TabButton active={activeTab === 'messages'} onClick={() => setActiveTab('messages')}>Message Log</TabButton>
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>Users</TabButton>
        <TabButton active={activeTab === 'access'} onClick={() => setActiveTab('access')}>Access Links</TabButton>
        <TabButton active={activeTab === 'security'} onClick={() => setActiveTab('security')}>Security</TabButton>
        <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>Live Activity</TabButton>
        <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>Server Logs</TabButton>
      </TabContainer>

      <TabContent>
        {/* ===== MESSAGE LOG ===== */}
        {activeTab === 'messages' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Message Log</h2>
              <ClearHistoryButton onClick={handlePermanentClear}>Clear Chat History</ClearHistoryButton>
            </div>
            <FilterContainer>
              <Input type="text" placeholder="Filter by Message ID" value={filterMessageId} onChange={(e) => setFilterMessageId(e.target.value)} />
              <Input type="text" placeholder="Filter by User" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} />
              <SelectWrapper>
                <Select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}>
                  <option value="All">All Events</option>
                  <option value="Create">Create</option>
                  <option value="Edit">Edit</option>
                  <option value="Upload">Upload</option>
                  <option value="Delete (Everyone)">Delete (Everyone)</option>
                </Select>
              </SelectWrapper>
              <Input type="text" placeholder="Filter by Content" value={filterContent} onChange={(e) => setFilterContent(e.target.value)} />
            </FilterContainer>
            {isLoading ? <p>Loading history...</p> : (
              <TableWrapper>
                <WideTable>
                  <thead>
                    <tr><Th>Date</Th><Th>Time</Th><Th>Event</Th><Th>User</Th><Th>Message ID</Th><Th>Details</Th></tr>
                  </thead>
                  <tbody>
                    {filteredHistoryLogs.map((log, index) => (
                      <tr key={index}>
                        <NoWrapTd>{formatDate(log.timestamp)}</NoWrapTd>
                        <NoWrapTd>{formatTime(log.timestamp)}</NoWrapTd>
                        <NoWrapTd>{renderEventType(log.type)}</NoWrapTd>
                        <Td>{log.username} ({log.userId})</Td>
                        <NoWrapTd style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{log.messageId || log.message?.id || 'N/A'}</NoWrapTd>
                        <ExpandTd>{renderMessageDetails(log)}</ExpandTd>
                      </tr>
                    ))}
                  </tbody>
                </WideTable>
              </TableWrapper>
            )}
          </>
        )}

        {/* ===== USERS ===== */}
        {activeTab === 'users' && (
          <ScrollContainer>
            {onlineUsersList.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <DangerButton onClick={handleForceLogoutAll} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚡ Force Logout All ({onlineUsersList.length})
                </DangerButton>
              </div>
            )}
            <SectionTitle>
              <StatusDot $color="green" /> Online Users ({onlineUsersList.length})
            </SectionTitle>
            {onlineUsersList.length === 0 ? (
              <EmptyState><span>No users currently online</span></EmptyState>
            ) : (
              <>
                <ResponsiveTableWrapper>
                  <Table>
                    <thead><tr><Th>Username</Th><Th>User ID</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {onlineUsersList.map(user => (
                        <tr key={user.userId}>
                          <Td><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><StatusDot $color="green" /><strong>{user.username}</strong></div></Td>
                          <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                          <Td>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                              <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </ResponsiveTableWrapper>
                <MobileCardList>
                  {onlineUsersList.map(user => (
                    <UserCard key={user.userId}>
                      <UserCardHeader>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <StatusDot $color="green" />
                          <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                        </div>
                        <Badge $color="green"><StatusDot $color="green" />Online</Badge>
                      </UserCardHeader>
                      <UserCardMeta>
                        <UserCardMetaRow>
                          <UserCardMetaLabel>User ID</UserCardMetaLabel>
                          <UserCardMetaValue style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{user.userId}</UserCardMetaValue>
                        </UserCardMetaRow>
                      </UserCardMeta>
                      <UserCardActions>
                        <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                        <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                      </UserCardActions>
                    </UserCard>
                  ))}
                </MobileCardList>
              </>
            )}

            <SectionTitle style={{ marginTop: '2rem' }}>
              <StatusDot $color="yellow" /> Logged-In Sessions ({loggedInUsersList.length})
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>— includes offline</span>
            </SectionTitle>
            {loggedInUsersList.length === 0 ? (
              <EmptyState><span>No tracked sessions</span></EmptyState>
            ) : (
              <>
                <ResponsiveTableWrapper>
                  <Table>
                    <thead><tr><Th>Username</Th><Th>Status</Th><Th>Login Time</Th><Th>Via</Th><Th>Actions</Th></tr></thead>
                    <tbody>
                      {loggedInUsersList.map(user => {
                        const isOnline = onlineUsersList.some(u => u.userId === user.userId);
                        return (
                          <tr key={user.userId}>
                            <Td><div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><StatusDot $color={isOnline ? 'green' : 'gray'} /><strong>{user.username}</strong></div></Td>
                            <Td><Badge $color={isOnline ? 'green' : 'gray'}>{isOnline ? 'Online' : 'Offline'}</Badge></Td>
                            <Td style={{ fontSize: '0.85rem' }}>{user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}</Td>
                            <Td>{user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}</Td>
                            <Td>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                                <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </ResponsiveTableWrapper>
                <MobileCardList>
                  {loggedInUsersList.map(user => {
                    const isOnline = onlineUsersList.some(u => u.userId === user.userId);
                    return (
                      <UserCard key={user.userId}>
                        <UserCardHeader>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <StatusDot $color={isOnline ? 'green' : 'gray'} />
                            <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                          </div>
                          <Badge $color={isOnline ? 'green' : 'gray'}>{isOnline ? 'Online' : 'Offline'}</Badge>
                        </UserCardHeader>
                        <UserCardMeta>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Login</UserCardMetaLabel>
                            <UserCardMetaValue>{user.loginTime ? formatDateTime(user.loginTime) : 'N/A'}</UserCardMetaValue>
                          </UserCardMetaRow>
                          <UserCardMetaRow>
                            <UserCardMetaLabel>Via</UserCardMetaLabel>
                            <UserCardMetaValue>{user.viaTempLink ? <Badge $color="blue">Temp Link</Badge> : <Badge $color="gray">Password</Badge>}</UserCardMetaValue>
                          </UserCardMetaRow>
                        </UserCardMeta>
                        <UserCardActions>
                          <SmallDangerButton onClick={() => handleForceLogout(user.userId)}>Force Logout</SmallDangerButton>
                          <SmallWarningButton onClick={() => handleBlockUser(user.userId, user.username)}>Block</SmallWarningButton>
                        </UserCardActions>
                      </UserCard>
                    );
                  })}
                </MobileCardList>
              </>
            )}

            <SectionTitle style={{ marginTop: '2rem' }}>
              All Registered Users ({users.length})
            </SectionTitle>
            <ResponsiveTableWrapper>
              <Table>
                <thead><tr><Th>User ID</Th><Th>Username</Th></tr></thead>
                <tbody>
                  {sortedUsers.map(user => (
                    <tr key={user.userId}>
                      <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                      <Td>{user.username}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </ResponsiveTableWrapper>
            <MobileCardList>
              {sortedUsers.map(user => (
                <UserCard key={user.userId}>
                  <UserCardHeader>
                    <strong style={{ fontSize: '1rem' }}>{user.username}</strong>
                  </UserCardHeader>
                  <UserCardMeta>
                    <UserCardMetaRow>
                      <UserCardMetaLabel>User ID</UserCardMetaLabel>
                      <UserCardMetaValue style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>{user.userId}</UserCardMetaValue>
                    </UserCardMetaRow>
                  </UserCardMeta>
                </UserCard>
              ))}
            </MobileCardList>
          </ScrollContainer>
        )}

        {/* ===== ACCESS LINKS ===== */}
        {activeTab === 'access' && (
          <ScrollContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Temporary Access Links</h2>
              <Button onClick={handleCreateTempLink} disabled={creatingLink}>
                {creatingLink ? '⏳ Creating...' : '+ Generate New Link'}
              </Button>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Generate secure temporary links for password-free access. Links expire in 5 minutes.
            </p>

            {tempLinks.length === 0 ? (
              <EmptyState>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>No links created yet</span>
                <span style={{ fontSize: '0.8rem' }}>Click "Generate New Link" to create one</span>
              </EmptyState>
            ) : (
              tempLinks.map(link => {
                const { status, label } = getLinkStatus(link);
                const badgeColor = status === 'active' ? 'green' : status === 'revoked' ? 'red' : 'gray';
                const dotColor = badgeColor === 'green' ? 'green' : badgeColor === 'red' ? 'red' : 'gray';
                return (
                  <LinkCard key={link._id} $variant={status === 'active' ? 'success' : undefined}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <Badge $color={badgeColor}><StatusDot $color={dotColor} />{label}</Badge>
                        {status === 'active' && (
                          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>⏱ {getTimeRemaining(link.expiresAt)} remaining</span>
                        )}
                      </div>
                      <LinkUrlBox>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {window.location.origin}/join/{link.token.substring(0, 12)}...
                        </span>
                        {status === 'active' && (
                          <CopyButton onClick={() => handleCopyLink(link.token, link._id)}>
                            {copiedLinkId === link._id ? '✓ Copied!' : 'Copy'}
                          </CopyButton>
                        )}
                      </LinkUrlBox>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                        Created: {formatDateTime(link.createdAt)}
                        {link.revokedAt && ` · Revoked: ${formatDateTime(link.revokedAt)}`}
                      </div>
                      {link.usedBy && link.usedBy.length > 0 && (
                        <UsedByList>
                          Used by: {link.usedBy.map((u, i) => (
                            <Badge key={i} $color="blue" style={{ marginLeft: '0.3rem' }}>
                              {u.username} ({formatTime(u.joinedAt)})
                            </Badge>
                          ))}
                        </UsedByList>
                      )}
                    </div>
                    {status === 'active' && (
                      <SmallDangerButton onClick={() => handleRevokeTempLink(link._id)}>Revoke</SmallDangerButton>
                    )}
                  </LinkCard>
                );
              })
            )}
          </ScrollContainer>
        )}

        {/* ===== SECURITY ===== */}
        {activeTab === 'security' && (
          <ScrollContainer>
            {/* Login Lockdown */}
            <SectionTitle>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Login Lockdown
            </SectionTitle>
            <Card $variant={lockdownStatus.isActive ? 'danger' : 'default'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <Badge $color={lockdownStatus.isActive ? 'red' : 'green'}>
                  <StatusDot $color={lockdownStatus.isActive ? 'red' : 'green'} />
                  {lockdownStatus.isActive ? 'LOCKDOWN ACTIVE' : 'No Lockdown'}
                </Badge>
                {lockdownStatus.isActive && lockdownStatus.endTime && (
                  <span style={{ fontSize: '0.85rem', color: '#991b1b' }}>Until: {formatDateTime(lockdownStatus.endTime)}</span>
                )}
                {lockdownStatus.isActive && !lockdownStatus.endTime && (
                  <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 600 }}>Indefinite</span>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                When active, no new users can log in. Logged-in users can reconnect. Temp links still work.
              </p>
              {lockdownStatus.isActive ? (
                <SuccessButton onClick={handleRemoveLockdown}>🔓 Disable Lockdown</SuccessButton>
              ) : (
                <LockdownPanel>
                  {['1hr', '6hr', '12hr', '1day', '3days'].map(t => (
                    <LockdownOption key={t} onClick={() => handleSetLockdown(t)}>
                      {t === '1hr' ? '1 Hour' : t === '6hr' ? '6 Hours' : t === '12hr' ? '12 Hours' : t === '1day' ? '1 Day' : '3 Days'}
                    </LockdownOption>
                  ))}
                  <LockdownOption onClick={() => handleSetLockdown('indefinite')}>Until I Allow</LockdownOption>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CustomTimeInput type="number" placeholder="Minutes" value={customLockdownMinutes} onChange={e => setCustomLockdownMinutes(e.target.value)} min="1" />
                    <LockdownOption onClick={() => handleSetLockdown('custom')}>Custom</LockdownOption>
                  </div>
                </LockdownPanel>
              )}
            </Card>

            {/* Blocked Users */}
            <SectionTitle style={{ marginTop: '2rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Blocked Users ({blockedUsers.filter(u => u.isBlocked).length})
            </SectionTitle>
            {blockedUsers.filter(u => u.isBlocked).length === 0 ? (
              <EmptyState><span>No blocked users</span></EmptyState>
            ) : (
              <Table>
                <thead><tr><Th>Username</Th><Th>User ID</Th><Th>Blocked At</Th><Th>Reason</Th><Th>Known IPs</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {blockedUsers.filter(u => u.isBlocked).map(user => (
                    <tr key={user._id}>
                      <Td><strong>{user.username}</strong></Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{user.userId}</Td>
                      <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                      <Td style={{ fontSize: '0.85rem' }}>{user.reason || '—'}</Td>
                      <Td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{user.fingerprints?.ips?.length > 0 ? user.fingerprints.ips.join(', ') : '—'}</Td>
                      <Td><SmallSuccessButton onClick={() => handleUnblockUser(user.userId)}>Unblock</SmallSuccessButton></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            {/* Block History */}
            {blockedUsers.filter(u => !u.isBlocked).length > 0 && (
              <>
                <SectionTitle style={{ marginTop: '2rem' }}>Block History</SectionTitle>
                <Table>
                  <thead><tr><Th>Username</Th><Th>Blocked At</Th><Th>Unblocked At</Th><Th>Reason</Th></tr></thead>
                  <tbody>
                    {blockedUsers.filter(u => !u.isBlocked).map(user => (
                      <tr key={user._id}>
                        <Td>{user.username}</Td>
                        <Td style={{ fontSize: '0.85rem' }}>{formatDateTime(user.blockedAt)}</Td>
                        <Td style={{ fontSize: '0.85rem' }}>{user.unblockedAt ? formatDateTime(user.unblockedAt) : '—'}</Td>
                        <Td>{user.reason || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}

            {/* Audit Logs */}
            <SectionTitle style={{ marginTop: '2rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Audit Logs
            </SectionTitle>
            {auditLogs.length === 0 ? (
              <EmptyState><span>No audit logs yet</span></EmptyState>
            ) : (
              auditLogs.map(log => (
                <AuditLogEntry key={log._id} $type={log.type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong>{auditTypeLabel(log.type)}</strong>
                      <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {log.details?.userId && <span>User: {log.details.username || log.details.userId} </span>}
                        {log.details?.reason && <span>· Reason: {log.details.reason} </span>}
                        {log.details?.token && <span>· Token: {log.details.token} </span>}
                        {log.details?.type && log.type.includes('lockdown') && <span>· Duration: {log.details.type} </span>}
                        {log.ip && <span>· IP: {log.ip} </span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.timestamp)}
                    </span>
                  </div>
                </AuditLogEntry>
              ))
            )}
          </ScrollContainer>
        )}

        {/* ===== LIVE ACTIVITY ===== */}
        {activeTab === 'activity' && (
          <>
            <h2>Real-Time Activity</h2>
            <ActivityLogContainer ref={activityLogRef}>
              {activityLogs.map((log, index) => (
                <ActivityLogItem key={index}>{log}</ActivityLogItem>
              ))}
            </ActivityLogContainer>
          </>
        )}

        {/* ===== SERVER LOGS ===== */}
        {activeTab === 'logs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Server Logs</h2>
              <Button onClick={handleRefreshServerLogs}>Refresh</Button>
            </div>
            {isLoading ? <p>Loading server logs...</p> : (
              <LogViewerContainer>
                {serverLogs.map((log, index) => <div key={index}>{formatServerLogLine(log)}</div>)}
              </LogViewerContainer>
            )}
          </>
        )}
      </TabContent>
    </AdminContainer>
  );
};

export default Admin;
