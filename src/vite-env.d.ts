interface ImportMetaEnv {
  /** Base URL of the cobalt instance the browser posts to, e.g. https://cobalt.example.com/ */
  readonly VITE_COBALT_API_URL?: string;
  /** Optional Api-Key, only if your instance is configured to require one. */
  readonly VITE_COBALT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
