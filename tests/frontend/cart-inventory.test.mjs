import assert from 'node:assert/strict';
import test from 'node:test';
import { cartInventoryError } from '../../resources/js/lib/cart-inventory.ts';

const beer = { id: 1, name: 'Beer', stock_quantity: 4 };
const deal = {
    id: 2,
    name: 'Beer 2+1',
    stock_quantity: 1,
    is_deal: true,
    deal_active: true,
    deal_product_id: 1,
    deal_buy_qty: 2,
    deal_get_qty: 1,
};

test('four beers allow one 2+1 package', () => {
    assert.equal(
        cartInventoryError([beer, deal], [{ productId: 2, quantity: 1 }]),
        null,
    );
});

test('four beers reject two 2+1 packages before payment', () => {
    assert.equal(
        cartInventoryError([beer, deal], [{ productId: 2, quantity: 2 }]),
        'Not enough stock for Beer. Available: 4, requested: 6.',
    );
});

test('regular beer and special packages share the same four units', () => {
    assert.equal(
        cartInventoryError(
            [beer, deal],
            [
                { productId: 2, quantity: 1 },
                { productId: 1, quantity: 1 },
            ],
        ),
        null,
    );
    assert.equal(
        cartInventoryError(
            [beer, deal],
            [
                { productId: 2, quantity: 1 },
                { productId: 1, quantity: 2 },
            ],
        ),
        'Not enough stock for Beer. Available: 4, requested: 5.',
    );
});

test('different offers cannot reuse the same base stock', () => {
    const otherDeal = { ...deal, id: 3 };
    assert.equal(
        cartInventoryError(
            [beer, deal, otherDeal],
            [
                { productId: 2, quantity: 1 },
                { productId: 3, quantity: 1 },
            ],
        ),
        'Not enough stock for Beer. Available: 4, requested: 6.',
    );
});

test('fresh stock counts invalidate a previously valid cart', () => {
    assert.equal(
        cartInventoryError(
            [{ ...beer, stock_quantity: 2 }, deal],
            [{ productId: 2, quantity: 1 }],
        ),
        'Not enough stock for Beer. Available: 2, requested: 3.',
    );
});

test('six beers allow two packages', () => {
    assert.equal(
        cartInventoryError(
            [{ ...beer, stock_quantity: 6 }, deal],
            [{ productId: 2, quantity: 2 }],
        ),
        null,
    );
});

test('an expired deal and missing products are rejected', () => {
    assert.equal(
        cartInventoryError(
            [beer, { ...deal, deal_active: false }],
            [{ productId: 2, quantity: 1 }],
        ),
        'This Special deal is not active today.',
    );
    assert.equal(
        cartInventoryError([deal], [{ productId: 2, quantity: 1 }]),
        'One or more products are missing from inventory.',
    );
});
