// Shared base ESLint flat config. Strict TypeScript, no `any`, per
// docs/architecture/Coding_Standards.md.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Decorator-only classes (NestJS @Module()/@Controller() containers)
      // are idiomatic in this codebase and shouldn't be flagged.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    ignores: ["dist/**", "build/**", "node_modules/**", "coverage/**", "*.config.*"],
  },
];
