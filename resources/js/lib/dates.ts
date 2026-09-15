export const POS_TIME_ZONE = 'Asia/Ulaanbaatar';

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
