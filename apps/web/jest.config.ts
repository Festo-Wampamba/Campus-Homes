const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
};

module.exports = createJestConfig(config);
