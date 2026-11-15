import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // T-142 item 1: app code imports the design system through its barrel
    // only (src/design/index.ts); the foundations stylesheet is the one
    // deliberate entry besides it (imported once from main.tsx).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/design/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/design/*", "!**/design/index.css"],
              message: 'Import from the design barrel ("../design" or "./design") only.',
            },
          ],
        },
      ],
    },
  },
);
