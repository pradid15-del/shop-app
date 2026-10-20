import type { StockStatusKey } from '@/lib/types';

// One shared status look for the whole app: green ready / orange low / red out / blue stock-in.
const STYLES: Record<StockStatusKey | 'in', string> = {
  ready: 'bg-incomeBg text-income',
  low: 'bg-warnBg text-warn',
  out: 'bg-expenseBg text-expense',
  in: 'bg-infoBg text-info',
};

export function StatusBadge({ status, label }: { status: StockStatusKey | 'in'; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
