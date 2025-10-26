import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright global teardown...');

  // Optional: Clean up global test state
  // For example, you could:
  // - Clean up test database
  // - Delete temporary files
  // - Reset mock services
  // - Clear caches

  console.log('✅ Playwright global teardown completed');
}

export default globalTeardown;