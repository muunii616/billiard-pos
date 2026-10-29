import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    businessDate,
    formatClock,
    formatCountdown,
    groupTabsByDate,
} from '../../resources/js/lib/dates.ts';

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

test('clocks keep their existing hour and countdown formats', () => {
    assert.equal(formatClock(65.9), '00:01:05');
    assert.equal(formatClock(3661), '01:01:01');
    assert.equal(formatCountdown(65.9), '01:05');
    assert.equal(formatCountdown(3661), '01:01:01');
});
