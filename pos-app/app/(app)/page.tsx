import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { formatMoney, todayISO } from '@/lib/format';
import { getStockStatus, toStockRows, type Product, type Txn } from '@/lib/types';
import { GettingStarted } from '@/components/getting-started';
import { allDone, onboardingSteps } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const p = (x: number) => String(x).padStart(2, '0');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

export default async function DashboardPage() {
  const supabase = createClient();
  let txns: Txn[] = [];
  let loadError: string | null = null;
  try {
    txns = await fetchAll<Txn>((from, to) =>
      supabase.from('transactions').select('*').eq('status', 'active').order('created_at').range(from, to)
    );
  } catch (e: any) {
    loadError = e.message;
  }

  // Where is this shop in the first-use journey? Real data decides, not a flag.
  const { data: prods } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('active', true);
  const stockRows = toStockRows((prods ?? []) as Product[]);
  const hasProducts = (prods ?? []).length > 0;
  const hasStock = stockRows.some((r) => r.stock > 0);
  let outCount = 0, lowCount = 0;
  for (const r of stockRows) {
    const k = getStockStatus(r.stock, r.minStock).key;
    if (k === 'out') outCount++;
    else if (k === 'low') lowCount++;
  }
  const hasSales = txns.some((t) => t.type === 'income' && t.product_id);
  const guideState = { hasProducts, hasStock, hasSales };

  const month = todayISO().slice(0, 7);
  let allIn = 0, allOut = 0, monthIn = 0, monthOut = 0, monthGross = 0, unknownCostRevenue = 0;
  const dayIn: Record<string, number> = {};
  const dayOut: Record<string, number> = {};

  for (const t of txns) {
    const amt = Number(t.amount) || 0;
    const inMonth = t.date.slice(0, 7) === month;
    if (t.type === 'income') {
      allIn += amt;
      dayIn[t.date] = (dayIn[t.date] ?? 0) + amt;
      if (inMonth) {
        monthIn += amt;
        // Revenue with no known cost is NOT profit — report it separately.
        if (t.cost != null) monthGross += amt - Number(t.cost);
        else unknownCostRevenue += amt;
      }
    } else {
      allOut += amt;
      dayOut[t.date] = (dayOut[t.date] ?? 0) + amt;
      if (inMonth) monthOut += amt;
    }
  }

  // "เงินคงเหลือ" = all money in − all money out (cash flow). It is NOT profit.
  const balance = allIn - allOut;
  const days = lastNDays(7);
  const maxBar = Math.max(1, ...days.map((d) => Math.max(dayIn[d] ?? 0, dayOut[d] ?? 0)));

  return (
    <div className="px-4 pt-6">
      {loadError && (
        <div className="mb-4 text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">
          โหลดข้อมูลไม่สำเร็จ: {loadError} — ตัวเลขด้านล่างอาจไม่ครบ
        </div>
      )}

      {!allDone(guideState) && (
        <div className="mb-5">
          <GettingStarted steps={onboardingSteps(guideState)} />
        </div>
      )}

      <div className="text-center">
        <div className="text-sm font-semibold text-textSecondary">เงินคงเหลือ</div>
        <div className={`font-serif font-bold text-[40px] leading-tight ${balance < 0 ? 'text-expense' : ''}`}>
          {formatMoney(balance)}
        </div>
        <div className="text-[11px] text-textSecondary">เงินเข้า − เงินออก สะสมทั้งหมด</div>
      </div>

      <div className="mt-5 flex items-stretch justify-around border-t border-b border-border py-3 text-center">
        <Metric label="เงินเข้า (เดือนนี้)" value={formatMoney(monthIn)} className="text-income" />
        <div className="w-px bg-border" />
        <Metric label="เงินออก (เดือนนี้)" value={formatMoney(monthOut)} className="text-expense" />
        <div className="w-px bg-border" />
        <Metric label="กำไรขั้นต้น" value={formatMoney(monthGross)} className={monthGross < 0 ? 'text-expense' : 'text-income'} />
      </div>

      {unknownCostRevenue > 0 && (
        <div className="mt-3 text-[11px] text-warn bg-warnBg rounded-lg px-3 py-2 leading-relaxed">
          ⚠️ มียอดขาย {formatMoney(unknownCostRevenue)} ที่ยังไม่ทราบต้นทุน จึงยังไม่นับรวมในกำไร
        </div>
      )}

      <div className="mt-5 flex items-end justify-between gap-2 h-20 max-w-sm mx-auto">
        {days.map((d) => (
          <div key={d} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div className="flex items-end gap-0.5 h-full w-full justify-center">
              <div className="w-2 rounded-t bg-income" style={{ height: `${((dayIn[d] ?? 0) / maxBar) * 100}%` }} />
              <div className="w-2 rounded-t bg-expense" style={{ height: `${((dayOut[d] ?? 0) / maxBar) * 100}%` }} />
            </div>
            <div className="text-[9px] text-textSecondary">{d.slice(8)}</div>
          </div>
        ))}
      </div>
      <div className="text-center text-[10px] text-textSecondary mt-1">7 วันล่าสุด · เขียว = เข้า · แดง = ออก</div>

      {/* "What needs doing today?" — only shown once there is real stock to talk about,
          so a brand-new shop isn't told that everything is out of stock. */}
      {hasStock && (outCount > 0 || lowCount > 0 ? (
        <Link
          href="/inventory"
          className="mt-5 flex items-center justify-between bg-warnBg text-warn rounded-xl px-4 py-3 text-sm font-semibold"
        >
          <span>⚠️ หมด {outCount} รายการ · ใกล้หมด {lowCount} รายการ</span>
          <span className="text-xs">ดูว่าต้องซื้ออะไร ›</span>
        </Link>
      ) : (
        <div className="mt-5 bg-incomeBg text-income rounded-xl px-4 py-3 text-sm font-semibold">
          ✅ สต๊อกทุกรายการปกติดี
        </div>
      ))}

      <Link
        href="/sell"
        className="mt-6 flex items-center justify-center gap-2 bg-accent text-white font-bold rounded-2xl py-4 text-base shadow-md active:scale-[0.98]"
      >
        ⚡ ขายสินค้า
      </Link>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex-1">
      <div className="text-[10.5px] text-textSecondary">{label}</div>
      <div className={`font-serif font-bold text-[15px] ${className ?? ''}`}>{value}</div>
    </div>
  );
}
