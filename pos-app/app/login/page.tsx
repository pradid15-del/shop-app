'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Sign-in only. This is a single-shop app: create the shop's login(s) in
// Supabase Dashboard → Authentication → Users, then turn off public sign-ups
// (Authentication → Sign In / Providers) so nobody else can register.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-border p-6 space-y-3">
        <div>
          <h1 className="text-xl font-bold">🛍️ เข้าสู่ระบบ</h1>
          <p className="text-sm text-textSecondary">บันทึกรายรับรายจ่าย</p>
        </div>
        {error && <p className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</p>}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="อีเมล"
          className="w-full border border-border rounded-lg px-3 py-2.5"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่าน"
          className="w-full border border-border rounded-lg px-3 py-2.5"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-accent text-white rounded-lg py-2.5 font-semibold disabled:opacity-60"
        >
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
