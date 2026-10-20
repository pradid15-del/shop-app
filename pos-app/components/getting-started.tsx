import Link from 'next/link';
import type { GuideStep } from '@/lib/onboarding';

// Replaces "empty page" with a short how-to. The first unfinished step is
// highlighted with its button; finished steps get a tick; later steps wait.
export function GettingStarted({ steps, title = 'เริ่มใช้งานใน 3 ขั้นตอน' }: { steps: GuideStep[]; title?: string }) {
  const currentIndex = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="bg-white border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm">🚀 {title}</h2>
        <span className="text-[11px] font-semibold text-textSecondary">{doneCount}/{steps.length}</span>
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const isCurrent = i === currentIndex;
          return (
            <li key={s.n} className={`flex gap-3 ${!s.done && !isCurrent ? 'opacity-50' : ''}`}>
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  s.done ? 'bg-incomeBg text-income' : isCurrent ? 'bg-accent text-white' : 'bg-surfaceAlt text-textSecondary'
                }`}
              >
                {s.done ? '✓' : s.n}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${s.done ? 'line-through text-textSecondary' : ''}`}>{s.title}</div>
                {!s.done && <div className="text-xs text-textSecondary mt-0.5">{s.desc}</div>}
                {isCurrent && (
                  <Link
                    href={s.href}
                    className="inline-block mt-2 bg-accent text-white text-sm font-semibold rounded-lg px-4 py-2 active:scale-[0.98]"
                  >
                    {s.cta}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
