import { useEffect } from 'react';
import { developerData } from './developerData';
import { HOME_PAGE_TITLE } from './pageTitle';

export const SITE_URL = 'https://pulsechat.tech';
export const BRAND_NAME = 'PulseChat';
export const REPO_URL = 'https://github.com/2harshpandey/pulse-chat';
export const AUTHOR_GITHUB_URL = 'https://github.com/2harshpandey';
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
export const LOGO_IMAGE_URL = `${SITE_URL}/android-chrome-512x512.png`;

export const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const NOINDEX_ROBOTS = 'noindex, nofollow';

export interface FaqEntry {
  question: string;
  answer: string;
}

export const HOME_FAQS: FaqEntry[] = [
  {
    question: 'Do I need an account, email, or phone number to use PulseChat?',
    answer:
      'No signup, email address, or phone number is required. Pick a username to join Global Chat immediately, browse public rooms, or enter a password-protected private room.',
  },
  {
    question: 'How do private rooms and temporary invite links work in PulseChat?',
    answer:
      'You can create custom chat rooms with an optional join password, or generate temporary /join invite links from the room admin panel so guests can enter without sharing the room password.',
  },
  {
    question: 'What messaging and media features are built into PulseChat?',
    answer:
      'PulseChat includes native WebSocket real-time messaging, voice notes with interactive 36-bar acoustic waveforms, mosaic photo and video albums with ZIP batch downloads, document sharing, GIF search, link previews, emoji reactions, and threaded replies.',
  },
  {
    question: 'How is PulseChat at pulsechat.tech distinct from other apps?',
    answer:
      'PulseChat (pulsechat.tech) is an open-source React, TypeScript, and Node.js WebSocket Progressive Web App built by Harsh Pandey, combining multi-room isolation, a side-panel media gallery, and defense-in-depth security in the browser.',
  },
  {
    question: 'Can I install PulseChat on mobile or desktop?',
    answer:
      'Yes. PulseChat is an installable Progressive Web App (PWA) with full dark and light mode parity across Chrome, Edge, Safari, Android, and iOS.',
  },
];

export interface RouteSeoConfig {
  title: string;
  description: string;
  canonicalUrl?: string;
  robots: string;
  ogType: 'website' | 'profile';
  ogUrl: string;
  ogImageAlt: string;
  jsonLd?: Record<string, unknown>;
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const WEBAPP_ID = `${SITE_URL}/#webapp`;
const PERSON_ID = `${SITE_URL}/about-developer#person`;

function getBaseGraphNodes(): Record<string, unknown>[] {
  return [
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      logo: {
        '@type': 'ImageObject',
        url: LOGO_IMAGE_URL,
        width: 512,
        height: 512,
      },
      founder: { '@id': PERSON_ID },
      sameAs: [REPO_URL, AUTHOR_GITHUB_URL],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: BRAND_NAME,
      alternateName: 'PulseChat Web App',
      url: `${SITE_URL}/`,
      publisher: { '@id': ORGANIZATION_ID },
      inLanguage: 'en',
    },
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
      '@id': WEBAPP_ID,
      name: BRAND_NAME,
      alternateName: 'PulseChat Multi-Room Web Chat',
      url: `${SITE_URL}/`,
      description:
        'Signup-free, real-time multi-room web chat platform with password-protected private rooms, voice messaging, mosaic media albums, side-panel media gallery, and installable PWA support.',
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Web, Android, iOS, Windows, macOS, Linux',
      browserRequirements: 'Requires JavaScript and WebSocket support',
      isAccessibleForFree: true,
      author: { '@id': PERSON_ID },
      publisher: { '@id': ORGANIZATION_ID },
      sameAs: [REPO_URL],
      featureList: [
        'Real-time bidirectional messaging over native WebSockets',
        'Signup-free joining without phone numbers or emails',
        'Public chat lounges and password-protected private rooms',
        'Temporary single-link room invites (/join/:token)',
        'Voice messaging with 36-bar interactive acoustic waveforms',
        'Dynamic mosaic photo and video albums with fullscreen zoom lightbox and ZIP export',
        'Side-panel media gallery filtered by Photos, Videos, Docs, and Links',
        'Threaded replies, emoji reactions, inline message editing, and read receipts',
        'Installable Progressive Web App (PWA) with dark and light themes',
      ],
    },
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: 'Harsh Pandey',
      alternateName: developerData.name,
      url: `${SITE_URL}/about-developer`,
      sameAs: [AUTHOR_GITHUB_URL, REPO_URL, `${SITE_URL}/`],
      jobTitle: 'Creator & Lead Developer of PulseChat',
      description: developerData.bio,
      alumniOf: {
        '@type': 'CollegeOrUniversity',
        name: 'University of Delhi',
      },
      knowsAbout: [
        BRAND_NAME,
        'real-time messaging architecture',
        'WebSocket systems',
        'full-stack TypeScript engineering',
        'privacy-aware software design',
        'latency optimization',
      ],
    },
  ];
}

