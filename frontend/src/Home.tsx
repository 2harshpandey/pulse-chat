import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useHomeController } from './home/hooks';
import { HOME_PAGE_TITLE, useDocumentTitle } from './pageTitle';
import { HOME_FAQS, REPO_URL, getPublicSeoConfig, useRouteSeo } from './seo';
import {
  GlobalHomeStyle,
  HeroContainer,
  Orb,
  TopNav,
  Logo,
  NavActions,
  ThemeToggle,
  NavIconButton,
  ContentWrapper,
  Title,
  Description,
  ButtonGroup,
  PrimaryButton,
  SecondaryButton,
  InfoSection,
  SectionHeader,
  HighlightsGrid,
  HighlightCard,
  FaqList,
  FaqItem,
  HomeFooter,
} from './home/HomeStyledComponents';
import { AdminLoginModal, FeaturesSection } from './home/components';

const Home: React.FC = () => {
  const {
    navigate,
    isDark,
    toggleTheme,
    isAdminModalOpen,
    setIsAdminModalOpen,
    adminRoomId,
    setAdminRoomId,
    adminPassword,
    setAdminPassword,
    isPasswordVisible,
    setIsPasswordVisible,
    adminError,
    setAdminError,
    isAdminLoading,
    adminPasswordInputRef,
    handleAdminSubmit
  } = useHomeController();

  const homeSeo = useMemo(() => getPublicSeoConfig('home'), []);
  useDocumentTitle(HOME_PAGE_TITLE);
  useRouteSeo(homeSeo);

  return (
    <>
      <GlobalHomeStyle />
      <HeroContainer>
        <Orb $color="var(--orb-primary)" $size="450px" $top="5%" $left="-5%" />
        <Orb $color="var(--orb-secondary)" $size="500px" $top="45%" $left="60%" />
        <Orb $color="var(--orb-accent)" $size="380px" $top="75%" $left="10%" />

        <TopNav aria-label="Primary navigation">
          <Logo
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Go to PulseChat Home"
          >
            PulseChat
          </Logo>
          <NavActions>
            <ThemeToggle type="button" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </ThemeToggle>
            <NavIconButton
              as="a"
              href="/about-developer"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                navigate('/about-developer');
              }}
              title="About the PulseChat Developer"
              aria-label="About Developer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </NavIconButton>
            <NavIconButton
              as="a"
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="PulseChat GitHub Repository"
              aria-label="GitHub Repository"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" /></svg>
            </NavIconButton>
          </NavActions>
        </TopNav>

        <ContentWrapper>
          <Title>
            Connect without limits.<br />
            <span>Chat on PulseChat.</span>
          </Title>
          <Description>
            PulseChat is a real-time multi-room web chat platform built for privacy without signups. Join global channels, create password-protected private rooms, share mosaic media albums, and send voice messages in an installable PWA.
          </Description>

          <ButtonGroup>
            <PrimaryButton
              as="a"
              href="/room/global"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                navigate('/room/global');
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Join Global Chat
            </PrimaryButton>
            <SecondaryButton
              as="a"
              href="/room"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                navigate('/room');
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Browse Rooms
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => setIsAdminModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Admin Panel
            </SecondaryButton>
          </ButtonGroup>

          <FeaturesSection />

          <InfoSection aria-labelledby="capabilities-heading">
            <SectionHeader>
              <h2 id="capabilities-heading">Why Choose PulseChat for Instant Rooms</h2>
              <p>
                Designed for fast browser conversations without email verification, phone numbers, or cluttered onboarding.
              </p>
            </SectionHeader>
            <HighlightsGrid>
              <HighlightCard>
                <h3>Side Media Gallery &amp; ZIP Export</h3>
                <p>
                  Browse shared Photos, Videos, Docs, and Links in a dedicated side panel, inspect images with pinch-and-drag zoom, or export mosaic albums in one ZIP download.
                </p>
              </HighlightCard>
              <HighlightCard>
                <h3>Temporary Links &amp; Room Admin</h3>
                <p>
                  Room creators manage custom aliases, room lockdown controls, user moderation, and time-limited invite links for effortless guest access.
                </p>
              </HighlightCard>
              <HighlightCard>
                <h3>Multi-Device PWA Experience</h3>
                <p>
                  Keep up to five concurrent sessions synchronized across desktop and mobile browsers, complete with instant reconnection and light/dark theme parity.
                </p>
              </HighlightCard>
            </HighlightsGrid>
          </InfoSection>

          <InfoSection aria-labelledby="faq-heading">
            <SectionHeader>
              <h2 id="faq-heading">Frequently Asked Questions</h2>
              <p>Quick answers about how PulseChat rooms, privacy, and media sharing work.</p>
            </SectionHeader>
            <FaqList>
              {HOME_FAQS.map((faq) => (
                <FaqItem key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </FaqItem>
              ))}
            </FaqList>
          </InfoSection>
        </ContentWrapper>

        <HomeFooter>
          <span>PulseChat — Real-Time Multi-Room Web Chat</span>
          <nav aria-label="Footer navigation">
            <Link to="/room">Explore Public Rooms</Link>
            <Link to="/room/global">Global Chat</Link>
            <Link to="/about-developer">About Developer</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </HomeFooter>
      </HeroContainer>

      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSubmit={handleAdminSubmit}
        adminRoomId={adminRoomId}
        setAdminRoomId={setAdminRoomId}
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        isPasswordVisible={isPasswordVisible}
        setIsPasswordVisible={setIsPasswordVisible}
        adminError={adminError}
        setAdminError={setAdminError}
        isLoading={isAdminLoading}
        passwordInputRef={adminPasswordInputRef}
      />
    </>
  );
};

export default Home;
