import js from "@eslint/js";
import ts from "typescript-eslint";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/renderer/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:*",
            "../cli/*",
            "../content/*",
            "../workspace/fs",
            "../workspace/validate",
          ],
        },
      ],
    },
  },
);
