import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { developerData } from './developerData';

const SITE_URL = 'https://pulsechat.tech';
const ABOUT_PATH = '/about-developer';
const ABOUT_URL = `${SITE_URL}${ABOUT_PATH}`;
const REPO_URL = 'https://github.com/2harshpandey/pulse-chat';
const PAGE_TITLE = 'Harsh - Creator and Lead Architect of Pulse Chat';
const PAGE_DESCRIPTION = 'Meet Harsh, the creator and lead architect of Pulse Chat: a visionary student developer building resilient, low-latency real-time messaging software with privacy-aware architecture.';

const floatIn = keyframes`
  from { opacity: 0; transform: translateY(28px); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
`;

const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.38; }
  50% { transform: translate3d(18px, -22px, 0) scale(1.08); opacity: 0.58; }
`;

const sheen = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const PageShell = styled.main`
  min-height: 100dvh;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 16% 12%, rgba(59, 130, 246, 0.24), transparent 34rem),
    radial-gradient(circle at 84% 8%, rgba(129, 140, 248, 0.2), transparent 30rem),
    linear-gradient(135deg, var(--bg-primary), var(--bg-secondary));
  color: var(--text-primary);
  position: relative;
  padding: 2rem;

  @media (max-width: 640px) {
    padding: 1rem;
  }
`;

const AmbientOrb = styled.div<{ $top: string; $left: string; $size: number; $color: string; $delay?: string }>`
  position: fixed;
  top: ${p => p.$top};
  left: ${p => p.$left};
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 999px;
  background: ${p => p.$color};
  filter: blur(90px);
  pointer-events: none;
  animation: ${drift} 9s ease-in-out infinite;
  animation-delay: ${p => p.$delay || '0s'};
  z-index: 0;
`;

const Content = styled.article`
  width: min(1120px, 100%);
  margin: 0 auto;
  position: relative;
  z-index: 1;
  animation: ${floatIn} 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;
`;

const Nav = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: clamp(2rem, 5vw, 4rem);

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const BrandLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--text-heading);
  text-decoration: none;
  font-weight: 900;
  letter-spacing: -0.04em;
  font-size: 1.05rem;

  img {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
`;

const RepoLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid var(--border-primary);
  background: rgba(255, 255, 255, 0.45);
  color: var(--text-heading);
  text-decoration: none;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;

  [data-theme='dark'] & {
    background: rgba(15, 23, 42, 0.45);
  }

  &:hover {
    transform: translateY(-3px);
    border-color: var(--accent-blue);
    box-shadow: 0 16px 34px rgba(59, 130, 246, 0.2);
  }

  svg { width: 18px; height: 18px; }
`;

const Hero = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(300px, 0.88fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: stretch;
  margin-bottom: clamp(1.5rem, 4vw, 3rem);

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.section`
  padding: clamp(2rem, 5vw, 4rem);
  border: 1px solid var(--border-primary);
  border-radius: 34px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.44));
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(22px);

  [data-theme='dark'] & {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.78), rgba(15, 23, 42, 0.52));
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
  }
`;

const Eyebrow = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1.15rem;
  color: var(--accent-indigo);
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  color: var(--text-heading);
  font-size: clamp(3rem, 8vw, 6.8rem);
  line-height: 0.92;
  letter-spacing: -0.08em;

  span {
    display: inline-block;
    background: linear-gradient(120deg, var(--accent-blue), var(--accent-indigo), #ec4899, var(--accent-blue));
    background-size: 260% 260%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: ${sheen} 7s ease infinite;
  }
`;

const Subtitle = styled.p`
  margin: 1.5rem 0 0;
  color: var(--text-secondary);
  font-size: clamp(1.05rem, 2vw, 1.28rem);
  line-height: 1.8;
  max-width: 68ch;
`;

const IdentityGrid = styled.aside`
  display: grid;
  gap: 1rem;
`;

const IdentityCard = styled.section`
  border: 1px solid var(--border-primary);
  border-radius: 28px;
  padding: 1.35rem;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: var(--shadow-md);
  animation: ${floatIn} 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;

  [data-theme='dark'] & {
    background: rgba(30, 41, 59, 0.62);
  }

  &:nth-child(2) { animation-delay: 0.08s; }
  &:nth-child(3) { animation-delay: 0.16s; }

  strong {
    display: block;
    color: var(--text-heading);
    font-size: 1.1rem;
    margin-bottom: 0.4rem;
  }

  p {
    color: var(--text-tertiary);
    line-height: 1.65;
    margin: 0;
  }
`;

const SectionGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.25rem;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  border: 1px solid var(--border-primary);
  border-radius: 28px;
  padding: clamp(1.35rem, 3vw, 2rem);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
  animation: ${floatIn} 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;

  h2 {
    color: var(--text-heading);
    font-size: clamp(1.35rem, 3vw, 2rem);
    letter-spacing: -0.04em;
    margin: 0 0 1rem;
  }

  p, li {
    color: var(--text-secondary);
    line-height: 1.72;
  }

  p { margin: 0; }

  ul {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    padding-left: 1.35rem;
  }

  li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.72em;
    width: 0.48rem;
    height: 0.48rem;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.1);
  }
`;

const FullWidthPanel = styled(Panel)`
  margin-bottom: 1.25rem;
`;

const Footer = styled.footer`
  display: flex;
  justify-content: center;
  padding: 2rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.9rem;
