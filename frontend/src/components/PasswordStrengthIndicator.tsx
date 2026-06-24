import React from 'react';
import styled from 'styled-components';

export const StrengthMeterContainer = styled.div`
  margin-top: 0.75rem;
`;

export const BarsContainer = styled.div`
  display: flex;
  gap: 0.4rem;
  height: 6px;
  margin-bottom: 0.5rem;
`;

export const StrengthBar = styled.div<{ $active: boolean; $color: string }>`
  flex: 1;
  border-radius: 4px;
  background: ${p => p.$active ? p.$color : 'rgba(255, 255, 255, 0.1)'};
  transition: all 0.3s ease;
`;

export const StrengthText = styled.div<{ $color: string }>`
  font-size: 0.85rem;
  font-weight: 500;
  text-align: center;
  color: ${p => p.$color || '#94a3b8'};
  transition: color 0.3s ease;
`;

export const getPasswordStrength = (password: string) => {
  if (!password) return { score: 0, text: '', color: '' };
  if (password.length < 6) return { score: 1, text: 'Password is too short (min 6 chars)', color: '#ef4444' }; // Red
  let score = 1;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score: 2, text: 'Weak', color: '#ef4444' }; // Red
  if (score === 3) return { score: 3, text: 'Medium', color: '#f59e0b' }; // Orange
  if (score === 4) return { score: 4, text: 'Good', color: '#84cc16' }; // Yellow-Green
  return { score: 5, text: 'Strong', color: '#22c55e' }; // Green
};

export const PasswordStrengthIndicator: React.FC<{ password: string }> = ({ password }) => {
  const { score, text, color } = getPasswordStrength(password);
  if (!password) return null;
  return (
    <StrengthMeterContainer>
      <BarsContainer>
        <StrengthBar $active={score >= 1} $color={score === 1 ? '#ef4444' : color} />
        <StrengthBar $active={score >= 3} $color={color} />
        <StrengthBar $active={score >= 4} $color={color} />
        <StrengthBar $active={score >= 5} $color={color} />
      </BarsContainer>
      <StrengthText $color={color}>{text}</StrengthText>
    </StrengthMeterContainer>
  );
};
