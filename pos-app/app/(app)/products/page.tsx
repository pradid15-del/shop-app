import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/status-badge';
import { formatMoney } from '@/lib/format';
import { effectivePrice, getStockStatus, type Product, type Variant } from '@/lib/types';
import { GettingStarted } from '@/components/getting-started';
import { onboardingSteps } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

const SEVERITY = { ready: 0, low: 1, out: 2 } as const;

function range(nums: number[]): string {
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? formatMoney(lo) : `${formatMoney(lo)}–${formatMoney(hi)}`;
}

export default async function ProductsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('active', true)
    .order('name');
  const products = (data ?? []) as Product[];

  return (
    <div>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h1 className="font-bold">สินค้า</h1>
        <Link href="/products/new" className="bg-accent text-white text-sm font-semibold rounded-lg px-3 py-1.5">
          + เพิ่มสินค้า
        </Link>
      </div>

      {error && <div className="m-4 text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">โหลดสินค้าไม่สำเร็จ: {error.message}</div>}

      <div className="p-4 space-y-2">
        {products.map((p) => {
          const rows: (Product | Variant)[] = p.has_variants ? p.product_variants ?? [] : [p];
          const prices = rows.map((r) => effectivePrice(r as any));
          const stock = rows.reduce((s, r) => s + (r.stock || 0), 0);
          // Profit/unit only from rows whose cost is known — never guess.
          const profits = rows.filter((r) => r.cost != null).map((r) => effectivePrice(r as any) - Number(r.cost));
          let worst: 'ready' | 'low' | 'out' = rows.length ? 'ready' : 'out';
          for (const r of rows) {
            const s = getStockStatus(r.stock, r.min_stock).key;
            if (SEVERITY[s] > SEVERITY[worst]) worst = s;
          }
          const label = worst === 'out' ? 'หมด' : worst === 'low' ? 'ใกล้หมด' : 'พร้อมขาย';

          return (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="bg-white border border-border rounded-xl p-3 flex items-center gap-3 active:scale-[0.99]"
            >
              <div className="w-12 h-12 rounded-xl bg-surfaceAlt overflow-hidden flex items-center justify-center text-xl shrink-0">
                {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : '🛍️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{p.name}</div>
                <div className="text-[13px] font-semibold mt-0.5">
                  {prices.length ? range(prices) : '—'} · เหลือ <span className="font-serif font-bold">{stock}</span> ชิ้น
                </div>
                {profits.length > 0 && (
                  <div className="text-xs font-semibold text-income mt-0.5">กำไร/ชิ้น {range(profits)}</div>
                )}
              </div>
              <StatusBadge status={worst} label={label} />
            </Link>
          );
        })}
        {products.length === 0 && !error && (
          <GettingStarted steps={onboardingSteps({ hasProducts: false, hasStock: false, hasSales: false })} title="ยังไม่มีสินค้า เริ่มตรงนี้" />
        )}
      </div>
    </div>
  );
}