export function getPublicSeoConfig(routeKey: 'home' | 'rooms' | 'about'): RouteSeoConfig {
  if (routeKey === 'home') {
    const title = HOME_PAGE_TITLE;
    const description =
      'PulseChat is a real-time multi-room web chat app with password-protected rooms, voice notes, mosaic media albums, and instant invite links—no signup.';
    const canonicalUrl = `${SITE_URL}/`;
    return {
      title,
      description,
      canonicalUrl,
      robots: INDEX_ROBOTS,
      ogType: 'website',
      ogUrl: canonicalUrl,
      ogImageAlt: 'PulseChat — Real-Time Multi-Room Web Chat Without Signup',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          ...getBaseGraphNodes(),
          {
            '@type': 'WebPage',
            '@id': `${canonicalUrl}#webpage`,
            url: canonicalUrl,
            name: title,
            description,
            isPartOf: { '@id': WEBSITE_ID },
            about: { '@id': WEBAPP_ID },
            mainEntity: { '@id': WEBAPP_ID },
            inLanguage: 'en',
          },
          {
            '@type': 'FAQPage',
            '@id': `${canonicalUrl}#faq`,
            isPartOf: { '@id': `${canonicalUrl}#webpage` },
            mainEntity: HOME_FAQS.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        ],
      },
    };
  }

  if (routeKey === 'rooms') {
    const title = 'Explore Live Chat Rooms Without Signup | PulseChat';
    const description =
      'Browse live public chat rooms on PulseChat, join Global Chat instantly, or create a password-protected private room with no email or phone signup.';
    const canonicalUrl = `${SITE_URL}/room`;
    return {
      title,
      description,
      canonicalUrl,
      robots: INDEX_ROBOTS,
      ogType: 'website',
      ogUrl: canonicalUrl,
      ogImageAlt: 'Explore Public Chat Rooms on PulseChat',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          ...getBaseGraphNodes(),
          {
            '@type': 'CollectionPage',
            '@id': `${canonicalUrl}#webpage`,
            url: canonicalUrl,
            name: title,
            description,
            isPartOf: { '@id': WEBSITE_ID },
            about: { '@id': WEBAPP_ID },
            inLanguage: 'en',
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${canonicalUrl}#breadcrumb`,
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `${SITE_URL}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Explore Rooms',
                item: canonicalUrl,
              },
            ],
          },
        ],
      },
    };
  }

  const title = 'Harsh — Self-Taught Creator of PulseChat | PulseChat';
  const description =
    'Meet Harsh, the self-taught University of Delhi developer behind PulseChat, a fast real-time WebSocket chat platform built for privacy and speed.';
  const canonicalUrl = `${SITE_URL}/about-developer`;
  return {
    title,
    description,
    canonicalUrl,
    robots: INDEX_ROBOTS,
    ogType: 'profile',
    ogUrl: canonicalUrl,
    ogImageAlt: 'Harsh Pandey — Developer of PulseChat',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        ...getBaseGraphNodes(),
        {
          '@type': 'ProfilePage',
          '@id': `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          isPartOf: { '@id': WEBSITE_ID },
          mainEntity: { '@id': PERSON_ID },
          inLanguage: 'en',
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${canonicalUrl}#breadcrumb`,
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: `${SITE_URL}/`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'About Developer',
              item: canonicalUrl,
            },
          ],
        },
      ],
    },
  };
}

