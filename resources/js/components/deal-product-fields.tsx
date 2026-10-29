import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type DealBaseProduct = {
    id: number;
    name: string;
    price: string;
    cost_price?: string;
};

type SharedDealFields = {
    baseProducts: DealBaseProduct[];
    buyQty: string;
    getQty: string;
    startsOn: string;
    endsOn: string;
    error?: string;
    onPreset: (buy: number, get: number) => void;
    onStartsChange: (value: string) => void;
    onEndsChange: (value: string) => void;
};

type SingleDealFields = SharedDealFields & {
    multiple?: false;
    dealProductId: string;
    onBaseChange: (productId: string, base?: DealBaseProduct) => void;
    selectedIds?: never;
    onSelectedIdsChange?: never;
};

type MultiDealFields = SharedDealFields & {
    multiple: true;
    selectedIds: string[];
    onSelectedIdsChange: (ids: string[]) => void;
    dealProductId?: never;
    onBaseChange?: never;
};

type DealFieldsProps = SingleDealFields | MultiDealFields;

function DealRatioAndDates({
    buyQty,
    getQty,
    startsOn,
    endsOn,
    onPreset,
    onStartsChange,
    onEndsChange,
}: Pick<
    SharedDealFields,
    | 'buyQty'
    | 'getQty'
    | 'startsOn'
    | 'endsOn'
    | 'onPreset'
    | 'onStartsChange'
    | 'onEndsChange'
>) {
    return (
        <>
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Deal
                </label>
                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            [1, 1],
                            [2, 1],
                            [2, 2],
                        ] as const
                    ).map(([buy, get]) => (
                        <Button
                            key={`${buy}+${get}`}
                            type="button"
                            size="sm"
                            variant={
                                buyQty === String(buy) && getQty === String(get)
                                    ? 'default'
                                    : 'outline'
                            }
                            onClick={() => onPreset(buy, get)}
                        >
                            {buy}+{get}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Starts
                    </label>
                    <Input
                        type="date"
                        value={startsOn}
                        onChange={(e) => onStartsChange(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Ends
                    </label>
                    <Input
                        type="date"
                        value={endsOn}
                        onChange={(e) => onEndsChange(e.target.value)}
                    />
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Leave dates empty to keep the deal on until you remove it.
            </p>
        </>
    );
}

export function DealProductFields(props: DealFieldsProps) {
    const {
        baseProducts,
        buyQty,
        getQty,
        startsOn,
        endsOn,
        error,
        onPreset,
        onStartsChange,
        onEndsChange,
    } = props;

    if (props.multiple) {
        const selected = new Set(props.selectedIds);
        const allSelected =
            baseProducts.length > 0 &&
            baseProducts.every((product) => selected.has(String(product.id)));

        const toggle = (id: string, checked: boolean) => {
            const next = new Set(props.selectedIds);

            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }

            props.onSelectedIdsChange(Array.from(next));
        };

        const toggleAll = (checked: boolean) => {
            props.onSelectedIdsChange(
                checked
                    ? baseProducts.map((product) => String(product.id))
                    : [],
            );
        };

        return (
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Products for deal
                        </label>
                        <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => toggleAll(!allSelected)}
                        >
                            {allSelected ? 'Clear all' : 'Select all'}
                        </button>
                    </div>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                        {baseProducts.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-muted-foreground">
                                No base products available.
                            </p>
                        ) : (
                            baseProducts.map((product) => {
                                const id = String(product.id);
                                const checked = selected.has(id);

                                return (
                                    <label
                                        key={product.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1.5 hover:bg-muted/60"
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={(value) =>
                                                toggle(id, value === true)
                                            }
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm">
                                            {product.name}
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                            {product.price}
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {selected.size === 0
                            ? 'Select one or more products. Same deal applies to each.'
                            : `${selected.size} selected — each gets its own ${buyQty}+${getQty} deal at its unit price.`}
                    </p>
                    {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                    ) : null}
                </div>
                <DealRatioAndDates
                    buyQty={buyQty}
                    getQty={getQty}
                    startsOn={startsOn}
                    endsOn={endsOn}
                    onPreset={onPreset}
                    onStartsChange={onStartsChange}
                    onEndsChange={onEndsChange}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Product for deal
                </label>
                <Select
                    value={props.dealProductId || undefined}
                    onValueChange={(value) => {
                        const base = baseProducts.find(
                            (p) => String(p.id) === value,
                        );
                        props.onBaseChange(value, base);
                    }}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose product" />
                    </SelectTrigger>
                    <SelectContent>
                        {baseProducts.map((product) => (
                            <SelectItem
                                key={product.id}
                                value={String(product.id)}
                            >
                                {product.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                ) : null}
            </div>
            <DealRatioAndDates
                buyQty={buyQty}
                getQty={getQty}
                startsOn={startsOn}
                endsOn={endsOn}
                onPreset={onPreset}
                onStartsChange={onStartsChange}
                onEndsChange={onEndsChange}
            />
        </div>
    );
}
