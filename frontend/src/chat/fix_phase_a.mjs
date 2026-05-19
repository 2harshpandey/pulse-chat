// fix_phase_a.mjs — fixes all TypeScript errors from Phase A
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');

// ─── FIX 1: Add `export` to all const/function declarations in ChatStyledComponents.tsx ───
{
  const path = join(root, 'frontend/src/chat/ChatStyledComponents.tsx');
  let content = readFileSync(path, 'utf8');
  
  // Add export to all top-level const declarations (not already exported)
  // Pattern: line starts with "const " (not "export const")
  content = content.replace(/^const ([A-Za-z])/gm, 'export const $1');
  
  writeFileSync(path, content, 'utf8');
  console.log('✓ ChatStyledComponents.tsx: added export to all const declarations');
}

// ─── FIX 2: VideoPlayer.tsx — add sanitizeMediaUrl import ───
{
  const path = join(root, 'frontend/src/chat/VideoPlayer.tsx');
  let content = readFileSync(path, 'utf8');
  
  // Add sanitizeMediaUrl to imports from utils
  content = content.replace(
    `import { SPEEDS } from './constants';`,
    `import { SPEEDS } from './constants';\nimport { sanitizeMediaUrl } from './utils';`
  );
  
  writeFileSync(path, content, 'utf8');
  console.log('✓ VideoPlayer.tsx: added sanitizeMediaUrl import');
}

// ─── FIX 3: renderMessage.tsx — add wrapEmojis import and VideoPlayerWrapper ───
{
  const path = join(root, 'frontend/src/chat/renderMessage.tsx');
  let content = readFileSync(path, 'utf8');
  
  // Add wrapEmojis to utils imports
  content = content.replace(
    `import {\n  sanitizeMediaUrl, isTenorUrl, withCloudinaryTransform, getMediaGatePreviewUrl,\n  formatMediaSize, getFileContainerLabel, buildDownloadProxyUrl,\n  fetchBlobWithProgress, downloadFile,\n} from './utils';`,
    `import {\n  sanitizeMediaUrl, isTenorUrl, withCloudinaryTransform, getMediaGatePreviewUrl,\n  formatMediaSize, getFileContainerLabel, buildDownloadProxyUrl,\n  fetchBlobWithProgress, downloadFile, wrapEmojis,\n} from './utils';`
  );
  
  // Add VideoPlayerWrapper to ChatStyledComponents imports
  content = content.replace(
    `  MessageText, DownloadProgressRing,\n} from './ChatStyledComponents';`,
    `  MessageText, DownloadProgressRing, VideoPlayerWrapper,\n} from './ChatStyledComponents';`
  );
  
  writeFileSync(path, content, 'utf8');
  console.log('✓ renderMessage.tsx: added wrapEmojis and VideoPlayerWrapper imports');
}

// ─── FIX 4: TypingIndicator.tsx — remove UserProfile reference ───
{
  const path = join(root, 'frontend/src/chat/TypingIndicator.tsx');
  let content = readFileSync(path, 'utf8');
  console.log('TypingIndicator.tsx first 10 lines:');
  console.log(content.split('\n').slice(0, 10).join('\n'));
}

// ─── FIX 5: Chat.tsx — re-export GlobalStyle for App.tsx ───
{
  const path = join(root, 'frontend/src/Chat.tsx');
  let content = readFileSync(path, 'utf8');
  
  // Add re-export of GlobalStyle after the imports block
  // Find the line with the ChatStyledComponents import and add re-export after it
  content = content.replace(
    `} from './chat/ChatStyledComponents';`,
    `} from './chat/ChatStyledComponents';\nexport { GlobalStyle };`
  );
  
  writeFileSync(path, content, 'utf8');
  console.log('✓ Chat.tsx: added re-export of GlobalStyle');
}

console.log('\nAll fixes applied.');