export function normalizePathnameForSeo(pathname: string): string {
  if (!pathname || pathname === '/index.html') return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getSeoConfigForPathname(pathname: string): RouteSeoConfig {
  const normalized = normalizePathnameForSeo(pathname);
  if (normalized === '/') return getPublicSeoConfig('home');
  if (normalized === '/room') return getPublicSeoConfig('rooms');
  if (normalized === '/about-developer') return getPublicSeoConfig('about');

  return {
    title: 'PulseChat',
    description:
      'PulseChat private chat room, session access, or utility screen.',
    robots: NOINDEX_ROBOTS,
    ogType: 'website',
    ogUrl: `${SITE_URL}${normalized}`,
    ogImageAlt: 'PulseChat — Real-Time Multi-Room Web Chat',
  };
}

function setHeadTag(selector: string, attribute: 'content' | 'href', value: string): void {
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
}

const JSONLD_SCRIPT_ID = 'pulsechat-structured-data';

export function useRouteSeo(config: RouteSeoConfig): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    setHeadTag('meta[name="description"]', 'content', config.description);
    setHeadTag('meta[name="robots"]', 'content', config.robots);

    const existingCanonical = document.head.querySelector('link[rel="canonical"]');
    if (config.canonicalUrl) {
      setHeadTag('link[rel="canonical"]', 'href', config.canonicalUrl);
    } else if (existingCanonical) {
      existingCanonical.remove();
    }

    setHeadTag('meta[property="og:type"]', 'content', config.ogType);
    setHeadTag('meta[property="og:site_name"]', 'content', BRAND_NAME);
    setHeadTag('meta[property="og:title"]', 'content', config.title);
    setHeadTag('meta[property="og:description"]', 'content', config.description);
    setHeadTag('meta[property="og:url"]', 'content', config.ogUrl);
    setHeadTag('meta[property="og:image"]', 'content', OG_IMAGE_URL);
    setHeadTag('meta[property="og:image:secure_url"]', 'content', OG_IMAGE_URL);
    setHeadTag('meta[property="og:image:type"]', 'content', 'image/png');
    setHeadTag('meta[property="og:image:width"]', 'content', '1200');
    setHeadTag('meta[property="og:image:height"]', 'content', '630');
    setHeadTag('meta[property="og:image:alt"]', 'content', config.ogImageAlt);

    setHeadTag('meta[name="twitter:card"]', 'content', 'summary_large_image');
    setHeadTag('meta[name="twitter:url"]', 'content', config.ogUrl);
    setHeadTag('meta[name="twitter:title"]', 'content', config.title);
    setHeadTag('meta[name="twitter:description"]', 'content', config.description);
    setHeadTag('meta[name="twitter:image"]', 'content', OG_IMAGE_URL);
    setHeadTag('meta[name="twitter:image:alt"]', 'content', config.ogImageAlt);

    const existingJsonLd = document.getElementById(JSONLD_SCRIPT_ID);
    const legacyDevJsonLd = document.getElementById('pulse-developer-person-schema');
    legacyDevJsonLd?.remove();

    if (config.jsonLd) {
      const script = existingJsonLd || document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.id = JSONLD_SCRIPT_ID;
      script.textContent = JSON.stringify(config.jsonLd);
      if (!existingJsonLd) {
        document.head.appendChild(script);
      }
    } else if (existingJsonLd) {
      existingJsonLd.remove();
    }
  }, [config]);
}

export function useNoIndexRobots(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHeadTag('meta[name="robots"]', 'content', NOINDEX_ROBOTS);
    const existingCanonical = document.head.querySelector('link[rel="canonical"]');
    if (existingCanonical) {
      existingCanonical.remove();
    }
    const existingJsonLd = document.getElementById(JSONLD_SCRIPT_ID);
    if (existingJsonLd) {
      existingJsonLd.remove();
    }
  }, []);
}
