import reactConfig from "@ai-defense/eslint-config/react";

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // server.js is a plain Node script outside the Vite/vitest tsconfig
    // project graph (production static server, see REQ-1.8); excluded
    // from type-aware linting rather than added to tsconfig.app.json's
    // browser-targeted compiler options.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "server.js"],
  },
];
