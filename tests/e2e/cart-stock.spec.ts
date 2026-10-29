import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test  } from '@playwright/test';
import type {Page} from '@playwright/test';

// Render the real built POS against inventory fixtures, without a live database.
async function openCart(page: Page) {
    const publicDir = path.resolve(process.env.POS_TEST_PUBLIC_DIR ?? 'public');
    const manifest = JSON.parse(
        await fs.readFile(path.join(publicDir, 'build/manifest.json'), 'utf8'),
    );
    const entry = manifest['resources/js/app.tsx'];
    const inventory = { stock: 4, writes: 0 };

    await page.route('http://pos.test/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.method() !== 'GET') {
            inventory.writes++;

            return route.fulfill({
                status: 500,
                body: 'Unexpected mutation in cart test',
            });
        }

        if (url.pathname.startsWith('/build/')) {
            const file = path.resolve(publicDir, '.' + url.pathname);

            if (!file.startsWith(path.join(publicDir, 'build') + path.sep)) {
                return route.abort();
            }

            return route.fulfill({ path: file });
        }

        if (url.pathname !== '/admin/products') {
            return route.fulfill({ status: 404 });
        }

        const product = {
            id: 1,
            name: 'Test Beer',
            category: 'Beer',
            price: '8000',
            cost_price: '4000',
            stock_quantity: inventory.stock,
            low_stock_threshold: 1,
            is_active: true,
        };
        const data = {
            component: 'admin/products',
            url: '/admin/products',
            version: 'cart-test',
            props: {
                auth: {
                    user: {
                        id: 1,
                        name: 'Test Admin',
                        email: 'test@example.test',
                        role: 'admin',
                    },
                },
                errors: {},
                locale: 'en',
                sidebarOpen: true,
                isAdmin: true,
                products: [
                    product,
                    {
                        ...product,
                        id: 2,
                        name: 'Test Beer 2+1',
                        category: 'Special',
                        stock_quantity: Math.floor(inventory.stock / 3),
                        is_deal: true,
                        deal_active: true,
                        deal_product_id: 1,
                        deal_buy_qty: 2,
                        deal_get_qty: 1,
                    },
                ],
                openCheckouts: [],
                runningTables: [],
                users: [],
                dealBaseProducts: [],
            },
        };

        if (request.headers()['x-inertia']) {
            return route.fulfill({
                headers: { 'X-Inertia': 'true' },
                json: data,
            });
        }

        const encoded = JSON.stringify(data)
            .replaceAll('&', '&amp;')
            .replaceAll("'", '&#39;');
        const styles = (entry.css ?? [])
            .map(
                (file: string) =>
                    `<link rel="stylesheet" href="/build/${file}">`,
            )
            .join('');

        return route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html><head>${styles}</head><body><div id="app" data-page='${encoded}'></div><script type="module" src="/build/${entry.file}"></script></body></html>`,
        });
    });
    await page.goto('http://pos.test/admin/products');
    await expect(page.getByTestId('product-tile')).toHaveCount(2);

    return inventory;
}

test('four beers allow only one 2+1 in the cart before opening payment', async ({
    page,
}) => {
    const inventory = await openCart(page);
    const offer = page
        .getByTestId('product-tile')
        .filter({ hasText: 'Test Beer 2+1' });
    await offer.click();
    await offer.click();
    await expect(page.getByRole('spinbutton')).toHaveValue('1');
    await expect(page.getByRole('alert')).toContainText(
        'Available: 4, requested: 6',
    );

    await page.getByRole('spinbutton').fill('2');
    await expect(page.getByRole('spinbutton')).toHaveValue('1');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Pay now', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Pay products');
    await expect(
        page.getByRole('button', { name: /Complete payment/ }),
    ).toContainText('16,000');
    expect(inventory.writes).toBe(0);
});

test('a stock refresh prevents an outdated cart from proceeding to payment', async ({
    page,
}) => {
    const inventory = await openCart(page);
    await page
        .getByTestId('product-tile')
        .filter({ hasText: 'Test Beer 2+1' })
        .click();
    inventory.stock = 2;
    await expect(
        page.getByTestId('product-tile').filter({ hasText: 'Packages: 0' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(
        'Available: 2, requested: 3',
    );
    expect(inventory.writes).toBe(0);
});
