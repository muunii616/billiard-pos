import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test  } from '@playwright/test';
import type {Page} from '@playwright/test';
const mn: Record<string, string> = JSON.parse(
    await fs.readFile('lang/mn.json', 'utf8'),
);

async function fixture(
    page: Page,
    component: string,
    props: Record<string, unknown>,
    locale = 'mn',
) {
    const publicDir = path.resolve(process.env.POS_TEST_PUBLIC_DIR ?? 'public');
    const manifest = JSON.parse(
        await fs.readFile(path.join(publicDir, 'build/manifest.json'), 'utf8'),
    );
    const entry = manifest['resources/js/app.tsx'];
    await page.route('http://stock-tabs.test/**', async (route) => {
        const url = new URL(route.request().url());

        if (url.pathname.startsWith('/build/')) {
            const file = path.resolve(publicDir, '.' + url.pathname);

            if (!file.startsWith(path.join(publicDir, 'build') + path.sep)) {
return route.abort();
}

            return route.fulfill({ path: file });
        }

        if (url.pathname !== '/fixture') {
return route.fulfill({ status: 404 });
}

        const data = JSON.stringify({
            component,
            url: '/fixture',
            version: 'stock-tabs-test',
            props: {
                auth: {
                    user: {
                        id: 1,
                        name: 'Test Employee',
                        email: 'test@example.test',
                        role: 'admin',
                    },
                },
                errors: {},
                locale,
                sidebarOpen: true,
                ...props,
            },
        })
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
            body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><div id="app" data-page='${data}'></div><script type="module" src="/build/${entry.file}"></script></body></html>`,
        });
    });
    await page.goto('http://stock-tabs.test/fixture');
}

test.use({ timezoneId: 'America/Los_Angeles' });

test('stock labels, draft counts, report and external-use dialogs translate', async ({
    page,
}) => {
    await fixture(page, 'stock/index', {
        products: [
            {
                id: 1,
                name: 'Altan Gobi',
                category: 'Beer',
                price: 5000,
                cost_price: 3000,
                stock_quantity: 4,
                low_stock_threshold: 5,
                is_active: true,
                status: 'low',
                value_at_cost: 12000,
            },
        ],
        summary: {
            sku_count: 1,
            units_on_hand: 4,
            ok_count: 0,
            low_count: 1,
            out_count: 0,
            inventory_value: 12000,
        },
        activity: [
            {
                id: 1,
                kind: 'adjustment',
                product_name: 'Altan Gobi',
                user_name: 'Test Employee',
                quantity: 4,
                stock_after: 4,
                note: 'Initial stock',
                at: '2026-10-19T15:59:00Z',
            },
        ],
        users: [{ id: 1, name: 'Test Employee' }],
        isAdmin: true,
    });
    await expect(
        page.getByText(mn['Recent movement'], { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Altan Gobi', { exact: true }).first(),
    ).toBeVisible();
    await expect(
        page.getByText(mn['Beer'], { exact: true }).first(),
    ).toBeVisible();
    await page.getByTitle(mn['Increase draft'], { exact: true }).click();
    await expect(
        page.getByRole('button', {
            name: mn['Save 1 change'],
        }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: mn['Inventory report'], exact: true })
        .click();
    await expect(page.getByRole('dialog')).toContainText(
        mn['Download inventory overview'],
    );
    await expect(page.getByRole('dialog')).toContainText(mn['Report period']);
    await page
        .getByRole('dialog')
        .getByRole('button', { name: mn['Cancel'], exact: true })
        .click();
    await page
        .getByRole('button', { name: mn['External use'], exact: true })
        .click();
    await expect(page.getByRole('dialog')).toContainText(mn['Staff member']);
    await page
        .getByRole('button', { name: mn['Record use'], exact: true })
        .click();
    await expect(page.getByRole('dialog')).toContainText(
        mn['Pick a product, staff member, and quantity.'],
    );
    await page
        .getByRole('dialog')
        .getByRole('button', { name: mn['Cancel'], exact: true })
        .click();
    await page.getByPlaceholder(mn['Search products…']).fill(mn['Beer']);
    await expect(
        page.getByText('Altan Gobi', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Save 1 change', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Recent movement', { exact: true }),
    ).toBeVisible();
});

for (const locale of ['en', 'mn']) {
    test(`open tabs show date sections and retain nested original dates (${locale})`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 720, height: 1000 });
        const base = {
            status: 'open',
            table_names: [],
            time_total: 0,
            items_total: 0,
            grand_total: 0,
            tab_items: [],
            table_sessions: [],
        };
        await fixture(
            page,
            'checkouts/index',
            {
                products: [],
                checkouts: [
                    { ...base, id: 9, created_at: '2026-10-19T15:59:00Z' },
                    { ...base, id: 10, created_at: '2026-10-19T16:01:00Z' },
                    {
                        ...base,
                        id: 2,
                        created_at: '2026-10-18T12:00:00Z',
                        latest_tab_at: '2026-10-19T16:02:00Z',
                        table_names: ['Table 8'],
                        table_sessions: [
                            {
                                id: 1,
                                table_name: 'Table 8',
                                started_at: '2026-10-18T14:00:00Z',
                                ended_at: '2026-10-18T15:00:00Z',
                                played_seconds: 3600,
                                time_total: 5000,
                                products_total: 0,
                                items: [],
                            },
                        ],
                    },
                ],
            },
            locale,
        );
        const sections = page.locator('section[aria-labelledby^="tabs-date-"]');
        await expect(sections).toHaveCount(2);
        await expect(sections.first()).toHaveAttribute(
            'aria-labelledby',
            'tabs-date-2026-10-20',
        );
        await expect(sections.last()).toHaveAttribute(
            'aria-labelledby',
            'tabs-date-2026-10-19',
        );
        await expect(sections.first()).toContainText('18/10/2026, 22:00');
        await expect(sections.first()).toContainText('18/10/2026, 23:00');
        const tabLabel = (id: number) =>
            locale === 'mn'
                ? mn['Tab #{id}'].replace('{id}', String(id))
                : `Tab #${id}`;
        await expect(sections.first()).toContainText(tabLabel(2));
        await expect(sections.first()).toContainText(tabLabel(10));
        await expect(sections.last()).toContainText(tabLabel(9));
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
    });
}
