import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import {
  PageWrapper,
  PulseLogoMini,
  ThemeToggle,
  ContentWrapper,
  IconContainer,
  ErrorCodeContainer,
  ErrorCode,
  OrbitRing,
  OrbitDot,
  Title,
  Description,
  ButtonGroup,
  PrimaryButton,
  SecondaryButton,
  TypewriterText,
  CountdownText
} from './ErrorStyledComponents';
import {
  BackgroundEffects,
  Ghost404,
  Shield403,
  ServerDown500,
  Clock408,
  Lock429,
  Maintenance503
} from './ErrorIcons';

export interface ErrorPageProps {
  code: number;
  title?: string;
  description?: string;
  showHomeButton?: boolean;
  showRefreshButton?: boolean;
  autoRedirectSeconds?: number;
}

export const ERROR_CONFIGS: Record<number, { title: string; description: string; variant: 'blue' | 'red' | 'amber'; icon: React.FC; hasGlitch?: boolean }> = {
  404: {
    title: "Page Not Found",
    description: "Looks like this page drifted away into the void. The link may be broken, or the page may have been removed.",
    variant: 'blue',
    icon: Ghost404,
    hasGlitch: true,
  },
  403: {
    title: "Access Denied",
    description: "You don't have permission to access this page. If you believe this is a mistake, please check your credentials.",
    variant: 'red',
    icon: Shield403,
  },
  500: {
    title: "Internal Server Error",
    description: "Something went wrong on our end. Our servers are having a moment — we're working to fix it.",
    variant: 'red',
    icon: ServerDown500,
  },
  408: {
    title: "Request Timeout",
    description: "The server took too long to respond. Your connection may be slow, or the server is under heavy load.",
    variant: 'blue',
    icon: Clock408,
  },
  429: {
    title: "Too Many Requests",
    description: "You've sent too many requests in a short period. Please wait a moment before trying again.",
    variant: 'amber',
    icon: Lock429,
  },
  503: {
    title: "Service Unavailable",
    description: "Pulse Chat is temporarily undergoing maintenance. We'll be back shortly — hang tight!",
    variant: 'amber',
    icon: Maintenance503,
  },
};

export const ErrorPage: React.FC<ErrorPageProps> = ({
  code,
  title: customTitle,
  description: customDescription,
  showHomeButton = true,
  showRefreshButton = false,
  autoRedirectSeconds,
}) => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [countdown, setCountdown] = useState(autoRedirectSeconds || 0);

  const config = ERROR_CONFIGS[code] || {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again.',
    variant: 'blue' as const,
    icon: Ghost404,
  };

  useEffect(() => {
    document.body.classList.add('hide-global-home-btn');
    return () => document.body.classList.remove('hide-global-home-btn');
  }, []);

  const title = customTitle || config.title;
  const description = customDescription || config.description;
  const IconComponent = config.icon;

  // Auto-redirect countdown
  useEffect(() => {
    if (!autoRedirectSeconds || autoRedirectSeconds <= 0) return;
    setCountdown(autoRedirectSeconds);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRedirectSeconds, navigate]);

  const handleGoHome = useCallback(() => navigate('/'), [navigate]);
  const handleRefresh = useCallback(() => window.location.reload(), []);
  const handleGoBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <PageWrapper>
      <BackgroundEffects variant={config.variant} />

      <PulseLogoMini onClick={handleGoHome}>
        Pulse Chat
      </PulseLogoMini>

      <ThemeToggle onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
        {isDark ? '☀️' : '🌙'}
      </ThemeToggle>

      <ContentWrapper>
        <IconContainer>
          <IconComponent />
        </IconContainer>

        <ErrorCodeContainer>
          <ErrorCode $hasGlitch={config.hasGlitch} data-code={String(code)}>
            {code}
          </ErrorCode>
          <OrbitRing />
          <OrbitDot $color="var(--accent-blue)" $duration={8} />
          <OrbitDot $reverse $color="var(--accent-indigo)" $duration={12} />
        </ErrorCodeContainer>

        <Title>{title}</Title>
        <Description>{description}</Description>

        <ButtonGroup>
          {showHomeButton && (
            <PrimaryButton onClick={handleGoHome}>
              Go to Chat
            </PrimaryButton>
          )}
          {showRefreshButton && (
            <SecondaryButton onClick={handleRefresh}>
              Try Again
            </SecondaryButton>
          )}
          <SecondaryButton onClick={handleGoBack}>
            Go Back
          </SecondaryButton>
        </ButtonGroup>

        {autoRedirectSeconds && countdown > 0 && (
          <TypewriterText>
            Redirecting in <CountdownText>{countdown}</CountdownText>s…
          </TypewriterText>
        )}

        <TypewriterText>
          <code>HTTP {code}</code> · {title}
        </TypewriterText>
      </ContentWrapper>
    </PageWrapper>
  );
};

// Exported page convenience wrappers
export const NotFoundPage: React.FC = () => (
  <ErrorPage code={404} showHomeButton showRefreshButton={false} autoRedirectSeconds={15} />
);

export const ForbiddenPage: React.FC = () => (
  <ErrorPage code={403} showHomeButton showRefreshButton={false} />
);

export const ServerErrorPage: React.FC = () => (
  <ErrorPage code={500} showHomeButton showRefreshButton />
);

export const TimeoutPage: React.FC = () => (
  <ErrorPage code={408} showHomeButton showRefreshButton />
);

export const RateLimitPage: React.FC = () => (
  <ErrorPage code={429} showHomeButton showRefreshButton={false} autoRedirectSeconds={30} />
);

export const MaintenancePage: React.FC = () => (
  <ErrorPage code={503} showHomeButton={false} showRefreshButton autoRedirectSeconds={60} />
);

export const GenericErrorPage: React.FC<ErrorPageProps> = (props) => (
  <ErrorPage {...props} />
);

export default ErrorPage;
