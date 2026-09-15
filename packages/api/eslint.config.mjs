// @ts-check
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";

export default tseslint.config(
  // --- Ignore patterns ---
  globalIgnores(["dist/**", "node_modules/**", "*.js", "*.mjs", "*.cjs"]),

  // ===================================================================
  //  SOURCE — full linting with type-aware rules
  // ===================================================================

  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
  })),

  // --- Type-aware setup (only for specific rules below) ---
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // --- Import plugin (no-unresolved etc. handled by tsc) ---
  {
    files: ["src/**/*.ts"],
    ...importPlugin.flatConfigs.recommended,
    rules: {
      "import-x/no-unresolved": "off",
      "import-x/named": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
    },
  },

  // --- Source-only custom rules ---
  {
    files: ["src/**/*.ts"],
    rules: {
      // ------------------------------------------------------------------
      // 🚫 CRITICAL — Firebase Functions silently swallow forgotten `await`.
      //   These catch that at lint time.
      // ------------------------------------------------------------------
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksConditionals: true,
          checksVoidReturn: false,
        },
      ],

      // ------------------------------------------------------------------
      // 🧹 Dead code
      // ------------------------------------------------------------------
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-unused-expressions": "error",

      // ------------------------------------------------------------------
      // 🎯 Modern TS idioms — prefer ?? and ?. over || and &&
      // ------------------------------------------------------------------
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",

      // ------------------------------------------------------------------
      // ⚠️  Explicit any — aim to eliminate over time
      // ------------------------------------------------------------------
      "@typescript-eslint/no-explicit-any": "warn",

      // ------------------------------------------------------------------
      // 📦 Import organisation
      // ------------------------------------------------------------------
      "import-x/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",
    },
  },

  // ===================================================================
  //  TESTS — non-type-aware linting (outside tsconfig rootDir)
  // ===================================================================

  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["tests/**/*.ts"],
  })),

  {
    files: ["tests/**/*.ts"],
    ...importPlugin.flatConfigs.recommended,
    rules: {
      "import-x/no-unresolved": "off",
      "import-x/named": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
    },
  },

  // --- Test-only custom rules ---
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "import-x/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",
    },
  },
);