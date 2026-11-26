import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(FRONTEND_ROOT, 'build');
const SSR_TMP_DIR = path.join(FRONTEND_ROOT, '.ssr-prerender');
const TEMPLATE_PATH = path.join(BUILD_DIR, 'index.html');

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceMetaByName(html, name, content) {
  const escaped = escapeHtmlAttr(content);
  const regex = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*\\/?>`, 'i');
  if (regex.test(html)) {
    return html.replace(regex, `<meta name="${name}" content="${escaped}" />`);
  }
  return html.replace('</head>', `  <meta name="${name}" content="${escaped}" />\n  </head>`);
}

function replaceMetaByProperty(html, property, content) {
  const escaped = escapeHtmlAttr(content);
  const regex = new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]*"\\s*\\/?>`, 'i');
  if (regex.test(html)) {
    return html.replace(regex, `<meta property="${property}" content="${escaped}" />`);
  }
  return html.replace('</head>', `  <meta property="${property}" content="${escaped}" />\n  </head>`);
}

function replaceCanonical(html, canonicalUrl) {
  const regex = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i;
  if (!canonicalUrl) {
    return html.replace(regex, '');
  }
  const escaped = escapeHtmlAttr(canonicalUrl);
  if (regex.test(html)) {
    return html.replace(regex, `<link rel="canonical" href="${escaped}" />`);
  }
  return html.replace('</head>', `  <link rel="canonical" href="${escaped}" />\n  </head>`);
}

function injectRoutePayload(templateHtml, { appHtml, styleTags, seo }) {
  let html = templateHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(seo.title)}</title>`);
  html = replaceMetaByName(html, 'description', seo.description);
  html = replaceMetaByName(html, 'robots', seo.robots);
  html = replaceCanonical(html, seo.canonicalUrl);

  html = replaceMetaByProperty(html, 'og:type', seo.ogType);
  html = replaceMetaByProperty(html, 'og:url', seo.ogUrl);
  html = replaceMetaByProperty(html, 'og:title', seo.title);
  html = replaceMetaByProperty(html, 'og:description', seo.description);
  html = replaceMetaByProperty(html, 'og:image:alt', seo.ogImageAlt);

  html = replaceMetaByName(html, 'twitter:url', seo.ogUrl);
  html = replaceMetaByName(html, 'twitter:title', seo.title);
  html = replaceMetaByName(html, 'twitter:description', seo.description);
  html = replaceMetaByName(html, 'twitter:image:alt', seo.ogImageAlt);

  const jsonLdTag = seo.jsonLd
    ? `<script id="pulsechat-structured-data" type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';

  html = html.replace('</head>', `  ${styleTags}\n  ${jsonLdTag}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

  return html;
}

async function runPrerender() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Missing Vite build output at ${TEMPLATE_PATH}`);
  }

  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  try {
    await build({
      root: FRONTEND_ROOT,
      logLevel: 'error',
      build: {
        ssr: path.join(FRONTEND_ROOT, 'src', 'prerenderEntry.tsx'),
        outDir: SSR_TMP_DIR,
        emptyOutDir: true,
        rollupOptions: {
          output: {
            format: 'cjs',
            entryFileNames: 'prerenderEntry.cjs',
          },
        },
      },
    });

    const require = createRequire(import.meta.url);
    const { renderPublicRoute } = require(path.join(SSR_TMP_DIR, 'prerenderEntry.cjs'));

    const targets = [
      { routeKey: 'home', outFiles: ['index.html'] },
      { routeKey: 'rooms', outFiles: ['room/index.html', 'room.html'] },
      { routeKey: 'about', outFiles: ['about-developer/index.html', 'about-developer.html'] },
    ];

    for (const target of targets) {
      const rendered = renderPublicRoute(target.routeKey);
      const finalHtml = injectRoutePayload(templateHtml, rendered);
      for (const outFile of target.outFiles) {
        const destPath = path.join(BUILD_DIR, outFile);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, finalHtml, 'utf8');
        console.log(`[prerender] Wrote ${outFile} (${Buffer.byteLength(finalHtml, 'utf8')} bytes)`);
      }
    }
  } finally {
    fs.rmSync(SSR_TMP_DIR, { recursive: true, force: true });
  }
}

runPrerender().catch((err) => {
  console.error('[prerender] Failed:', err);
  process.exit(1);
});
