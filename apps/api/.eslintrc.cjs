module.exports = {
  root: true,
  extends: ["../../packages/config/eslint-preset.js"],
  parserOptions: {
    project: "./tsconfig.json",
  },
  ignorePatterns: ["src/tests/**", "src/**/*.test.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/no-var-requires": "off",
    "prefer-const": "off",
  },
};