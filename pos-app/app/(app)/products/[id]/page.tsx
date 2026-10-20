import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '../product-form';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('id', params.id)
    .single();
  if (!data) notFound();

  return (
    <div>
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <Link href="/products" className="text-textSecondary">‹ กลับ</Link>
        <h1 className="font-bold">แก้ไขสินค้า</h1>
      </div>
      <ProductForm product={data as Product} />
    </div>
  );
}
