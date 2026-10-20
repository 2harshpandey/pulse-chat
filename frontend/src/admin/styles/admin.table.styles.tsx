import styled from 'styled-components';
import { slideUp, cardEntrance } from './admin.animations';

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
  min-width: 250px;
  max-width: 0;
  word-break: break-word;
`;

// Table variant with min-width for horizontal-scroll tables (audit log)
export const WideTable = styled(Table)`
  min-width: 700px;
`;

export const MessageLogTable = styled(WideTable)`
  margin-top: 0;
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
