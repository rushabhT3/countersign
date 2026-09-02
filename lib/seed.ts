import { z } from 'zod';
import type { GlCode, InvoiceSeed, PurchaseOrder, Receipt, Vendor } from '@/lib/types';
import { HEADER_FIELD_KEYS, STATUSES } from '@/lib/types';
import vendorsJson from '@/data/vendors.json';
import posJson from '@/data/pos.json';
import receiptsJson from '@/data/receipts.json';
import glCodesJson from '@/data/gl_codes.json';
import inv001 from '@/data/invoices/inv_001.json';
import inv002 from '@/data/invoices/inv_002.json';
import inv003 from '@/data/invoices/inv_003.json';
import inv004a from '@/data/invoices/inv_004a.json';
import inv004b from '@/data/invoices/inv_004b.json';
import inv005 from '@/data/invoices/inv_005.json';
import inv006 from '@/data/invoices/inv_006.json';
import inv007 from '@/data/invoices/inv_007.json';
import inv008 from '@/data/invoices/inv_008.json';
import inv009 from '@/data/invoices/inv_009.json';

const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Field = z.object({ value: z.string(), confidence: z.number(), page: z.int(), bbox: Bbox });

const VendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  payment_terms: z.string(),
  tax_rate: z.number(),
  price_tolerance_pct: z.number(),
  bank_account_last4: z.string(),
  bank_last_changed: z.string(),
  invoices_last_12m: z.int(),
  avg_invoice_amount: z.number(),
  contact_email: z.string(),
});

const PurchaseOrderSchema = z.object({
  po_number: z.string(),
  vendor_id: z.string(),
  issued: z.string(),
  lines: z.array(z.object({ line: z.int(), sku: z.string(), description: z.string(), qty: z.number(), unit_price: z.number() })),
});

const ReceiptSchema = z.object({
  receipt_id: z.string(),
  po_number: z.string(),
  received_date: z.string(),
  lines: z.array(z.object({ line: z.int(), qty_received: z.number() })),
});

const GlCodeSchema = z.object({ code: z.string(), name: z.string() });

const InvoiceSeedSchema = z.object({
  id: z.string(),
  invoice_number: z.string(),
  vendor_id: z.string(),
  vendor_name_on_doc: z.string(),
  issue_date: z.string(),
  due_date: z.string(),
  currency: z.string(),
  po_number: z.string().optional(),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  bank_account_last4_on_doc: z.string(),
  initial_status: z.enum(STATUSES),
  approved_on: z.string().optional(),
  scenario: z.string(),
  pages: z.array(z.object({ page: z.int(), image: z.string(), width_px: z.int(), height_px: z.int() })),
  fields: z.partialRecord(z.enum(HEADER_FIELD_KEYS), Field),
  line_items: z.array(
    z.object({
      line: z.int(),
      description: z.string(),
      qty: z.number(),
      unit: z.string(),
      unit_price: z.number(),
      amount: z.number(),
      confidence: z.number(),
      page: z.int(),
      bbox: z.object({ description: Bbox, qty: Bbox, unit_price: Bbox, amount: Bbox }),
    }),
  ),
});

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export const VENDORS: Record<string, Vendor> = byId(z.array(VendorSchema).parse(vendorsJson));
export const PURCHASE_ORDERS: Record<string, PurchaseOrder> = Object.fromEntries(
  z.array(PurchaseOrderSchema).parse(posJson).map((po) => [po.po_number, po]),
);
export const RECEIPTS_BY_PO: Record<string, Receipt> = Object.fromEntries(
  z.array(ReceiptSchema).parse(receiptsJson).map((r) => [r.po_number, r]),
);
export const GL_CODES: GlCode[] = z.array(GlCodeSchema).parse(glCodesJson);
export const GL_CODE_NAMES: Record<string, string> = Object.fromEntries(GL_CODES.map((g) => [g.code, g.name]));

export const SEED_INVOICES: InvoiceSeed[] = z
  .array(InvoiceSeedSchema)
  .parse([inv001, inv002, inv003, inv004a, inv004b, inv005, inv006, inv007, inv008, inv009]);

export const SEED_ORDER: string[] = SEED_INVOICES.map((inv) => inv.id);

export function vendorFor(invoice: Pick<InvoiceSeed, 'vendor_id'>): Vendor {
  const vendor = VENDORS[invoice.vendor_id];
  if (!vendor) throw new Error(`Seed integrity: vendor ${invoice.vendor_id} missing`);
  return vendor;
}

export function purchaseOrderFor(invoice: Pick<InvoiceSeed, 'po_number'>): PurchaseOrder | undefined {
  return invoice.po_number ? PURCHASE_ORDERS[invoice.po_number] : undefined;
}

export function receiptFor(invoice: Pick<InvoiceSeed, 'po_number'>): Receipt | undefined {
  return invoice.po_number ? RECEIPTS_BY_PO[invoice.po_number] : undefined;
}
