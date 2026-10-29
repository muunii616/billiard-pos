import { formatMoney, roundMoney } from '@/lib/payments';

export type TimeBlock = {
    minutes: number;
    price: number;
    label: string;
    key: string;
};

/** Counts keyed by block minutes string, e.g. { "60": 1, "15": 2 }. */
export type TimeBlockCounts = Record<string, number>;

export const DEFAULT_TIME_BLOCKS: TimeBlock[] = [
    { minutes: 60, price: 20000, label: '1 hour', key: '60' },
    { minutes: 30, price: 10000, label: '30 min', key: '30' },
    { minutes: 15, price: 5000, label: '15 min', key: '15' },
];

export function emptyBlockCounts(
    blocks: TimeBlock[] = DEFAULT_TIME_BLOCKS,
): TimeBlockCounts {
    return Object.fromEntries(blocks.map((block) => [block.key, 0]));
}

/** Merge stored session counts into a full picker map (missing keys = 0). */
export function countsFromStored(
    stored: Record<string, number> | null | undefined,
    blocks: TimeBlock[] = DEFAULT_TIME_BLOCKS,
): TimeBlockCounts {
    const counts = emptyBlockCounts(blocks);

    if (!stored) {
        return counts;
    }

    for (const block of blocks) {
        const raw =
            stored[block.key] ??
            stored[String(block.minutes)] ??
            (stored as Record<number, number>)[block.minutes] ??
            0;
        counts[block.key] = Math.max(0, Math.floor(Number(raw) || 0));
    }

    return counts;
}

export function totalForBlockCounts(
    counts: TimeBlockCounts,
    blocks: TimeBlock[] = DEFAULT_TIME_BLOCKS,
): number {
    return roundMoney(
        blocks.reduce(
            (sum, block) =>
                sum + block.price * (Number(counts[block.key]) || 0),
            0,
        ),
    );
}

export function totalMinutesForBlockCounts(
    counts: TimeBlockCounts,
    blocks: TimeBlock[] = DEFAULT_TIME_BLOCKS,
): number {
    return blocks.reduce(
        (sum, block) => sum + block.minutes * (Number(counts[block.key]) || 0),
        0,
    );
}

export function bumpBlockCount(
    counts: TimeBlockCounts,
    key: string,
    delta: number,
): TimeBlockCounts {
    const next = { ...counts };
    next[key] = Math.max(0, (Number(next[key]) || 0) + delta);

    return next;
}

export function formatBlockSummary(
    counts: TimeBlockCounts,
    blocks: TimeBlock[] = DEFAULT_TIME_BLOCKS,
    money: (value: number) => string = formatMoney,
): string {
    const parts = blocks
        .filter((block) => (Number(counts[block.key]) || 0) > 0)
        .map(
            (block) =>
                `${counts[block.key]}× ${block.label} (${money(block.price * (counts[block.key] || 0))})`,
        );

    return parts.length > 0 ? parts.join(' · ') : 'No time blocks';
}

export function formatCountdown(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (h > 0) {
        return `${pad(h)}:${pad(m)}:${pad(sec)}`;
    }

    return `${pad(m)}:${pad(sec)}`;
}

/** Play a short repeating beep using Web Audio (no asset required). */
export function playAlertBeep(
    audioContext?: AudioContext | null,
): AudioContext | null {
    try {
        const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!Ctx) {
            return audioContext ?? null;
        }

        const ctx =
            audioContext && audioContext.state !== 'closed'
                ? audioContext
                : new Ctx();

        if (ctx.state === 'suspended') {
            void ctx.resume();
        }

        const now = ctx.currentTime;

        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, now + i * 0.28);
            gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.28 + 0.02);
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                now + i * 0.28 + 0.18,
            );
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.28);
            osc.stop(now + i * 0.28 + 0.2);
        }

        return ctx;
    } catch {
        return audioContext ?? null;
    }
}
