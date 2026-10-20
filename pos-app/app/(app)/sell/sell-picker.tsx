'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { formatMoney } from '@/lib/format';
import { getStockStatus, type StockRow } from '@/lib/types';
import { GettingStarted } from '@/components/getting-started';
import { onboardingSteps } from '@/lib/onboarding';

export function SellPicker({ rows }: { rows: StockRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<StockRow | null>(null);
  const [qty, setQty] = useState(1);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !s || r.label.toLowerCase().includes(s) || (r.itemCode ?? '').toLowerCase().includes(s));
  }, [rows, q]);

  function open(r: StockRow) {
    setSel(r);
    setQty(1);
    setReceived('');
    setError(null);
  }

  const total = sel ? sel.price * qty : 0;
  const recvNum = received.trim() === '' ? null : Number(received);
  // Same rule as the original app: leaving "received" empty means "no change calculation needed";
  // once an amount is typed it must cover the total before the sale can be confirmed.
  const insufficient = recvNum !== null && (!isFinite(recvNum) || recvNum < total);
  const change = recvNum !== null && isFinite(recvNum) && recvNum >= total ? recvNum - total : null;

  async function confirm() {
    if (!sel || busy) return;
    if (insufficient) { setError('รับเงินไม่พอ'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: sel.productId, variantId: sel.variantId, qty, unitPrice: sel.price }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      // Only now — after the database confirmed — do we show success.
      setDone(`ขายแล้ว ${formatMoney(total)}` + (change !== null ? ` · เงินทอน ${formatMoney(change)}` : ''));
      setSel(null);
      router.refresh();
      setTimeout(() => setDone(null), 3500);
    } catch (e: any) {
      setError(e.message || 'บันทึกการขายไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  // Nothing sellable yet: teach the next step instead of showing an empty list.
  if (!rows.some((r) => r.stock > 0)) {
    return (
      <div className="p-4">
        <GettingStarted
          steps={onboardingSteps({ hasProducts: rows.length > 0, hasStock: false, hasSales: false })}
          title={rows.length === 0 ? 'ยังไม่มีสินค้าให้ขาย' : 'สินค้ายังไม่มีสต๊อก'}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 ค้นหาชื่อสินค้าหรือรหัส..."
        className="w-full border border-border rounded-xl px-4 py-3 bg-white text-sm"
      />

      {done && <div className="mt-3 text-sm text-income bg-incomeBg rounded-lg px-3 py-2 font-semibold">✓ {done}</div>}

      <div className="mt-3 space-y-2">
        {list.map((r) => {
          const st = getStockStatus(r.stock, r.minStock);
          const disabled = r.stock <= 0;
          return (
            <button
              key={`${r.productId}-${r.variantId}`}
              disabled={disabled}
              onClick={() => open(r)}
              className="w-full text-left bg-white border border-border rounded-xl p-3 flex items-center gap-3 disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-lg bg-surfaceAlt overflow-hidden flex items-center justify-center shrink-0">
                {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : '🛍️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{r.label}</div>
                <div className="text-xs text-textSecondary">เหลือ {r.stock} ชิ้น</div>
              </div>
              <div className="text-right">
                <div className="font-serif font-bold text-sm">{formatMoney(r.price)}</div>
                <StatusBadge status={st.key} label={st.label} />
              </div>
            </button>
          );
        })}
        {list.length === 0 && <div className="text-center text-sm text-textSecondary py-10">ไม่พบสินค้า</div>}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => !busy && setSel(null)}>
          <div className="w-full max-w-xl bg-white rounded-t-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="font-bold">{sel.label}</div>
              <div className="text-xs text-textSecondary">{formatMoney(sel.price)} / ชิ้น · เหลือ {sel.stock} ชิ้น</div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-full border border-border text-xl"
              >−</button>
              <div className="font-serif font-bold text-3xl w-12 text-center">{qty}</div>
              <button
                onClick={() => {
                  if (qty >= sel.stock) { setError('สินค้าคงเหลือไม่เพียงพอ'); return; }
                  setError(null);
                  setQty((q) => q + 1);
                }}
                disabled={qty >= sel.stock}
                className="w-11 h-11 rounded-full border border-border text-xl disabled:opacity-40"
              >+</button>
            </div>

            <div className="flex justify-between items-center bg-incomeBg rounded-xl px-4 py-3">
              <span className="text-sm font-semibold text-textSecondary">ยอดรวม</span>
              <span className="font-serif font-bold text-xl text-income">{formatMoney(total)}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textSecondary mb-1">💰 รับเงินจากลูกค้า (ไม่บังคับ)</label>
              <input
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder="0.00"
                className="w-full border border-border rounded-lg px-3 py-2.5"
              />
            </div>
            {change !== null && (
              <div className="flex justify-between bg-incomeBg rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-textSecondary">เงินทอน</span>
                <span className="font-serif font-bold text-lg text-income">{formatMoney(change)}</span>
              </div>
            )}
            {insufficient && (
              <div className="flex justify-between bg-expenseBg rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-expense">รับเงินไม่พอ ขาดอีก</span>
                <span className="font-serif font-bold text-expense">{formatMoney(total - (recvNum && isFinite(recvNum) ? recvNum : 0))}</span>
              </div>
            )}

            {error && <div className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</div>}

            <div className="flex gap-3">
              <button onClick={() => setSel(null)} disabled={busy} className="flex-1 border border-border rounded-xl py-3 font-semibold">ยกเลิก</button>
              <button
                onClick={confirm}
                disabled={busy || insufficient}
                className="flex-[2] bg-accent text-white rounded-xl py-3 font-bold disabled:opacity-50"
              >
                {busy ? 'กำลังบันทึก...' : '✓ ยืนยันการขาย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
