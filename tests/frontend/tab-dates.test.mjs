import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessDate, groupTabsByDate } from '../../resources/js/lib/dates.ts';

test('tabs group by the Ulaanbaatar day, newest first, including merged tabs', () => {
    const tabs = [
        { id: 10, created_at: '2026-10-19T15:59:00Z' },
        { id: 11, created_at: '2026-10-19T16:01:00Z' },
        {
            id: 2,
            created_at: '2026-10-18T12:00:00Z',
            latest_tab_at: '2026-10-19T16:02:00Z',
        },
    ];
    assert.deepEqual(
        groupTabsByDate(tabs).map((g) => [g.date, g.tabs.map((t) => t.id)]),
        [
            ['2026-10-20', [2, 11]],
            ['2026-10-19', [10]],
        ],
    );
    assert.equal(businessDate('2026-10-19T16:00:00Z'), '2026-10-20');
    assert.deepEqual(
        tabs.map((t) => t.id),
        [10, 11, 2],
    );
    assert.deepEqual(groupTabsByDate([]), []);
});