`;

const setMetaTag = (selector: string, attribute: 'content' | 'href', value: string) => {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
  if (!element) {
    if (selector.startsWith('link')) {
      element = document.createElement('link');
      const rel = selector.match(/rel="([^"]+)"/)?.[1];
      if (rel) element.setAttribute('rel', rel);
    } else {
      element = document.createElement('meta');
      const name = selector.match(/name="([^"]+)"/)?.[1];
      const property = selector.match(/property="([^"]+)"/)?.[1];
      if (name) element.setAttribute('name', name);
      if (property) element.setAttribute('property', property);
    }
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
};

const AboutDeveloper: React.FC = () => {
  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: developerData.name,
    alternateName: 'Harsh, creator of Pulse Chat',
    url: ABOUT_URL,
    sameAs: [REPO_URL, SITE_URL],
    jobTitle: 'Creator and Lead Architect of Pulse Chat',
    description: developerData.bio,
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: 'Motilal Nehru College, University of Delhi'
    },
    knowsAbout: [
      'Pulse Chat',
      'real-time messaging architecture',
      'WebSocket systems',
      'backend engineering',
      'privacy-aware software design',
      'latency optimization',
      ...developerData.technicalFocus,
      ...developerData.analyticalMindset
    ],
    creator: {
      '@type': 'SoftwareApplication',
      name: 'Pulse Chat',
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description: 'A production-grade real-time scalable web messaging application.',
      creator: {
        '@type': 'Person',
        name: developerData.name,
        jobTitle: 'Creator and Lead Architect'
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': ABOUT_URL
    }
  }), []);

  useEffect(() => {
    const previousTitle = document.title;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'pulse-developer-person-schema';
    script.text = JSON.stringify(jsonLd);

    document.title = PAGE_TITLE;
    setMetaTag('meta[name="description"]', 'content', PAGE_DESCRIPTION);
    setMetaTag('meta[name="robots"]', 'content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    setMetaTag('link[rel="canonical"]', 'href', ABOUT_URL);
    setMetaTag('meta[property="og:type"]', 'content', 'profile');
    setMetaTag('meta[property="og:title"]', 'content', PAGE_TITLE);
    setMetaTag('meta[property="og:description"]', 'content', PAGE_DESCRIPTION);
    setMetaTag('meta[property="og:url"]', 'content', ABOUT_URL);
    setMetaTag('meta[property="og:site_name"]', 'content', 'Pulse Chat');
    setMetaTag('meta[property="og:image"]', 'content', `${SITE_URL}/pulse_logo.webp`);
    setMetaTag('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setMetaTag('meta[name="twitter:title"]', 'content', PAGE_TITLE);
    setMetaTag('meta[name="twitter:description"]', 'content', PAGE_DESCRIPTION);
    setMetaTag('meta[name="twitter:image"]', 'content', `${SITE_URL}/pulse_logo.webp`);

    const existing = document.getElementById(script.id);
    existing?.remove();
    document.head.appendChild(script);

    return () => {
      document.title = previousTitle;
      script.remove();
    };
  }, [jsonLd]);

  return (
    <PageShell>
      <AmbientOrb $top="4%" $left="-8%" $size={420} $color="rgba(59, 130, 246, 0.22)" />
      <AmbientOrb $top="34%" $left="78%" $size={360} $color="rgba(236, 72, 153, 0.16)" $delay="-3s" />
      <Content itemScope itemType="https://schema.org/Person">
        <Nav aria-label="About developer navigation">
          <BrandLink to="/" aria-label="Return to Pulse Chat login">
            <img src="/pulse_logo.webp" alt="Pulse Chat logo" />
            Pulse Chat
          </BrandLink>
          <RepoLink href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Pulse Chat GitHub repository">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" /></svg>
            GitHub Repo
          </RepoLink>
        </Nav>

        <Hero>
          <HeroCopy as="header">
            <Eyebrow>Creator - Lead Architect - Pulse Chat</Eyebrow>
            <Title itemProp="name"><span>{developerData.name}</span></Title>
            <Subtitle itemProp="description">{developerData.bio}</Subtitle>
          </HeroCopy>

          <IdentityGrid aria-label="Developer identity">
            {developerData.identity.map((identity, index) => (
              <IdentityCard key={identity}>
                <strong>{identity}</strong>
                <p>{index === 0 ? 'Interdisciplinary mastery translated into practical engineering decisions.' : index === 1 ? 'A student builder shaping Pulse Chat through disciplined systems thinking.' : 'Technical architecture informed by literature, psychology, physics, and sociology.'}</p>
              </IdentityCard>
            ))}
          </IdentityGrid>
        </Hero>

        <SectionGrid>
          <Panel>
            <h2>Analytical Mindset</h2>
            <ul>
              {developerData.analyticalMindset.map(item => <li key={item}>{item}</li>)}
            </ul>
          </Panel>

          <Panel>
            <h2>Technical Focus</h2>
            <ul>
              {developerData.technicalFocus.map(item => <li key={item}>{item}</li>)}
            </ul>
          </Panel>
        </SectionGrid>

        <FullWidthPanel>
          <h2>Philosophical Foundation</h2>
          <p>{developerData.philosophicalFoundation}</p>
        </FullWidthPanel>

        <SectionGrid>
          <Panel>
            <h2>Creative Influences</h2>
            <ul>
              {developerData.creativeInfluences.map(item => <li key={item}>{item}</li>)}
            </ul>
          </Panel>

          <Panel>
            <h2>Education</h2>
            <p itemProp="alumniOf">{developerData.education}</p>
          </Panel>
        </SectionGrid>

        <Footer>
          <p>Harsh is explicitly linked as creator and lead architect of Pulse Chat.</p>
        </Footer>
      </Content>
    </PageShell>
  );
};

export default AboutDeveloper;
