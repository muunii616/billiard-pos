type InventoryProduct = {
    id: number;
    name: string;
    stock_quantity: number;
    is_deal?: boolean;
    deal_active?: boolean;
    deal_product_id?: number | null;
    deal_buy_qty?: number | null;
    deal_get_qty?: number | null;
};

type InventoryCartItem = { productId: number; quantity: number };

/** Check shared base stock, including the free units in every deal package. */
export function cartInventoryError(
    products: InventoryProduct[],
    cart: InventoryCartItem[],
): string | null {
    const catalog = new Map(products.map((product) => [product.id, product]));
    const requested = new Map<number, number>();

    for (const item of cart) {
        if (item.quantity <= 0) {
            continue;
        }

        const product = catalog.get(item.productId);

        if (!product) {
            return 'One or more products are missing from inventory.';
        }

        if (product.is_deal && product.deal_active === false) {
            return 'This Special deal is not active today.';
        }

        const baseId = product.is_deal ? product.deal_product_id : product.id;
        const base = baseId == null ? undefined : catalog.get(baseId);

        if (!base) {
            return 'One or more products are missing from inventory.';
        }

        const packageSize = product.is_deal
            ? Number(product.deal_buy_qty) + Number(product.deal_get_qty)
            : 1;
        const units =
            (requested.get(base.id) ?? 0) + item.quantity * packageSize;
        requested.set(base.id, units);

        if (units > base.stock_quantity) {
            return `Not enough stock for ${base.name}. Available: ${base.stock_quantity}, requested: ${units}.`;
        }
    }

    return null;
}
