import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/logout-button';
import { BottomNav } from '@/components/bottom-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-xl mx-auto min-h-screen pb-24">
      <header className="flex items-center justify-between px-4 py-3 bg-accentDark text-white">
        <div className="font-bold">🛍️ บันทึกรายรับรายจ่าย</div>
        <LogoutButton />
      </header>
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}
