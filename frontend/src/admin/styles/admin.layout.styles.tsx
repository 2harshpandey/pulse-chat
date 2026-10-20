import styled from 'styled-components';
import { slideUp, fadeIn } from './admin.animations';

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
