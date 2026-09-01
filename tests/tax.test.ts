import { describe, expect, it } from 'vitest';
import { checkTax, expectedTax, formatMoney, moneyEquals, roundMoney } from '@/lib/domain/tax';

describe('roundMoney', () => {
  it('rounds .005 boundaries up despite binary float error', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(8.005)).toBe(8.01);
  });

  it('keeps values just under the boundary down', () => {
    expect(roundMoney(1.0049)).toBe(1.0);
    expect(roundMoney(187.984)).toBe(187.98);
  });

  it('rounds half away from zero for negatives', () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-0.004)).toBe(-0);
  });

  it('passes exact cents through unchanged', () => {
    expect(roundMoney(2349.75)).toBe(2349.75);
    expect(roundMoney(0)).toBe(0);
  });
});

describe('expectedTax', () => {
  it('computes the Harbor Office tax that the invoice misprints', () => {
    expect(expectedTax(2349.75, 0.08)).toBe(187.98);
  });

  it('handles a zero rate and a .005 product', () => {
    expect(expectedTax(1450, 0)).toBe(0);
    expect(expectedTax(100.0625, 0.08)).toBe(8.01);
  });
});

describe('checkTax', () => {
  it('flags a two-cent overstatement', () => {
    const check = checkTax(2349.75, 0.08, 188.0);
    expect(check).toEqual({ tax_expected: 187.98, tax_on_invoice: 188.0, tax_ok: false });
  });

  it('accepts a one-cent difference as rounding', () => {
    expect(checkTax(4120, 0.08, 329.61).tax_ok).toBe(true);
    expect(checkTax(4120, 0.08, 329.6).tax_ok).toBe(true);
  });
});

describe('money helpers', () => {
  it('compares within a cent', () => {
    expect(moneyEquals(10, 10.01)).toBe(true);
    expect(moneyEquals(10, 10.02)).toBe(false);
  });

  it('formats with two decimals', () => {
    expect(formatMoney(18.5)).toBe('18.50');
    expect(formatMoney(1.005)).toBe('1.01');
  });
});
