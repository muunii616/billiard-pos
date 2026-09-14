export function normalizeCategory(raw: string | null | undefined): string {
    const value = (raw ?? '').trim().replace(/\s+/g, ' ');

    switch (value.toLowerCase()) {
        case 'drink':
        case 'drinks':
            return 'Drinks';
        case 'snack':
        case 'snacks':
            return 'Snacks';
        case 'set':
        case 'sets':
        case 'combo':
        case 'combos':
            return 'Sets';
        default:
            return (
                value
                    .split(' ')
                    .map(
                        (word) =>
                            word.charAt(0).toUpperCase() +
                            word.slice(1).toLowerCase(),
                    )
                    .join(' ') || 'Other'
            );
    }
}
