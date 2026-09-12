import { formatCurrency } from '@repo/utils'

/**
 * Shirt type as served by the public retreat endpoint and the admin API
 * (price may arrive as a SQLite decimal string; Number() normalizes both).
 */
export type PricedShirtType = {
  id: string
  name: string
  price?: number | string | null
  sizePrices?: { size: string; price: number | string }[] | null
}

/**
 * Effective price of one size: a per-size override wins over the type's base
 * price — the client-side mirror of the server's COALESCE(override, price, 0).
 * Returns null when there is no charge (>0) so callers render no suffix,
 * identical to the pre-pricing UI.
 */
export function effectiveShirtPrice(t: PricedShirtType, size: string): number | null {
  const override = (t.sizePrices || []).find((p) => p.size === size)
  const price = Number(override ? override.price : t.price)
  return Number.isFinite(price) && price > 0 ? price : null
}

/**
 * Dropdown/summary label for a size: "XXL — $250.00" when the size carries a
 * charge, the bare size otherwise.
 */
export function shirtSizeLabel(t: PricedShirtType, size: string): string {
  const price = effectiveShirtPrice(t, size)
  return price != null ? `${size} — ${formatCurrency(price)}` : size
}
