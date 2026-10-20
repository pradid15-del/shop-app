'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { getStockStatus, type Movement, type StockRow } from '@/lib/types';
import { GettingStarted } from '@/components/getting-started';
import { onboardingSteps } from '@/lib/onboarding';

type Sheet =
  | { kind: 'in'; row: StockRow; qty?: number }
  | { kind: 'adjust'; row: StockRow }
  | null;

const REASONS = ['ของเสีย/ชำรุด', 'สินค้าหาย', 'นับสต๊อกผิดพลาด', 'อื่นๆ'];

// Restock target: double the minimum (at least min+1), so one trip refills past the alert line.
function suggestQty(r: StockRow): number {
  const target = Math.max(r.minStock * 2, r.minStock + 1, 1);
  return Math.max(1, target - r.stock);
}

export function InventoryClient({ rows, movements }: { rows: StockRow[]; movements: Movement[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [logExpense, setLogExpense] = useState(true);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const stats = rows.reduce(
    (a, r) => {
      const st = getStockStatus(r.stock, r.minStock).key;
      a.units += Math.max(0, r.stock);
      // Stock value uses cost only; rows with unknown cost are counted separately, not guessed.
      if (r.cost != null) a.value += Math.max(0, r.stock) * r.cost;
      else if (r.stock > 0) a.unknownCost += 1;
      if (st === 'low') a.low++;
      if (st === 'out') a.out++;
      return a;
    },
    { units: 0, value: 0, unknownCost: 0, low: 0, out: 0 }
  );

  const restock = rows
    .filter((r) => getStockStatus(r.stock, r.minStock).key !== 'ready')
    .sort((a, b) => a.stock - b.stock);

  function openIn(row: StockRow, suggested?: number) {
    setSheet({ kind: 'in', row, qty: suggested });
    setQty(suggested ? String(suggested) : '');
    setCost(row.cost != null ? String(row.cost) : '');
    setLogExpense(true);
    setNote('');
    setError(null);
  }
  function openAdjust(row: StockRow) {
    setSheet({ kind: 'adjust', row });
    setQty('');
    setReason(REASONS[0]);
    setNote('');
    setError(null);
  }

  async function post(url: string, body: unknown, okMsg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSheet(null);
      setFlash(okMsg); // shown only after the database confirmed
      router.refresh();
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!sheet) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) { setError('กรุณาระบุจำนวนเป็นจำนวนเต็มมากกว่า 0'); return; }
    if (sheet.kind === 'adjust' && n > sheet.row.stock) {
      setError(`ลดได้สูงสุด ${sheet.row.stock} ชิ้น (สต๊อกปัจจุบัน) — ห้ามติดลบ`);
      return;
    }
    if (sheet.kind === 'in') {
      post('/api/inventory/stock-in', {
        productId: sheet.row.productId, variantId: sheet.row.variantId, qty: n,
        unitCost: cost, note: note || null, logExpense,
      }, 'บันทึกรับสินค้าเข้าแล้ว');
    } else {
      post('/api/inventory/adjust', {
        productId: sheet.row.productId, variantId: sheet.row.variantId, qty: n, reason, note: note || null,
      }, 'บันทึกการปรับยอดแล้ว');
    }
  }

  async function cancelIn(m: Movement) {
    if (!confirm(`ยกเลิกการรับเข้า ${m.product_name} +${m.qty} ?`)) return;
    await post('/api/inventory/cancel-stock-in', { movementId: m.id }, 'ยกเลิกการรับเข้าแล้ว');
  }

  const input = 'w-full border border-border rounded-lg px-3 py-2.5 text-sm';

  return (
    <div className="p-4 space-y-5">
      {flash && <div className="text-sm text-income bg-incomeBg rounded-lg px-3 py-2 font-semibold">✓ {flash}</div>}
      {!sheet && error && <div className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="มูลค่าสต๊อก (ตามต้นทุน)" value={formatMoney(stats.value)} />
        <Stat label="จำนวนชิ้นรวม" value={stats.units.toLocaleString('th-TH')} />
        <Stat label="ใกล้หมด / หมด" value={`${stats.low} / ${stats.out}`} />
      </div>
      {stats.unknownCost > 0 && (
        <p className="text-[11px] text-warn bg-warnBg rounded-lg px-3 py-2">
          ⚠️ มี {stats.unknownCost} รายการที่ยังไม่ระบุต้นทุน จึงยังไม่นับรวมในมูลค่าสต๊อก
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-textSecondary">
        <Legend color="bg-income" text="ปกติ" />
        <Legend color="bg-warn" text="ใกล้หมด" />
        <Legend color="bg-expense" text="หมด" />
        <Legend color="bg-info" text="รับสินค้าเข้า" />
      </div>

      {restock.length > 0 && (
        <section>
          <h2 className="font-bold text-sm mb-2">🛒 ต้องซื้ออะไรบ้าง?</h2>
          <div className="space-y-2">
            {restock.map((r) => (
              <button
                key={`${r.productId}-${r.variantId}`}
                onClick={() => openIn(r, suggestQty(r))}
                className="w-full text-left bg-white border border-border rounded-xl px-3 py-2.5 flex items-center justify-between"
              >
                <span className="text-sm font-semibold truncate">{r.label}</span>
                <span className="text-sm font-serif font-bold text-info shrink-0 ml-2">+{suggestQty(r)}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(restock.map((r) => `${r.label} ${suggestQty(r)}`).join('\n')).then(() => { setFlash('คัดลอกรายการแล้ว'); setTimeout(() => setFlash(null), 2000); })}
            className="mt-2 text-xs text-accent font-semibold"
          >
            📋 คัดลอกรายการ
          </button>
        </section>
      )}

      <section>
        <h2 className="font-bold text-sm mb-2">📋 รายการสต๊อก</h2>
        <div className="space-y-2">
          {rows.map((r) => {
            const st = getStockStatus(r.stock, r.minStock);
            return (
              <div key={`${r.productId}-${r.variantId}`} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surfaceAlt overflow-hidden flex items-center justify-center shrink-0">
                  {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : '🛍️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.label}</div>
                  <div className="mt-0.5"><StatusBadge status={st.key} label={st.label} /></div>
                </div>
                <div className="text-center shrink-0">
                  <div className={`font-serif font-bold text-lg ${st.key !== 'ready' ? (st.key === 'out' ? 'text-expense' : 'text-warn') : ''}`}>{r.stock}</div>
                  <div className="text-[10px] text-textSecondary">ชิ้น</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => openIn(r)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-infoBg text-info">📥 รับเข้า</button>
                  <button onClick={() => openAdjust(r)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-expenseBg text-expense">📉 ปรับ</button>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <GettingStarted steps={onboardingSteps({ hasProducts: false, hasStock: false, hasSales: false })} title="คลังยังว่าง เริ่มตรงนี้" />
          )}
          {rows.length > 0 && rows.every((r) => r.stock <= 0) && (
            <GettingStarted steps={onboardingSteps({ hasProducts: true, hasStock: false, hasSales: false })} title="มีสินค้าแล้ว แต่ยังไม่มีสต๊อก" />
          )}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-sm mb-2">🕘 ประวัติการเคลื่อนไหว</h2>
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {movements.map((m) => {
            const action = m.type === 'in' ? 'รับเข้า' : m.type === 'out' ? 'ขาย' : m.reason || (m.type === 'reversal' ? 'ยกเลิก' : 'ปรับยอด');
            const canCancel = m.type === 'in' && !m.reversed_at;
            return (
              <div key={m.id} className="px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{m.variant_label ?? m.product_name}</div>
                  <div className="text-xs">
                    <span className="font-semibold">{m.before_qty} → {m.after_qty}</span>{' '}
                    <span className="text-textSecondary">{action} {m.qty > 0 ? '+' : ''}{m.qty}</span>
                    {m.reversed_at && <span className="text-textSecondary"> (ยกเลิกแล้ว)</span>}
                  </div>
                  <div className="text-[10.5px] text-textSecondary">{formatThaiDate(m.date)}{m.note ? ` · ${m.note}` : ''}</div>
                </div>
                {canCancel && (
                  <button onClick={() => cancelIn(m)} className="text-[11px] text-expense border border-expense rounded-lg px-2 py-1 shrink-0">ยกเลิก</button>
                )}
              </div>
            );
          })}
          {movements.length === 0 && <div className="text-center text-sm text-textSecondary py-8">ยังไม่มีประวัติ</div>}
        </div>
      </section>

      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => !busy && setSheet(null)}>
          <div className="w-full max-w-xl bg-white rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="font-bold">{sheet.kind === 'in' ? '📥 รับสินค้าเข้า' : '📉 ปรับยอด / ของเสีย'}</div>
              <div className="text-xs text-textSecondary">{sheet.row.label} · คงเหลือ {sheet.row.stock} ชิ้น</div>
            </div>
            <input className={input} inputMode="numeric" placeholder={sheet.kind === 'in' ? 'จำนวนที่รับเข้า' : 'จำนวนที่ลดออก'} value={qty} onChange={(e) => setQty(e.target.value)} />
            {sheet.kind === 'in' ? (
              <>
                <input className={input} inputMode="decimal" placeholder="ต้นทุนต่อชิ้น" value={cost} onChange={(e) => setCost(e.target.value)} />
                <label className="flex items-center justify-between text-sm">
                  <span>บันทึกเป็นรายจ่ายด้วย</span>
                  <input type="checkbox" className="w-5 h-5 accent-[#6C4CC7]" checked={logExpense} onChange={(e) => setLogExpense(e.target.checked)} />
                </label>
              </>
            ) : (
              <select className={input} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            )}
            <input className={input} placeholder="โน้ต (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <div className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setSheet(null)} disabled={busy} className="flex-1 border border-border rounded-xl py-3 font-semibold">ยกเลิก</button>
              <button onClick={submit} disabled={busy} className="flex-[2] bg-accent text-white rounded-xl py-3 font-bold disabled:opacity-60">
                {busy ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-xl py-2 px-1">
      <div className="text-[10px] text-textSecondary leading-tight">{label}</div>
      <div className="font-serif font-bold text-[15px] mt-0.5">{value}</div>
    </div>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><i className={`w-2 h-2 rounded-full ${color}`} />{text}</span>;
}
