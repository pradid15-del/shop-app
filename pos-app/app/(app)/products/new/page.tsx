import Link from 'next/link';
import { ProductForm } from '../product-form';

export default function NewProductPage() {
  return (
    <div>
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <Link href="/products" className="text-textSecondary">‹ กลับ</Link>
        <h1 className="font-bold">เพิ่มสินค้า</h1>
      </div>
      <ProductForm />
    </div>
  );
}
