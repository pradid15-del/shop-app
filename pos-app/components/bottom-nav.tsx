'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', icon: '🏠', label: 'หน้าแรก' },
  { href: '/products', icon: '👕', label: 'สินค้า' },
  { href: '/inventory', icon: '📦', label: 'คลัง' },
  { href: '/transactions', icon: '🧾', label: 'ธุรกรรม' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto bg-white border-t border-border flex px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-30">
      {ITEMS.map((it) => {
        const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1 text-[11px] rounded-xl ${
              active ? 'text-accent font-bold bg-surfaceAlt' : 'text-textSecondary'
            }`}
          >
            <span className="text-lg">{it.icon}</span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
