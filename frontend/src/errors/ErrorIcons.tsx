import React, { useMemo } from 'react';
import {
  BackgroundCanvas,
  Orb,
  ScanLineDiv,
  Particle
} from './ErrorStyledComponents';

export const BackgroundEffects: React.FC<{ variant: 'blue' | 'red' | 'amber' }> = ({ variant }) => {
  const colors = useMemo(() => {
    switch (variant) {
      case 'red': return { orb1: '#ef4444', orb2: '#f97316', orb3: '#ec4899' };
      case 'amber': return { orb1: '#f59e0b', orb2: '#f97316', orb3: '#eab308' };
      default: return { orb1: '#3b82f6', orb2: '#8b5cf6', orb3: '#06b6d4' };
    }
  }, [variant]);

  return (
    <BackgroundCanvas>
      <Orb $size={400} $x="10%" $y="20%" $color={colors.orb1} $delay={0} />
      <Orb $size={300} $x="70%" $y="60%" $color={colors.orb2} $delay={2} />
      <Orb $size={250} $x="50%" $y="10%" $color={colors.orb3} $delay={4} />
      <ScanLineDiv />
      {Array.from({ length: 12 }).map((_, i) => (
        <Particle
          key={i}
          $left={`${5 + (i * 8)}%`}
          $delay={i * 0.8}
          $duration={8 + (i % 4) * 2}
          $size={2 + (i % 3)}
        />
      ))}
    </BackgroundCanvas>
  );
};

export const Ghost404: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 10C25.088 10 13 22.088 13 37V62C13 64 15 66 17 64L21 60L25 64C27 66 29 66 31 64L35 60L39 64C41 66 43 66 45 64L49 60L53 64C55 66 57 66 59 64L63 60L67 64C69 66 71 64 71 62V37C71 22.088 58.912 10 44 10H40Z" 
      fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="2"/>
    <circle cx="30" cy="35" r="4" fill="var(--accent-blue)">
      <animate attributeName="cy" values="35;33;35" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="50" cy="35" r="4" fill="var(--accent-blue)">
      <animate attributeName="cy" values="35;33;35" dur="2s" begin="0.3s" repeatCount="indefinite"/>
    </circle>
    <path d="M33 46C33 46 36 50 40 50C44 50 47 46 47 46" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round" fill="none">
      <animate attributeName="d" values="M33 46C33 46 36 50 40 50C44 50 47 46 47 46;M33 47C33 47 36 44 40 44C44 44 47 47 47 47;M33 46C33 46 36 50 40 50C44 50 47 46 47 46" dur="3s" repeatCount="indefinite"/>
    </path>
  </svg>
);

export const Shield403: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 8L12 22V38C12 56 24 72 40 76C56 72 68 56 68 38V22L40 8Z" 
      fill="var(--accent-red)" opacity="0.12" stroke="var(--accent-red)" strokeWidth="2"/>
    <path d="M30 40L36 46L50 32" stroke="none" fill="none"/>
    <line x1="32" y1="32" x2="48" y2="48" stroke="var(--accent-red)" strokeWidth="3" strokeLinecap="round">
      <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
    </line>
    <line x1="48" y1="32" x2="32" y2="48" stroke="var(--accent-red)" strokeWidth="3" strokeLinecap="round">
      <animate attributeName="opacity" values="1;0.5;1" dur="2s" begin="0.5s" repeatCount="indefinite"/>
    </line>
  </svg>
);

export const ServerDown500: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="12" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="20" r="3" fill="var(--accent-green)">
      <animate attributeName="fill" values="var(--accent-green);var(--accent-red);var(--accent-green)" dur="2s" repeatCount="indefinite"/>
    </circle>
    <rect x="15" y="32" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="40" r="3" fill="var(--accent-red)">
      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>
    </circle>
    <rect x="15" y="52" width="50" height="16" rx="4" fill="var(--accent-blue)" opacity="0.15" stroke="var(--accent-blue)" strokeWidth="1.5"/>
    <circle cx="24" cy="60" r="3" fill="var(--accent-red)">
      <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <line x1="55" y1="38" x2="55" y2="42" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="55" y1="58" x2="55" y2="62" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="55" y1="18" x2="55" y2="22" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const Clock408: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="28" fill="var(--accent-blue)" opacity="0.1" stroke="var(--accent-blue)" strokeWidth="2"/>
    <line x1="40" y1="40" x2="40" y2="24" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="8s" repeatCount="indefinite"/>
    </line>
    <line x1="40" y1="40" x2="52" y2="40" stroke="var(--accent-indigo)" strokeWidth="2" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="60s" repeatCount="indefinite"/>
    </line>
    <circle cx="40" cy="40" r="3" fill="var(--accent-blue)"/>
  </svg>
);

export const Lock429: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="22" y="36" width="36" height="28" rx="5" fill="var(--accent-yellow)" opacity="0.15" stroke="var(--accent-yellow)" strokeWidth="2"/>
    <path d="M30 36V28C30 21.373 35.373 16 42 16H38C44.627 16 50 21.373 50 28V36" stroke="var(--accent-yellow)" strokeWidth="2.5" fill="none"/>
    <circle cx="40" cy="48" r="4" fill="var(--accent-yellow)">
      <animate attributeName="r" values="4;5;4" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <line x1="40" y1="52" x2="40" y2="57" stroke="var(--accent-yellow)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const Maintenance503: React.FC = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 14L44 26H56L46 34L50 46L40 38L30 46L34 34L24 26H36L40 14Z" 
      fill="var(--accent-yellow)" opacity="0.15" stroke="var(--accent-yellow)" strokeWidth="1.5"/>
    <circle cx="40" cy="58" r="12" fill="none" stroke="var(--accent-yellow)" strokeWidth="2" strokeDasharray="4 4">
      <animateTransform attributeName="transform" type="rotate" from="0 40 58" to="360 40 58" dur="6s" repeatCount="indefinite"/>
    </circle>
    <circle cx="40" cy="58" r="5" fill="var(--accent-yellow)" opacity="0.3"/>
  </svg>
);
