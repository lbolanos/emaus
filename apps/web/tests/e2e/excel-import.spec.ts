import { test, expect } from '@playwright/test';

test.describe('Excel Import Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the walkers page
    await page.goto('/walkers');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should open import modal when import button is clicked', async ({ page }) => {
    // Find and click the import button
    const importButton = page.getByTestId('import');
    await expect(importButton).toBeVisible();
    await importButton.click();

    // Verify modal is open
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Check modal title
    const title = page.locator('h2');
    await expect(title).toContainText('participants.import.title');
  });

  test('should download template successfully', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Click download template button
    const downloadButton = page.getByLabel(/participants\.import\.downloadTemplate/);
    await expect(downloadButton).toBeVisible();

    // Start waiting for download
    const downloadPromise = page.waitForEvent('download');

    // Click download button
    await downloadButton.click();

    // Wait for download to complete
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('participants_import_template.xlsx');
  });

  test('should handle file upload via drag and drop', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Create a mock Excel file
    const fileContent = Buffer.from('mock excel content');

    // Get the drop zone
    const dropZone = page.getByTestId('drop-zone');
    await expect(dropZone).toBeVisible();

    // Simulate drag and drop
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await page.evaluate((data) => {
      const file = new File(['test content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      data.items.add(file);
    }, dataTransfer);

    await dropZone.dispatchEvent('drop', { dataTransfer });

    // Verify file was selected
    const fileSelected = page.getByTestId('file-selected');
    await expect(fileSelected).toBeVisible();
  });

  test('should handle file upload via file input', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Get file input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();

    // Create a mock file
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    // Upload file
    await fileInput.setInputFiles(file);

    // Verify file was selected
    const fileSelected = page.getByTestId('file-selected');
    await expect(fileSelected).toBeVisible();
    await expect(fileSelected).toContainText('test.xlsx');
  });

  test('should validate file types', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Get file input
    const fileInput = page.locator('input[type="file"]');

    // Try to upload invalid file type
    const invalidFile = {
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid file content')
    };

    await fileInput.setInputFiles(invalidFile);

    // Verify error message
    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('participants.import.error.invalidFile');
  });

  test('should reject files that are too large', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Get file input
    const fileInput = page.locator('input[type="file"]');

    // Create a large file (simulated)
    const largeFile = {
      name: 'large.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.alloc(11 * 1024 * 1024) // 11MB
    };

    await fileInput.setInputFiles(largeFile);

    // Verify error message
    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('participants.import.error.fileTooLarge');
  });

  test('should show data preview for valid files', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Mock file processing (this would need to be implemented with proper mocking)
    // For now, we'll simulate the UI state after file processing
    await page.evaluate(() => {
      // Simulate that file processing completed
      window.mockImportData = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      ];
    });

    // Simulate file upload success
    const fileInput = page.locator('input[type="file"]');
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    await fileInput.setInputFiles(file);

    // Wait for processing to complete
    await page.waitForTimeout(1000);

    // Verify data preview is shown
    const dataPreview = page.getByTestId('data-preview');
    await expect(dataPreview).toBeVisible();

    // Verify rows count
    const rowsCount = page.getByTestId('rows-count');
    await expect(rowsCount).toBeVisible();
  });

  test('should confirm import with valid data', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Mock successful file processing
    await page.evaluate(() => {
      window.mockImportData = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
      ];
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    await fileInput.setInputFiles(file);
    await page.waitForTimeout(1000);

    // Click confirm import button
    const confirmButton = page.getByRole('button', { name: /participants\.import\.confirmImport/ });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Show progress indicator
    const progressBar = page.getByTestId('progress-bar');
    await expect(progressBar).toBeVisible();

    // Wait for import to complete (mocked)
    await page.waitForTimeout(2000);

    // Verify success message
    const successMessage = page.getByTestId('success-message');
    await expect(successMessage).toBeVisible();
    await expect(successMessage).toContainText('participants.import.successTitle');
  });

  test('should handle import errors gracefully', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Mock file processing with invalid data
    await page.evaluate(() => {
      window.mockImportData = [
        { firstName: 'John' } // Missing required email field
      ];
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    await fileInput.setInputFiles(file);
    await page.waitForTimeout(1000);

    // Click confirm import button
    const confirmButton = page.getByRole('button', { name: /participants\.import\.confirmImport/ });
    await confirmButton.click();

    // Wait for error handling
    await page.waitForTimeout(1000);

    // Verify error message
    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('participants.import.error.emailRequired');
  });

  test('should close modal when cancel button is clicked', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Verify modal is open
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: /common\.actions\.cancel/ });
    await cancelButton.click();

    // Verify modal is closed
    await expect(modal).not.toBeVisible();
  });

  test('should close modal when close button is clicked', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Verify modal is open
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Click close button (X)
    const closeButton = page.getByRole('button', { name: '' }).first();
    await closeButton.click();

    // Verify modal is closed
    await expect(modal).not.toBeVisible();
  });

  test('should reset state when modal is closed and reopened', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    await fileInput.setInputFiles(file);
    await page.waitForTimeout(1000);

    // Verify file is selected
    const fileSelected = page.getByTestId('file-selected');
    await expect(fileSelected).toBeVisible();

    // Close modal
    const cancelButton = page.getByRole('button', { name: /common\.actions\.cancel/ });
    await cancelButton.click();

    // Wait for modal to close
    await page.waitForTimeout(500);

    // Reopen modal
    await page.getByTestId('import').click();

    // Verify state is reset
    const dropZone = page.getByTestId('drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(fileSelected).not.toBeVisible();
  });

  test('should be accessible via keyboard', async ({ page }) => {
    // Navigate to import button using keyboard
    await page.keyboard.press('Tab');

    // Find import button and press Enter
    const importButton = page.getByTestId('import');
    await importButton.focus();
    await page.keyboard.press('Enter');

    // Verify modal opened
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Test closing modal with Escape key
    await page.keyboard.press('Escape');

    // Verify modal closed
    await expect(modal).not.toBeVisible();
  });

  test('should work on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to walkers page
    await page.goto('/walkers');
    await page.waitForLoadState('networkidle');

    // Open import modal
    await page.getByTestId('import').click();

    // Verify modal is responsive
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Verify all elements are accessible on mobile
    const title = page.locator('h2');
    await expect(title).toBeVisible();

    const dropZone = page.getByTestId('drop-zone');
    await expect(dropZone).toBeVisible();

    const buttons = page.locator('button');
    await expect(buttons).toHaveCount(4); // Close, Download, Cancel, Confirm
  });

  test('should maintain proper focus management', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Verify focus is trapped within modal
    const modal = page.getByTestId('import-modal');
    await expect(modal).toBeVisible();

    // Try to tab through all focusable elements
    await page.keyboard.press('Tab');

    // First focusable element should be close button or first interactive element
    const firstFocusable = page.locator(':focus');
    await expect(firstFocusable).toBeVisible();

    // Continue tabbing to ensure all elements are focusable
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();
    }
  });

  test('should handle concurrent import attempts', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import').click();

    // Start first import
    const fileInput = page.locator('input[type="file"]');
    const file = {
      name: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock excel content')
    };

    await fileInput.setInputFiles(file);
    await page.waitForTimeout(1000);

    // Click confirm import
    const confirmButton = page.getByRole('button', { name: /participants\.import\.confirmImport/ });
    await confirmButton.click();

    // Verify button is disabled during import
    await expect(confirmButton).toBeDisabled();

    // Verify progress indicator is shown
    const progressBar = page.getByTestId('progress-bar');
    await expect(progressBar).toBeVisible();

    // Try to click confirm again (should not work)
    await expect(confirmButton).toBeDisabled();
  });
});