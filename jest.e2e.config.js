'use strict';

/** Post-deployment E2E tests, run against a live environment via BASE_URL (Deploy stage). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/e2e/**/*.e2e.test.js'],
  testTimeout: 20000,
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports/junit', outputName: 'junit-e2e.xml' }],
  ],
};
