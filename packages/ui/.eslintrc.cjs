module.exports = {
  root: true,
  extends: ["../../packages/config/eslint-preset.js"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    extraFileExtensions: [".vue"],
  },
};