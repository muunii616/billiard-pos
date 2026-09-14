export const POS_TIME_ZONE = 'Asia/Ulaanbaatar';

export function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('en-GB', { timeZone: POS_TIME_ZONE });
}

export function businessYear(): number {
    return Number(
        new Intl.DateTimeFormat('en', {
            timeZone: POS_TIME_ZONE,
            year: 'numeric',
        }).format(new Date()),
    );
}
