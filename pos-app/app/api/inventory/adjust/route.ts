import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ ok: false, error: 'กรุณาระบุจำนวนให้ถูกต้อง' }, { status: 400 });
  }
  const supabase = createClient();
  const { error } = await supabase.rpc('stock_adjust', {
    p_product_id: body.productId,
    p_variant_id: body.variantId ?? null,
    p_qty: qty,
    p_reason: body.reason || 'ปรับยอด',
    p_note: body.note ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
