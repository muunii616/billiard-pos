import { Button } from '@/components/ui/button';
import {
    bumpBlockCount,
    emptyBlockCounts,
    formatBlockSummary,
    totalForBlockCounts,
    totalMinutesForBlockCounts,
    type TimeBlock,
    type TimeBlockCounts,
} from '@/lib/time-blocks';
import { formatMoney } from '@/lib/payments';

export function TimeBlockPicker({
    blocks,
    counts,
    onChange,
    playedLabel,
}: {
    blocks: TimeBlock[];
    counts: TimeBlockCounts;
    onChange: (counts: TimeBlockCounts) => void;
    playedLabel?: string | null;
}) {
    const money = formatMoney;
    const timeTotal = totalForBlockCounts(counts, blocks);
    const minutes = totalMinutesForBlockCounts(counts, blocks);

    return (
        <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-medium">Table time blocks</div>
                    <div className="text-xs text-muted-foreground">
                        Stack 1h / 30m / 15m. Play clock is only a hint.
                    </div>
                </div>
                <div className="text-right">
                    <div className="font-semibold tabular-nums">
                        {money(timeTotal)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {minutes > 0 ? `${minutes} min billed` : 'No blocks'}
                    </div>
                </div>
            </div>
            {playedLabel ? (
                <div className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                    Played {playedLabel}
                </div>
            ) : null}
            <div className="grid gap-2">
                {blocks.map((block) => {
                    const count = Number(counts[block.key]) || 0;

                    return (
                        <div
                            key={block.key}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-2"
                        >
                            <div>
                                <div className="text-sm font-medium">
                                    {block.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {money(block.price)} each
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8"
                                    onClick={() =>
                                        onChange(
                                            bumpBlockCount(counts, block.key, -1),
                                        )
                                    }
                                    disabled={count <= 0}
                                >
                                    −
                                </Button>
                                <span className="w-6 text-center tabular-nums">
                                    {count}
                                </span>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8"
                                    onClick={() =>
                                        onChange(
                                            bumpBlockCount(counts, block.key, 1),
                                        )
                                    }
                                >
                                    +
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-1.5">
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onChange(emptyBlockCounts(blocks))}
                >
                    Clear
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                {formatBlockSummary(counts, blocks, money)}
            </p>
        </div>
    );
}
