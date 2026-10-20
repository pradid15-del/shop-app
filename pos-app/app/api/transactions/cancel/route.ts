import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.transactionId) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_sale', {
    p_transaction_id: body.transactionId,
    p_reason: body.reason ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
