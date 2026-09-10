import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", ".tmp/**", "coverage/**", "webapp-banner-tool/**"] },
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: "commonjs",
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },
  {
    files: ["scripts/**/*.{cjs,mjs}"],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
