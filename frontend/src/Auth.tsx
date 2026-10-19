import React from 'react';
import { UserProfile } from './UserContext';
import { useAuthController } from './auth/hooks';
import {
  AnimatedBg,
  Orb,
  float1,
  float2,
  float3,
  PageWrapper,
  FormContainer
} from './auth/AuthStyledComponents';
import { AuthCard } from './auth/components';

interface AuthProps {
  onAuthSuccess: (profile: UserProfile) => void;
  tempToken?: string | null;
  roomId?: string;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess, tempToken, roomId = 'me' }) => {
  const controller = useAuthController({ onAuthSuccess, tempToken, roomId });
  const { isDark, routerState, isLoading, autoJoinAttempted } = controller;

  if (routerState?.autoJoin && (isLoading || !autoJoinAttempted)) {
    return (
      <>
        <AnimatedBg>
          <Orb $color="rgba(99,102,241,0.3)"  $darkColor="rgba(99,102,241,0.25)" $size={500} $top="15%" $left="-10%"  $anim={float1} />
          <Orb $color="rgba(59,130,246,0.25)"  $darkColor="rgba(59,130,246,0.2)"  $size={400} $top="65%"  $left="60%"   $anim={float2} />
          <Orb $color="rgba(236,72,153,0.18)"  $darkColor="rgba(236,72,153,0.15)" $size={350} $top="30%"  $left="75%"   $anim={float3} />
        </AnimatedBg>
        <PageWrapper style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: isDark ? '#f1f5f9' : '#1e293b', zIndex: 10 }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontWeight: 600 }}>Joining Room...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </PageWrapper>
      </>
    );
  }

  return (
    <>
      <AnimatedBg>
        <Orb $color="rgba(99,102,241,0.3)"  $darkColor="rgba(99,102,241,0.25)" $size={500} $top="15%" $left="-10%"  $anim={float1} />
        <Orb $color="rgba(59,130,246,0.25)"  $darkColor="rgba(59,130,246,0.2)"  $size={400} $top="65%"  $left="60%"   $anim={float2} />
        <Orb $color="rgba(236,72,153,0.18)"  $darkColor="rgba(236,72,153,0.15)" $size={350} $top="30%"  $left="75%"   $anim={float3} />
      </AnimatedBg>

      <PageWrapper>
        <FormContainer>
          <AuthCard controller={controller} roomId={roomId} />
        </FormContainer>
      </PageWrapper>
    </>
  );
};

export default Auth;
