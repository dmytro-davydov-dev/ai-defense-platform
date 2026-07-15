/// <reference types="vite/client" />

/**
 * Phase 6: named env vars this app reads via `import.meta.env`. Declared
 * explicitly (not left to `vite/client`'s open index-signature default)
 * so `import.meta.env.VITE_API_BASE_URL` is a real property access, not
 * an index-signature one — required by
 * `@ai-defense/ts-config`'s `noPropertyAccessFromIndexSignature`.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
