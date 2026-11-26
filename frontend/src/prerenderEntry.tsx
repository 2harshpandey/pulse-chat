import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { ServerStyleSheet } from 'styled-components';
import Home from './Home';
import Rooms from './Rooms';
import AboutDeveloper from './AboutDeveloper';
import { ThemeProvider } from './ThemeContext';
import { UserProvider } from './UserContext';
import { GlobalStyle } from './chat/ChatStyledComponents';
import { getPublicSeoConfig, RouteSeoConfig } from './seo';

export type PrerenderRouteKey = 'home' | 'rooms' | 'about';

export interface PrerenderResult {
  appHtml: string;
  styleTags: string;
  seo: RouteSeoConfig;
}

const ROUTE_LOCATION: Record<PrerenderRouteKey, string> = {
  home: '/',
  rooms: '/room',
  about: '/about-developer',
};

export function renderPublicRoute(routeKey: PrerenderRouteKey): PrerenderResult {
  const sheet = new ServerStyleSheet();
  const seo = getPublicSeoConfig(routeKey);
  const location = ROUTE_LOCATION[routeKey];

  let pageElement: React.ReactElement;
  if (routeKey === 'home') {
    pageElement = <Home />;
  } else if (routeKey === 'rooms') {
    pageElement = <Rooms />;
  } else {
    pageElement = <AboutDeveloper />;
  }

  try {
    const appHtml = renderToString(
      sheet.collectStyles(
        <StaticRouter location={location}>
          <ThemeProvider>
            <UserProvider>
              <GlobalStyle />
              {pageElement}
            </UserProvider>
          </ThemeProvider>
        </StaticRouter>
      )
    );
    const styleTags = sheet.getStyleTags();
    return { appHtml, styleTags, seo };
  } finally {
    sheet.seal();
  }
}
