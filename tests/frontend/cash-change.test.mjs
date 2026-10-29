import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildExactSettlementPayments,
    buildTabBalancePayments,
} from '../../resources/js/lib/payments.ts';

test('a 5k sale paid with 20k shows 15k change and records 5k cash', () => {
    const input = { cash: 20000, card: 0, transfer: 0, money: String };

    for (const result of [
        buildExactSettlementPayments({ ...input, expected: 5000 }),
        buildTabBalancePayments({ ...input, remaining: 5000 }),
    ]) {
        assert.equal(result.error, null);
        assert.equal(result.preview.change, 15000);
        assert.deepEqual(result.payments, [{ method: 'cash', amount: 5000 }]);
    }
});
