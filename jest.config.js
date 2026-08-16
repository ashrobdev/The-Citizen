/**
 * Two-project setup (see plan). Only the `domain` project exists today:
 * src/domain is pure TypeScript with zero React/React Native imports, so it
 * runs on the plain node environment and needs no RN transform. That is what
 * lets the grading and scheduling suites run thousands of cases quickly.
 *
 * A second `ui` project using jest-expo gets added when there are components
 * worth testing — not before.
 */
module.exports = {
  projects: [
    {
      displayName: 'domain',
      preset: 'ts-jest',
      testEnvironment: 'node',
      // src/services and src/data are equally free of React Native imports —
      // services depend on repository interfaces, and tests supply the
      // in-memory implementations — so the whole session flow runs here too.
      roots: ['<rootDir>/src/domain', '<rootDir>/src/services', '<rootDir>/src/data'],
      testMatch: ['**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: {
              // The RN/JSX settings in the app tsconfig are irrelevant here and
              // `jsx: react-native` makes ts-jest complain, so the domain
              // project compiles as plain node TypeScript.
              module: 'commonjs',
              target: 'es2022',
              lib: ['es2022'],
              types: ['jest', 'node'],
              strict: true,
              noUncheckedIndexedAccess: true,
              esModuleInterop: true,
              skipLibCheck: true,
            },
          },
        ],
      },
    },
  ],
};
