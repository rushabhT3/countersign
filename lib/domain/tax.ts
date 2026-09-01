const CENTS = 100;
const HALF_CENT_GUARD = 1e-7;
export const MONEY_EPSILON = 0.01;

// Rounds half away from zero at two decimals. The guard absorbs binary float error so that
// values a hair under x.xx5 (like 1.005 stored as 1.00499999…) round up as a person expects.
export function roundMoney(amount: number): number {
  const cents = Math.round(Math.abs(amount) * CENTS + HALF_CENT_GUARD);
  return (Math.sign(amount) || 1) * cents / CENTS;
}

export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_EPSILON + 1e-9;
}

export function formatMoney(amount: number): string {
  return roundMoney(amount).toFixed(2);
}

export function expectedTax(subtotal: number, rate: number): number {
  return roundMoney(subtotal * rate);
}

export interface TaxCheck {
  tax_expected: number;
  tax_on_invoice: number;
  tax_ok: boolean;
}

export function checkTax(subtotal: number, rate: number, taxOnInvoice: number): TaxCheck {
  const tax_expected = expectedTax(subtotal, rate);
  return { tax_expected, tax_on_invoice: taxOnInvoice, tax_ok: moneyEquals(tax_expected, taxOnInvoice) };
}
