/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public (pk.) Mapbox token, URL-restricted. Never a secret (sk.) token. */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** EIA Open Data API key. Browser-visible because it is a VITE_ variable; free and revocable. */
  readonly VITE_EIA_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
