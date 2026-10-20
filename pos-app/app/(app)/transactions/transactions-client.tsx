'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, formatThaiDate } from '@/lib/format';
import Link from 'next/link';
import type { Txn } from '@/lib/types';

export function TransactionsClient({ txns }: { txns: Txn[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function cancel(t: Txn) {
    if (!confirm('ยกเลิกรายการขายนี้? สต๊อกจะถูกคืนให้อัตโนมัติ และประวัติเดิมจะยังถูกเก็บไว้')) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch('/api/transactions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: t.id, reason: 'ยกเลิกโดยผู้ใช้' }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setFlash('ยกเลิกรายการขายและคืนสต๊อกแล้ว');
      router.refresh();
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      setError(e.message || 'ยกเลิกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 space-y-2">
      {flash && <div className="text-sm text-income bg-incomeBg rounded-lg px-3 py-2 font-semibold">✓ {flash}</div>}
      {error && <div className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</div>}

      {txns.map((t) => {
        const cancelled = t.status === 'cancelled';
        const isSale = t.type === 'income' && t.product_id && t.qty;
        return (
          <div key={t.id} className={`bg-white border border-border rounded-xl p-3 flex items-center gap-3 ${cancelled ? 'opacity-60' : ''}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${t.type === 'income' ? 'bg-incomeBg text-income' : 'bg-expenseBg text-expense'}`}>
              {t.type === 'income' ? '↑' : '↓'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{t.category}</div>
              <div className="text-xs text-textSecondary truncate">{formatThaiDate(t.date)}{t.note ? ` · ${t.note}` : ''}</div>
              {cancelled && <div className="text-[10.5px] text-expense font-semibold">ยกเลิกแล้ว</div>}
            </div>
            <div className="text-right shrink-0">
              <div className={`font-serif font-bold text-sm ${cancelled ? 'line-through text-textSecondary' : t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
              </div>
              {isSale && !cancelled && (
                <button
                  onClick={() => cancel(t)}
                  disabled={busyId === t.id}
                  className="mt-1 text-[11px] text-expense border border-expense rounded-lg px-2 py-0.5 disabled:opacity-50"
                >
                  {busyId === t.id ? '...' : 'ยกเลิกการขาย'}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {txns.length === 0 && (
        <div className="bg-white border border-border rounded-2xl p-6 text-center space-y-3">
          <div className="text-3xl">🧾</div>
          <div className="font-semibold text-sm">ยังไม่มีธุรกรรม</div>
          <p className="text-xs text-textSecondary">ทุกการขายและการรับสินค้าเข้าจะมาแสดงที่นี่อัตโนมัติ</p>
          <Link href="/sell" className="inline-block bg-accent text-white text-sm font-semibold rounded-lg px-4 py-2">⚡ เริ่มขาย</Link>
        </div>
      )}
    </div>
  );
}
