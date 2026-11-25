// Shared server-side media MIME and filename extension classification helpers.

const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|webm|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$/i;
const AUDIO_URL_OR_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|webm|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)($|\?)/i;

// Photo patterns intentionally exclude .gif so animated GIFs stay in the dedicated GIF category.
const PHOTO_EXT_RE = /\.(jpg|jpeg|png|webp|avif|heic|bmp)$/i;
const PHOTO_URL_RE = /\.(jpg|jpeg|png|webp|avif|heic|bmp)($|\?)/i;
const PHOTO_TAG_RE = /\[.*?\.(jpg|jpeg|png|webp|avif|heic|bmp)\]/i;

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i;
const VIDEO_URL_RE = /\.(mp4|webm|mov|mkv|avi|m4v)($|\?)/i;
const VIDEO_TAG_RE = /\[.*?\.(mp4|webm|mov|mkv|avi|m4v)\]/i;

const AUDIO_NON_VIDEO_EXT_RE = /(voice-message|\.(mp3|wav|ogg|m4a|aac|opus|flac|weba|wma|aiff|aif|alac|amr|caf|oga|m4b|mid|midi)$)/i;

const DOC_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)$/i;
const DOC_URL_RE = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)($|\?)/i;
const DOC_TAG_RE = /\[.*?\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|html|csv)\]/i;

const isAudioMimeOrExt = (mimetype = '', filename = '') => {
  if (typeof mimetype === 'string' && mimetype.startsWith('audio/')) return true;
  if (/^voice[-_]message/i.test(filename || '')) return true;
  return AUDIO_EXT_RE.test(filename || '');
};

const getUploadResourceType = (mimetype = '', filename = '') => {
  if (typeof mimetype === 'string' && mimetype.startsWith('image/')) return 'image';
  if (isAudioMimeOrExt(mimetype, filename)) return 'video';
  if (typeof mimetype === 'string' && mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

const getMessageFileType = (mimetype = '', filename = '') => {
  if (typeof mimetype === 'string' && mimetype.startsWith('image/')) return 'image';
  if (isAudioMimeOrExt(mimetype, filename)) return 'audio';
  if (typeof mimetype === 'string' && mimetype.startsWith('video/')) return 'video';
  return 'file';
};

module.exports = {
  AUDIO_EXT_RE,
  AUDIO_URL_OR_EXT_RE,
  AUDIO_NON_VIDEO_EXT_RE,
  PHOTO_EXT_RE,
  PHOTO_URL_RE,
  PHOTO_TAG_RE,
  VIDEO_EXT_RE,
  VIDEO_URL_RE,
  VIDEO_TAG_RE,
  DOC_EXT_RE,
  DOC_URL_RE,
  DOC_TAG_RE,
  isAudioMimeOrExt,
  getUploadResourceType,
  getMessageFileType,
};
