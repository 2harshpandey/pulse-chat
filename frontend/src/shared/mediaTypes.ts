// Shared frontend media extension and MIME classification helpers.

export const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i;
export const AUDIO_URL_RE = /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i;
export const VOICE_CONTAINER_URL_RE = /\.(webm|ogg|mp4|m4a)($|\?)/i;

// Includes .webm for voice notes when filename/type explicitly indicates audio.
export const UPLOAD_AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i;

export const IMAGE_EXT_RE = /\.(jpe?g|png|gif|svg|webp|avif|heic|bmp|ico)$/i;
export const IMAGE_URL_RE = /\.(jpe?g|png|gif|svg|webp|avif|heic|bmp|ico)($|\?)/i;

export const PHOTO_ONLY_EXT_RE = /\.(jpe?g|png|webp|avif|heic|bmp)$/i;
export const PHOTO_ONLY_URL_RE = /\.(jpe?g|png|webp|avif|heic|bmp)($|\?)/i;
export const PHOTO_ONLY_TAG_RE = /\[.*?\.(jpe?g|png|webp|avif|heic|bmp)\]/i;

export const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|wmv|m4v)$/i;
export const VIDEO_URL_RE = /\.(mp4|webm|mov|mkv|avi|wmv|m4v)($|\?)/i;
export const VIDEO_TAG_RE = /\[.*?\.(mp4|webm|mov|mkv|avi|wmv|m4v)\]/i;

export const DOC_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|tar|gz|txt|html|csv)$/i;
export const DOC_URL_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|tar|gz|txt|html|csv)($|\?)/i;
export const DOC_ADMIN_TAG_RE = /\[.*?\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)\]/i;

export interface MediaLikeInput {
  type?: string;
  url?: string;
  originalName?: string;
  mimeType?: string;
}

export const isAudioMedia = (item?: MediaLikeInput | null): boolean => {
  if (!item) return false;
  if (item.type === 'audio') return true;
  if (item.mimeType?.startsWith('audio/')) return true;
  if (item.type && item.type !== 'file') return false;
  const url = item.url || '';
  const name = item.originalName || '';
  return Boolean(
    AUDIO_URL_RE.test(url) ||
    AUDIO_EXT_RE.test(name) ||
    (name.toLowerCase().includes('voice') && VOICE_CONTAINER_URL_RE.test(url))
  );
};

export const isVideoMedia = (item?: MediaLikeInput | null): boolean => {
  if (!item || isAudioMedia(item)) return false;
  if (item.type === 'video') return true;
  if (item.mimeType?.startsWith('video/')) return true;
  const url = item.url || '';
  const name = item.originalName || '';
  return VIDEO_URL_RE.test(url) || VIDEO_EXT_RE.test(name);
};

export const isImageMedia = (item?: MediaLikeInput | null): boolean => {
  if (!item) return false;
  if (item.type === 'image' || item.type === 'photo') return true;
  if (item.mimeType?.startsWith('image/')) return true;
  const url = item.url || '';
  const name = item.originalName || '';
  return IMAGE_URL_RE.test(url) || IMAGE_EXT_RE.test(name);
};

export const classifyUploadFile = (file: { name?: string; type?: string }): 'image' | 'video' | 'audio' | 'file' => {
  const name = file.name || '';
  const type = file.type || '';
  const isAudio = type.startsWith('audio/') || UPLOAD_AUDIO_EXT_RE.test(name);
  if (isAudio) return 'audio';
  if (type.startsWith('image/') || IMAGE_EXT_RE.test(name)) return 'image';
  if (type.startsWith('video/') || VIDEO_EXT_RE.test(name)) return 'video';
  return 'file';
};
