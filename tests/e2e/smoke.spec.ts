/// <reference types="node" />
import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'admin@billiardpos.test';
const password = process.env.E2E_PASSWORD ?? 'password';

test.describe('POS smoke flow', () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    'Set E2E_BASE_URL to run tests against a live POS server.',
  );

  test('login and open products payment modal', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    await expect(page).toHaveURL(/dashboard|overview|tables|cash-register/);

    await page.goto('/admin/products');
    await expect(page.getByText(/products pos/i)).toBeVisible();

    const productTiles = page.getByTestId('product-tile');
    await expect(productTiles.first()).toBeVisible();

    await productTiles.first().click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /pay now/i }).click();

    await expect(page.getByRole('dialog')).toContainText(/pay products/i);
  });
});
