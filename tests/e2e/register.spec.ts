import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test  } from '@playwright/test';
import type {Page} from '@playwright/test';

async function registerFixture(
    page: Page,
    initial: 'other' | 'closed' | 'own' = 'other',
    locale = 'en',
) {
    const publicDir = path.resolve(process.env.POS_TEST_PUBLIC_DIR ?? 'public');
    const manifest = JSON.parse(
        await fs.readFile(path.join(publicDir, 'build/manifest.json'), 'utf8'),
    );
    const entry = manifest['resources/js/app.tsx'];
    const original = {
        id: 1,
        status: 'open',
        opening_cash: 10000,
        expected_cash: 16000,
        opened_at: '2026-10-21T01:00:00Z',
        closed_at: null,
        counted_cash: null,
        variance: null,
        receipts_count: 2,
        total_sales: 12000,
        cash_sales: 6000,
        card_sales: 4000,
        transfer_sales: 2000,
        opened_by: 'Previous Employee',
        opened_by_user_id: 1,
        closed_by: null,
    };
    const state = {
        open:
            initial === 'closed'
                ? null
                : {
                      ...original,
                      ...(initial === 'own'
                          ? { opened_by: 'Next Employee', opened_by_user_id: 2 }
                          : {}),
                  },
        needsChoice: initial === 'other',
        history: [] as Record<string, unknown>[],
        writes: [] as { action: string; body: Record<string, unknown> }[],
    };
    await page.route('http://register.test/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname.startsWith('/build/')) {
            const file = path.resolve(publicDir, '.' + url.pathname);

            if (!file.startsWith(path.join(publicDir, 'build') + path.sep)) {
return route.abort();
}

            return route.fulfill({ path: file });
        }

        if (url.pathname === '/admin/cash/current') {
            return route.fulfill({
                json: {
                    open_session: state.open,
                    needs_handover: state.needsChoice,
                    history: {
                        data: state.history,
                        total: state.history.length,
                        current_page: 1,
                        last_page: 1,
                    },
                    users: [],
                },
            });
        }

        if (request.method() === 'POST') {
            const action = url.pathname.split('/').pop()!;
            const body = request.postDataJSON();
            state.writes.push({ action, body });

            if (action === 'continue') {
state.needsChoice = false;
}

            if (action === 'handover' || action === 'open') {
                state.open = {
                    ...original,
                    id: 2,
                    opened_by: 'Next Employee',
                    opened_by_user_id: 2,
                    opening_cash: body.opening_cash,
                    expected_cash: body.opening_cash,
                };
                state.needsChoice = false;
            }

            if (action === 'close') {
state.open = null;
}

            return route.fulfill({
                json: {
                    message: 'Shift opened.',
                    ...(action === 'handover'
                        ? { receipt_url: '/admin/cash/1/receipt' }
                        : {}),
                },
            });
        }

        if (url.pathname !== '/cash-register') {
return route.fulfill({ status: 404 });
}

        const data = {
            component: 'register/index',
            url: '/cash-register',
            version: 'register-test',
            props: {
                auth: {
                    user: {
                        id: 2,
                        name: 'Next Employee',
                        email: 'staff@example.test',
                        role: 'employee',
                    },
                },
                errors: {},
                locale,
                sidebarOpen: true,
            },
        };
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
            body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><div id="app" data-page='${encoded}'></div><script type="module" src="/build/${entry.file}"></script></body></html>`,
        });
    });
    await page.goto('http://register.test/cash-register');

    return state;
}

test('another employee must choose and can continue without changing ownership', async ({
    page,
}) => {
    const state = await registerFixture(page);
    await expect(page.getByRole('dialog')).toContainText(
        'A register is already open',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
        .getByRole('button', {
            name: 'Continue the current shift',
            exact: true,
        })
        .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
        page.getByRole('heading', { name: 'Shift #1 · Previous Employee' }),
    ).toBeVisible();
    expect(state.writes).toEqual([
        { action: 'continue', body: { session_id: 1 } },
    ]);
});

test('handover requires a cash count and reason then opens under the signed-in name', async ({
    page,
}) => {
    const state = await registerFixture(page);
    await page
        .getByRole('button', {
            name: 'Close and open under my name',
            exact: true,
        })
        .click();
    const confirm = page.getByRole('button', {
        name: 'Close old shift and open mine',
        exact: true,
    });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Counted cash', { exact: true }).fill('15000');
    await expect(
        page.getByLabel('Opening cash for your shift', { exact: true }),
    ).toHaveValue('15000');
    await expect(confirm).toBeDisabled();
    await page
        .getByLabel('Reason for the difference (required)')
        .fill('Cash shortage counted');
    await page
        .getByLabel('Opening cash for your shift', { exact: true })
        .fill('12000');
    await confirm.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
        page.getByRole('heading', { name: 'Shift #2 · Next Employee' }),
    ).toBeVisible();
    expect(state.writes).toEqual([
        {
            action: 'handover',
            body: {
                session_id: 1,
                counted_cash: 15000,
                opening_cash: 12000,
                variance_reason: 'Cash shortage counted',
            },
        },
    ]);
    await expect(
        page.getByRole('link', { name: 'Download report' }),
    ).toBeVisible();
});

test('cancel returns to the choice without closing the current register', async ({
    page,
}) => {
    const state = await registerFixture(page);
    await page
        .getByRole('button', {
            name: 'Close and open under my name',
            exact: true,
        })
        .click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(
        'A register is already open',
    );
    expect(state.writes).toHaveLength(0);
});

test('opening an empty drawer requires explicitly entering zero', async ({
    page,
}) => {
    const state = await registerFixture(page, 'closed');
    const open = page.getByRole('button', { name: 'Open shift', exact: true });
    await expect(open).toBeDisabled();
    await page.getByLabel('Opening cash', { exact: true }).fill('0');
    await open.click();
    await expect(
        page.getByRole('heading', { name: 'Shift #2 · Next Employee' }),
    ).toBeVisible();
    expect(state.writes).toEqual([
        { action: 'open', body: { opening_cash: 0 } },
    ]);
});

test('register remains readable in Mongolian on a narrow screen', async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await registerFixture(page, 'own', 'mn');
    await expect(
        page.getByText('Касс нээлттэй', { exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: testInfo.outputPath('register-mobile.png'),
        fullPage: true,
    });
});

test('active register presents cash and ownership clearly on desktop', async ({
    page,
}, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await registerFixture(page, 'own');
    await expect(
        page.getByRole('heading', { name: 'Shift #1 · Next Employee' }),
    ).toBeVisible();
    await page.screenshot({
        path: testInfo.outputPath('register-desktop.png'),
        fullPage: true,
    });
});

test('overnight history displays both opening and closing dates', async ({
    page,
}) => {
    const state = await registerFixture(page, 'own');
    state.history.push({
        ...state.open,
        id: 7,
        opened_at: '2026-09-30T15:00:00Z',
        closed_at: '2026-09-30T17:00:00Z',
        counted_cash: 16000,
        variance: 0,
    });
    await expect(
        page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: '#7' });
    await expect(row).toContainText('30/09/2026, 23:00');
    await expect(row).toContainText('01/10/2026, 01:00');
    await expect(page.getByLabel('Opening month')).toBeVisible();
});
