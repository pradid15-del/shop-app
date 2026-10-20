export type OnboardingState = { hasProducts: boolean; hasStock: boolean; hasSales: boolean };

export type GuideStep = {
  n: number;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
};

// The three things every new shop does, in order. "done" comes from real data,
// so the checklist ticks itself and disappears once the shop is up and running.
export function onboardingSteps(s: OnboardingState): GuideStep[] {
  return [
    { n: 1, title: 'เพิ่มสินค้า', desc: 'ใส่ชื่อ ราคา และต้นทุน (ถ้ามี) ของสินค้าที่ขาย', href: '/products/new', cta: '+ เพิ่มสินค้า', done: s.hasProducts },
    { n: 2, title: 'รับสินค้าเข้า', desc: 'ใส่จำนวนที่มีอยู่จริง ระบบจะนับสต๊อกให้', href: '/inventory', cta: '📥 ไปรับสินค้าเข้า', done: s.hasStock },
    { n: 3, title: 'ขายชิ้นแรก', desc: 'เลือกสินค้า ใส่จำนวน ระบบตัดสต๊อกและคิดเงินทอนให้', href: '/sell', cta: '⚡ เริ่มขาย', done: s.hasSales },
  ];
}

export function allDone(s: OnboardingState): boolean {
  return s.hasProducts && s.hasStock && s.hasSales;
}
