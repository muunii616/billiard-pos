import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/payments';
import {
    bumpBlockCount,
    emptyBlockCounts,
    formatBlockSummary,
    totalForBlockCounts,
    totalMinutesForBlockCounts,
} from '@/lib/time-blocks';
import type { TimeBlock, TimeBlockCounts } from '@/lib/time-blocks';

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
    const { t } = useI18n();
    const money = formatMoney;
    const timeTotal = totalForBlockCounts(counts, blocks);
    const minutes = totalMinutesForBlockCounts(counts, blocks);

    return (
        <div className="min-w-0 space-y-3 rounded-lg border border-border/70 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
                <div className="text-sm font-medium">
                    {t('Table time blocks')}
                </div>
                <div className="text-right font-semibold tabular-nums">
                    {money(timeTotal)}
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                    {t('Stack 1h / 30m / 15m. Play clock is only a hint.')}{' '}
                    {minutes > 0
                        ? t('{minutes} min billed', { minutes })
                        : t('No blocks')}
                </div>
            </div>
            {playedLabel ? (
                <div className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                    {t('Played {time}', { time: playedLabel })}
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
                                    {t(block.label)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {t('{price} each', {
                                        price: money(block.price),
                                    })}
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
                                            bumpBlockCount(
                                                counts,
                                                block.key,
                                                -1,
                                            ),
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
                                            bumpBlockCount(
                                                counts,
                                                block.key,
                                                1,
                                            ),
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
                    {t('Clear')}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                {formatBlockSummary(counts, blocks, money) === 'No time blocks'
                    ? t('No time blocks')
                    : blocks
                          .filter(
                              (block) => (Number(counts[block.key]) || 0) > 0,
                          )
                          .map(
                              (block) =>
                                  `${counts[block.key]}× ${t(block.label)} (${money(block.price * (counts[block.key] || 0))})`,
                          )
                          .join(' · ')}
            </p>
        </div>
    );
}
