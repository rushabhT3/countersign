export type Status = 'needs_review' | 'flagged' | 'held' | 'approved' | 'rejected';
export type Severity = 'low' | 'medium' | 'high';
export type IssueType =
  | 'qty_mismatch'
  | 'price_variance'
  | 'duplicate'
  | 'vendor_risk'
  | 'tax_error'
  | 'missing_po';
export type Actor = 'agent' | 'human';

export const STATUSES: Status[] = ['needs_review', 'flagged', 'held', 'approved', 'rejected'];
export const SEVERITIES: Severity[] = ['low', 'medium', 'high'];
export const ISSUE_TYPES: IssueType[] = [
  'qty_mismatch',
  'price_variance',
  'duplicate',
  'vendor_risk',
  'tax_error',
  'missing_po',
];

export type Bbox = [number, number, number, number];

export interface Vendor {
  id: string;
  name: string;
  payment_terms: string;
  tax_rate: number;
  price_tolerance_pct: number;
  bank_account_last4: string;
  bank_last_changed: string;
  invoices_last_12m: number;
  avg_invoice_amount: number;
  contact_email: string;
}

export interface PurchaseOrderLine {
  line: number;
  sku: string;
  description: string;
  qty: number;
  unit_price: number;
}

export interface PurchaseOrder {
  po_number: string;
  vendor_id: string;
  issued: string;
  lines: PurchaseOrderLine[];
}

export interface ReceiptLine {
  line: number;
  qty_received: number;
}

export interface Receipt {
  receipt_id: string;
  po_number: string;
  received_date: string;
  lines: ReceiptLine[];
}

export interface GlCode {
  code: string;
  name: string;
}

export interface ExtractedField {
  value: string;
  confidence: number;
  page: number;
  bbox: Bbox;
}

export const HEADER_FIELD_KEYS = [
  'invoice_number',
  'issue_date',
  'due_date',
  'po_number',
  'vendor_name',
  'subtotal',
  'tax',
  'total',
  'bank_account',
] as const;
export type HeaderFieldKey = (typeof HEADER_FIELD_KEYS)[number];

export const LINE_FIELD_COLUMNS = ['description', 'qty', 'unit_price', 'amount'] as const;
export type LineFieldColumn = (typeof LINE_FIELD_COLUMNS)[number];

export interface LineItem {
  line: number;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  amount: number;
  confidence: number;
  page: number;
  bbox: Record<LineFieldColumn, Bbox>;
}

export interface InvoicePage {
  page: number;
  image: string;
  width_px: number;
  height_px: number;
}

export interface InvoiceSeed {
  id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name_on_doc: string;
  issue_date: string;
  due_date: string;
  currency: string;
  po_number?: string;
  subtotal: number;
  tax: number;
  total: number;
  bank_account_last4_on_doc: string;
  initial_status: Status;
  approved_on?: string;
  scenario: string;
  pages: InvoicePage[];
  fields: Partial<Record<HeaderFieldKey, ExtractedField>>;
  line_items: LineItem[];
}
