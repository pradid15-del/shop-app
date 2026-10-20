import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 4 * 1024 * 1024; // Vercel limits request bodies to ~4.5MB, so stay under it

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์รูป' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP เท่านั้น' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'ไฟล์รูปใหญ่เกินไป (สูงสุด 4MB)' }, { status: 400 });
  }

  // Random name so two uploads can never overwrite each other.
  const path = `${crypto.randomUUID()}.${EXT[file.type]}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    return NextResponse.json({ ok: false, error: 'อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
