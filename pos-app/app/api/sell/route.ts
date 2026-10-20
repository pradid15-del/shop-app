import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Selling goes through the sell_item() database function, which locks the stock
// row and re-checks stock inside one transaction — so overselling is impossible
// even with rapid taps or two devices selling at once.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  const qty = Number(body.qty);
  const unitPrice = Number(body.unitPrice);
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ ok: false, error: 'กรุณาระบุจำนวนให้ถูกต้อง' }, { status: 400 });
  }
  if (!isFinite(unitPrice) || unitPrice <= 0) {
    return NextResponse.json({ ok: false, error: 'กรุณาระบุราคาต่อชิ้นให้ถูกต้อง' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('sell_item', {
    p_product_id: body.productId,
    p_variant_id: body.variantId ?? null,
    p_qty: qty,
    p_unit_price: unitPrice,
    p_note: body.note ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, transaction: data });
}
