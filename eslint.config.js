import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "dist/"],
  },
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "import/no-unresolved": "off",
      "no-console": "warn",
    },
  },
];
