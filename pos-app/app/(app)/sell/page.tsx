import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { toStockRows, type Product } from '@/lib/types';
import { SellPicker } from './sell-picker';

export const dynamic = 'force-dynamic';

export default async function SellPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('active', true)
    .order('name');
  const rows = toStockRows((data ?? []) as Product[]);

  return (
    <div>
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <Link href="/" className="text-textSecondary">‹ กลับ</Link>
        <h1 className="font-bold">⚡ ขายสินค้า</h1>
      </div>
      {error && <div className="m-4 text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">โหลดสินค้าไม่สำเร็จ: {error.message}</div>}
      <SellPicker rows={rows} />
    </div>
  );
}
