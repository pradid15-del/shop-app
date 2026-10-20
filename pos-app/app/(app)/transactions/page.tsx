import { createClient } from '@/lib/supabase/server';
import type { Txn } from '@/lib/types';
import { TransactionsClient } from './transactions-client';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h1 className="font-bold">🧾 ธุรกรรม</h1>
      </div>
      {error && <div className="m-4 text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">โหลดข้อมูลไม่สำเร็จ: {error.message}</div>}
      <TransactionsClient txns={(data ?? []) as Txn[]} />
    </div>
  );
}
