import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import localRules from "./eslint-local-rules/index.js";

export default tseslint.config(
  { ignores: ["dist", "eslint-local-rules/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "local": localRules,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Hooks-order safety net — promote to errors so CI / dev surface
      // them immediately instead of silently shipping crashes.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Custom rule: catches hooks declared *after* an early return,
      // which Rules-of-Hooks does NOT detect on its own.
      "local/no-hooks-after-return": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Tests may stub out hooks in ways that trip the heuristics.
  {
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "local/no-hooks-after-return": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  }
);
