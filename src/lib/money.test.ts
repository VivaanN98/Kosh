import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  applyBps,
  formatINR,
  formatINRCompact,
  groupIndian,
  parseRupees,
  ratioBps,
  rupees,
  sub,
  sum,
  toDecimalString,
} from './money';

describe('money', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
  });

  it('formats INR with lakh grouping and paise', () => {
    expect(formatINR(rupees(100000))).toBe('₹1,00,000');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(-50000)).toBe('−₹500');
    expect(formatINR(50000, { sign: 'always' })).toBe('+₹500');
    expect(formatINR(0, { sign: 'always' })).toBe('₹0');
    expect(formatINR(5, { decimals: 'always' })).toBe('₹0.05');
    expect(formatINR(12350, { decimals: 'never' })).toBe('₹124');
    expect(formatINR(50000, { symbol: false })).toBe('500');
  });

  it('formats compact amounts', () => {
    expect(formatINRCompact(rupees(950))).toBe('₹950');
    expect(formatINRCompact(rupees(12500))).toBe('₹13K');
    expect(formatINRCompact(rupees(1500))).toBe('₹1.5K');
    expect(formatINRCompact(rupees(340000))).toBe('₹3.4L');
    expect(formatINRCompact(rupees(12000000))).toBe('₹1.2Cr');
    expect(formatINRCompact(-rupees(1000))).toBe('−₹1K');
  });

  it('parses rupee input without floating point', () => {
    expect(parseRupees('500')).toBe(50000);
    expect(parseRupees('1,23,456.7')).toBe(12345670);
    expect(parseRupees('₹ 0.1')).toBe(10);
    expect(parseRupees('.5')).toBe(50);
    expect(parseRupees('0.29')).toBe(29);
    expect(parseRupees('1.005')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });

  it('does integer arithmetic only', () => {
    expect(add(10, 20, 30)).toBe(60);
    expect(sub(10, 30)).toBe(-20);
    expect(sum([1, 2, 3])).toBe(6);
    expect(() => add(0.1, 0.2)).toThrow(RangeError);
  });

  it('applies basis points with half-up rounding', () => {
    expect(applyBps(rupees(1000), 500)).toBe(rupees(50));
    expect(applyBps(333, 5000)).toBe(167);
    expect(applyBps(-333, 5000)).toBe(-167);
    expect(ratioBps(rupees(80), rupees(100))).toBe(8000);
    expect(ratioBps(1, 3)).toBe(3333);
    expect(ratioBps(5, 0)).toBe(0);
  });

  it('allocates without losing paise', () => {
    const parts = allocate(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(sum(parts)).toBe(1000);
    expect(sum(allocate(-1000, 3))).toBe(-1000);
  });

  it('writes plain decimal strings for CSV', () => {
    expect(toDecimalString(123450)).toBe('1234.50');
    expect(toDecimalString(-5)).toBe('-0.05');
  });
});
