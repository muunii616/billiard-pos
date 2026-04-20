/// <reference types="node" />
import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('POS smoke flow', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run e2e smoke tests.');

  test('login and open products payment modal', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(email as string);
    await page.getByLabel(/^password$/i).fill(password as string);
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    await expect(page).toHaveURL(/dashboard|overview|tables|cash-register/);

    await page.goto('/admin/products');
    await expect(page.getByText(/products pos/i)).toBeVisible();

    const productTiles = page.locator('button.h-36.w-36');
    const tileCount = await productTiles.count();
    test.skip(tileCount === 0, 'No active products found to build a cart.');

    await productTiles.first().click();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.getByRole('button', { name: /pay now/i }).click();

    await expect(page.getByRole('dialog')).toContainText(/pay products/i);
  });
});

