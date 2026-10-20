'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/lib/types';

type VRow = {
  id?: string;
  color: string;
  size: string;
  item_code: string;
  normal_price: string;
  sale_price: string;
  cost: string;
  min_stock: string;
  stock: number; // read-only here: stock only changes through the inventory page
};

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

// Shrinks big phone photos before upload (keeps us under Vercel's request-size limit and saves storage).
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1000;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', 0.82)
  );
}

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : NaN;
}

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [itemCode, setItemCode] = useState(product?.item_code ?? '');
  const [hasVariants, setHasVariants] = useState(product?.has_variants ?? false);
  const [normalPrice, setNormalPrice] = useState(product?.normal_price != null ? String(product.normal_price) : '');
  const [salePrice, setSalePrice] = useState(product?.sale_price != null ? String(product.sale_price) : '');
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : '');
  const [minStock, setMinStock] = useState(String(product?.min_stock ?? 3));
  const [variants, setVariants] = useState<VRow[]>(
    (product?.product_variants ?? []).map((v) => ({
      id: v.id,
      color: v.color ?? '',
      size: v.size ?? '',
      item_code: v.item_code ?? '',
      normal_price: String(v.normal_price),
      sale_price: v.sale_price != null ? String(v.sale_price) : '',
      cost: v.cost != null ? String(v.cost) : '',
      min_stock: String(v.min_stock),
      stock: v.stock,
    }))
  );
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function setV(i: number, patch: Partial<VRow>) {
    setVariants((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP เท่านั้น');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('ไฟล์รูปใหญ่เกินไป กรุณาเลือกไฟล์ที่เล็กกว่า 12MB');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const blob = await shrinkImage(file);
      const fd = new FormData();
      fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      const res = await fetch('/api/products/upload-image', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setImageUrl(json.url);
    } catch (err: any) {
      setError(err.message || 'อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

  // Returns the validated numbers, or sets an error and returns null.
  function validate() {
    if (!name.trim()) return fail('กรุณากรอกชื่อสินค้า');
    const warns: string[] = [];

    const parse = (label: string, np: string, sp: string, c: string, ms: string) => {
      const normal = num(np), sale = num(sp), cst = num(c), min = num(ms);
      if (normal === null || Number.isNaN(normal) || normal <= 0) return fail(`${label}: ราคาปกติต้องมากกว่า 0`);
      if (sale !== null && (Number.isNaN(sale) || sale <= 0)) return fail(`${label}: ราคาโปรโมชั่นไม่ถูกต้อง`);
      if (sale !== null && sale >= normal) return fail(`${label}: ราคาโปรโมชั่นต้องน้อยกว่าราคาปกติ`);
      if (cst !== null && (Number.isNaN(cst) || cst < 0)) return fail(`${label}: ต้นทุนต้องไม่ติดลบ`);
      if (min === null || Number.isNaN(min) || min < 0 || !Number.isInteger(min)) return fail(`${label}: จำนวนขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 0`);
      // Selling below cost is allowed (clearance) — warn, don't block.
      const eff = sale ?? normal;
      if (cst !== null && cst > eff) warns.push(`${label}: ราคาขายต่ำกว่าต้นทุน กำไรต่อชิ้นจะติดลบ`);
      return { normal, sale, cost: cst, min };
    };

    if (!hasVariants) {
      const r = parse('สินค้า', normalPrice, salePrice, cost, minStock);
      if (!r) return null;
      return { simple: r, variants: [] as any[], warns };
    }
    if (variants.length === 0) return fail('กรุณาเพิ่มตัวเลือกอย่างน้อย 1 รายการ');
    const out: any[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const label = `ตัวเลือก ${i + 1}`;
      if (!v.color.trim() && !v.size.trim()) return fail(`${label}: กรุณาระบุสีหรือไซส์`);
      const r = parse(label, v.normal_price, v.sale_price, v.cost, v.min_stock);
      if (!r) return null;
      out.push({ v, ...r });
    }
    return { simple: null, variants: out, warns };
  }

  function fail(msg: string): null {
    setError(msg);
    return null;
  }

  async function save() {
    setError(null);
    setWarning(null);
    const ok = validate();
    if (!ok) return;
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        category: category.trim() || null,
        item_code: itemCode.trim() || null,
        image_url: imageUrl,
        has_variants: hasVariants,
        updated_at: new Date().toISOString(),
      };
      const productRow = ok.simple
        ? { ...base, normal_price: ok.simple.normal, sale_price: ok.simple.sale, cost: ok.simple.cost, min_stock: ok.simple.min }
        : { ...base, normal_price: null, sale_price: null, cost: null, min_stock: 3 };

      let productId = product?.id;
      if (productId) {
        const { error } = await supabase.from('products').update(productRow).eq('id', productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert({ ...productRow, stock: 0 }).select('id').single();
        if (error) throw error;
        productId = data.id;
      }

      if (hasVariants) {
        const keepIds = ok.variants.filter((x) => x.v.id).map((x) => x.v.id as string);
        const removed = (product?.product_variants ?? []).filter((v) => !keepIds.includes(v.id));
        for (const r of removed) {
          const { error } = await supabase.from('product_variants').delete().eq('id', r.id);
          if (error) throw new Error('ลบตัวเลือกที่มีประวัติการขาย/สต๊อกไม่ได้ (ตัวเลือกที่เคยใช้งานแล้วต้องเก็บไว้เพื่อรักษาประวัติ)');
        }
        for (const x of ok.variants) {
          const row = {
            product_id: productId,
            color: x.v.color.trim() || null,
            size: x.v.size.trim() || null,
            item_code: x.v.item_code.trim() || null,
            normal_price: x.normal,
            sale_price: x.sale,
            cost: x.cost,
            min_stock: x.min,
            updated_at: new Date().toISOString(),
          };
          if (x.v.id) {
            const { error } = await supabase.from('product_variants').update(row).eq('id', x.v.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('product_variants').insert({ ...row, stock: 0 });
            if (error) throw error;
          }
        }
      }

      if (ok.warns.length) {
        setWarning('บันทึกแล้ว แต่โปรดตรวจสอบ: ' + ok.warns.join(' / '));
        setSaving(false);
        setTimeout(() => { router.push('/products'); router.refresh(); }, 1800);
        return;
      }
      router.push('/products');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setSaving(false);
    }
  }

  async function archiveOrDelete() {
    if (!product) return;
    if (!confirm('ลบสินค้านี้? (ถ้าสินค้าเคยมีประวัติ ระบบจะเก็บเข้าคลังแทนการลบถาวร)')) return;
    setSaving(true);
    const { count } = await supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', product.id);
    const { count: txCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', product.id);
    const hasHistory = (count ?? 0) > 0 || (txCount ?? 0) > 0;
    const { error } = hasHistory
      ? await supabase.from('products').update({ active: false }).eq('id', product.id)
      : await supabase.from('products').delete().eq('id', product.id);
    if (error) {
      setError('ลบไม่สำเร็จ: ' + error.message);
      setSaving(false);
      return;
    }
    router.push('/products');
    router.refresh();
  }

  const input = 'w-full border border-border rounded-lg px-3 py-2.5 bg-white text-sm';
  const label = 'block text-xs font-semibold text-textSecondary mb-1';

  return (
    <div className="p-4 space-y-4">
      {error && <div className="text-sm text-expense bg-expenseBg rounded-lg px-3 py-2">{error}</div>}
      {warning && <div className="text-sm text-warn bg-warnBg rounded-lg px-3 py-2">{warning}</div>}

      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-2xl bg-surfaceAlt border border-border overflow-hidden flex items-center justify-center text-3xl shrink-0">
          {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : '🛍️'}
        </div>
        <div className="space-y-2">
          <label className="inline-block bg-white border border-border rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer">
            {uploading ? 'กำลังอัปโหลด...' : imageUrl ? '🔄 เปลี่ยนรูป' : '📷 เลือกรูป'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} disabled={uploading} />
          </label>
          {imageUrl && (
            <button type="button" onClick={() => setImageUrl(null)} className="block text-xs text-expense">
              🗑️ ลบรูป
            </button>
          )}
          <p className="text-[10.5px] text-textSecondary">JPG / PNG / WEBP · ระบบย่อรูปให้อัตโนมัติ</p>
        </div>
      </div>

      <div>
        <label className={label}>ชื่อสินค้า</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>หมวดหมู่</label>
          <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div>
          <label className={label}>รหัสสินค้า (SKU)</label>
          <input className={input} value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3">
        <span className="text-sm font-semibold">🎨 มีตัวเลือก (สี/ไซส์)</span>
        <input
          type="checkbox"
          className="w-5 h-5 accent-[#6C4CC7]"
          checked={hasVariants}
          onChange={(e) => setHasVariants(e.target.checked)}
          disabled={!!product && (product.product_variants?.length ?? 0) > 0 && hasVariants}
        />
      </label>

      {!hasVariants ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>ราคาปกติ</label>
            <input className={input} inputMode="decimal" value={normalPrice} onChange={(e) => setNormalPrice(e.target.value)} />
          </div>
          <div>
            <label className={label}>ราคาโปรโมชั่น (ถ้ามี)</label>
            <input className={input} inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
          <div>
            <label className={label}>ต้นทุน</label>
            <input className={input} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className={label}>จำนวนขั้นต่ำที่ต้องการ</label>
            <input className={input} inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
          {product && (
            <p className="col-span-2 text-xs text-textSecondary bg-surfaceAlt rounded-lg px-3 py-2">
              คงเหลือปัจจุบัน <b>{product.stock}</b> ชิ้น (ปรับได้ที่หน้า "คลัง" เท่านั้น เพื่อให้ประวัติสต๊อกตรงเสมอ)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={v.id ?? i} className="bg-white border border-border rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <input className={input} placeholder="สี" value={v.color} onChange={(e) => setV(i, { color: e.target.value })} />
                <input className={input} placeholder="ไซส์" value={v.size} onChange={(e) => setV(i, { size: e.target.value })} />
                <button type="button" onClick={() => setVariants((r) => r.filter((_, idx) => idx !== i))} className="px-3 text-expense">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={input} placeholder="ราคาปกติ" inputMode="decimal" value={v.normal_price} onChange={(e) => setV(i, { normal_price: e.target.value })} />
                <input className={input} placeholder="โปรโมชั่น" inputMode="decimal" value={v.sale_price} onChange={(e) => setV(i, { sale_price: e.target.value })} />
                <input className={input} placeholder="ต้นทุน" inputMode="decimal" value={v.cost} onChange={(e) => setV(i, { cost: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={input} placeholder="SKU" value={v.item_code} onChange={(e) => setV(i, { item_code: e.target.value })} />
                <input className={input} placeholder="ขั้นต่ำ" inputMode="numeric" value={v.min_stock} onChange={(e) => setV(i, { min_stock: e.target.value })} />
              </div>
              {v.id && <p className="text-[11px] text-textSecondary">คงเหลือ {v.stock} ชิ้น</p>}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setVariants((r) => [...r, { color: '', size: '', item_code: '', normal_price: '', sale_price: '', cost: '', min_stock: '3', stock: 0 }])
            }
            className="w-full border-2 border-dashed border-accent text-accent rounded-xl py-2.5 text-sm font-semibold"
          >
            + เพิ่มตัวเลือก
          </button>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || uploading}
        className="w-full bg-accent text-white font-bold rounded-xl py-3 disabled:opacity-60"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
      {product && (
        <button onClick={archiveOrDelete} disabled={saving} className="w-full border border-expense text-expense rounded-xl py-2.5 text-sm">
          ลบ / เก็บสินค้าเข้าคลัง
        </button>
      )}
    </div>
  );
}
