import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceTypeScriptFiles = ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"];
const toolingFiles = ["**/*.{js,mjs,cjs}", "apps/*/*.config.ts"];

const typeCheckedConfigs = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => ({ ...config, files: sourceTypeScriptFiles }));

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/server/data/**",
    ],
  },
  {
    ...eslint.configs.recommended,
    files: toolingFiles,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  ...typeCheckedConfigs,
  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    jsx: true,
    arrowParens: true,
    braceStyle: "1tbs",
    blockSpacing: true,
    commaDangle: "always-multiline",
  }),
  {
    files: sourceTypeScriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@stylistic/max-statements-per-line": "off",
      "@stylistic/operator-linebreak": [
        "error",
        "after",
        { overrides: { "|": "before", "&": "before", "?": "before", ":": "before" } },
      ],
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always"],
      "no-duplicate-imports": "error",
      "no-implicit-coercion": "error",
      "no-unneeded-ternary": "error",
      "object-shorthand": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: toolingFiles,
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: false,
      },
    },
    rules: {
      // Mirrors the TypeScript side: `_`-prefixed discards are intentional.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@stylistic/max-statements-per-line": "off",
      "@stylistic/operator-linebreak": [
        "error",
        "after",
        { overrides: { "|": "before", "&": "before", "?": "before", ":": "before" } },
      ],
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always"],
      "no-duplicate-imports": "error",
      "no-implicit-coercion": "error",
      "no-unneeded-ternary": "error",
      "object-shorthand": "error",
      "prefer-const": "error",
    },
  },
);
