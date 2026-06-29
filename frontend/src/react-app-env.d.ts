/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly REACT_APP_API_URL?: string;
  readonly REACT_APP_TENOR_KEY?: string;
  readonly REACT_APP_ADMIN_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
