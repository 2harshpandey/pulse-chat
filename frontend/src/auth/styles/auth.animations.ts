import { keyframes } from 'styled-components';

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
`;

export const float1 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(40px, -60px) scale(1.1); }
  50%  { transform: translate(-20px, 40px) scale(0.95); }
  75%  { transform: translate(30px, 20px) scale(1.05); }
`;

export const float2 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(-50px, 30px) scale(1.05); }
  50%  { transform: translate(30px, -40px) scale(0.9); }
  75%  { transform: translate(-20px, -20px) scale(1.1); }
`;

export const float3 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(20px, 50px) scale(0.95); }
  50%  { transform: translate(-40px, -30px) scale(1.1); }
  75%  { transform: translate(30px, -20px) scale(1); }
`;

export const drawLine = keyframes`
  from { stroke-dashoffset: 180; }
  to   { stroke-dashoffset: 0; }
`;

export const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.35); }
  50%      { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
`;

export const shimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
