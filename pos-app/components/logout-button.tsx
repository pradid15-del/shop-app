'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-xs text-white border border-white/40 rounded-lg px-3 py-1.5">
      ออกจากระบบ
    </button>
  );
}
