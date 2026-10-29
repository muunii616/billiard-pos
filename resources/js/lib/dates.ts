export const POS_TIME_ZONE = 'Asia/Ulaanbaatar';

/** Calendar day at the POS, regardless of the browser's timezone. */
export function businessDate(value: string | Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: POS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(value));
}

export function formatBusinessDate(value: string, locale = 'en'): string {
    return new Intl.DateTimeFormat(locale === 'mn' ? 'mn-MN' : 'en-GB', {
        timeZone: POS_TIME_ZONE,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(new Date(value));
}

export function groupTabsByDate<
    T extends { id: number; created_at: string; latest_tab_at?: string | null },
>(tabs: T[]): { date: string; tabs: T[] }[] {
    const groups = new Map<string, T[]>();
    const sorted = [...tabs].sort(
        (a, b) =>
            Date.parse(b.latest_tab_at ?? b.created_at) -
                Date.parse(a.latest_tab_at ?? a.created_at) || b.id - a.id,
    );

    for (const tab of sorted) {
        const date = businessDate(tab.latest_tab_at ?? tab.created_at);
        const group = groups.get(date) ?? [];
        group.push(tab);
        groups.set(date, group);
    }

    return Array.from(groups, ([date, tabs]) => ({ date, tabs }));
}

export function formatClock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');

    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatCountdown(seconds: number): string {
    return formatClock(seconds).replace(/^00:/, '');
}

export function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('en-GB', {
        timeZone: POS_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

export function businessYear(): number {
    return Number(
        new Intl.DateTimeFormat('en', {
            timeZone: POS_TIME_ZONE,
            year: 'numeric',
        }).format(new Date()),
    );
}
