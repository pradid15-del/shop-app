import { createClient } from '@/lib/supabase/server';
import { toStockRows, type Product, type Movement } from '@/lib/types';
import { InventoryClient } from './inventory-client';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const supabase = createClient();
  const [{ data: products, error: pErr }, { data: movements, error: mErr }] = await Promise.all([
    supabase.from('products').select('*, product_variants(*)').eq('active', true).order('name'),
    supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(60),
  ]);

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h1 className="font-bold">📦 คลังสินค้า</h1>
      </div>
      {(pErr || mErr) && (
        <div className="m-4 text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">
          โหลดข้อมูลไม่สำเร็จ: {(pErr || mErr)!.message}
        </div>
      )}
      <InventoryClient rows={toStockRows((products ?? []) as Product[])} movements={(movements ?? []) as Movement[]} />
    </div>
  );
}
