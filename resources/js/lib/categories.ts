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

export function categoryBadgeClass(category: string): string {
    switch (normalizeCategory(category).toLowerCase()) {
        case 'beer':
            return 'bg-amber-600 text-white';
        case 'drinks':
            return 'bg-sky-600 text-white';
        case 'glove':
        case 'gloves':
            return 'bg-violet-600 text-white';
        case 'snacks':
            return 'bg-orange-600 text-white';
        case 'sets':
            return 'bg-teal-600 text-white';
        default:
            return 'bg-emerald-700 text-white';
    }
}
