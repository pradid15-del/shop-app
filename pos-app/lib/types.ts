export type Variant = {
  id: string;
  product_id: string;
  item_code: string | null;
  color: string | null;
  size: string | null;
  normal_price: number;
  sale_price: number | null;
  cost: number | null;
  stock: number;
  min_stock: number;
};

export type Product = {
  id: string;
  name: string;
  category: string | null;
  has_variants: boolean;
  item_code: string | null;
  normal_price: number | null;
  sale_price: number | null;
  cost: number | null;
  stock: number;
  min_stock: number;
  image_url: string | null;
  active: boolean;
  product_variants?: Variant[];
};

export type Txn = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  note: string | null;
  product_id: string | null;
  variant_id: string | null;
  qty: number | null;
  cost: number | null;
  status: 'active' | 'cancelled';
  created_at: string;
};

export type Movement = {
  id: string;
  date: string;
  product_name: string;
  variant_label: string | null;
  type: 'in' | 'out' | 'adjust' | 'reversal';
  qty: number;
  before_qty: number;
  after_qty: number;
  reason: string | null;
  note: string | null;
  reversed_at: string | null;
  created_at: string;
};

// A sellable/stockable unit: the product itself, or one of its variants.
export type StockRow = {
  productId: string;
  variantId: string | null;
  label: string;
  stock: number;
  minStock: number;
  price: number;        // effective (post-promo) selling price
  cost: number | null;
  itemCode: string | null;
  imageUrl: string | null;
};

export type StockStatusKey = 'ready' | 'low' | 'out';

// The price a customer actually pays. A promo price that isn't lower than the
// normal price is ignored rather than trusted.
export function effectivePrice(row: { normal_price: number | null; sale_price: number | null }): number {
  const normal = Number(row.normal_price) || 0;
  const sale = Number(row.sale_price);
  return sale > 0 && sale < normal ? sale : normal;
}

export function getStockStatus(stock: number, minStock: number): { key: StockStatusKey; label: string } {
  if (stock <= 0) return { key: 'out', label: 'หมด' };
  if (stock <= minStock) return { key: 'low', label: 'ใกล้หมด' };
  return { key: 'ready', label: 'พร้อมขาย' };
}

export function variantLabel(v: Pick<Variant, 'color' | 'size'>): string {
  const parts = [v.color, v.size].filter(Boolean);
  return parts.length ? parts.join(' - ') : 'ไม่ระบุ';
}

export function toStockRows(products: Product[]): StockRow[] {
  const rows: StockRow[] = [];
  for (const p of products) {
    if (p.has_variants) {
      for (const v of p.product_variants ?? []) {
        rows.push({
          productId: p.id,
          variantId: v.id,
          label: `${p.name} · ${variantLabel(v)}`,
          stock: v.stock,
          minStock: v.min_stock,
          price: effectivePrice(v),
          cost: v.cost,
          itemCode: v.item_code,
          imageUrl: p.image_url,
        });
      }
    } else {
      rows.push({
        productId: p.id,
        variantId: null,
        label: p.name,
        stock: p.stock,
        minStock: p.min_stock,
        price: effectivePrice(p),
        cost: p.cost,
        itemCode: p.item_code,
        imageUrl: p.image_url,
      });
    }
  }
  return rows;
}
