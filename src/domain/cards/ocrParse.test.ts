import { describe, expect, it } from 'vitest';
import { luhnValid, networkFromPrefix, parseCardText } from './ocrParse';

describe('parseCardText', () => {
  it('reads a clean debit card and keeps only the last four', () => {
    const r = parseCardText(['STATE BANK OF INDIA', 'GLOBAL INTERNATIONAL', 'DEBIT', '4000 1234 5678 9017', 'VALID THRU 12/30', 'VISA']);
    expect(r).toMatchObject({ issuer: 'State Bank of India', network: 'visa', cardType: 'debit', last4: '9017', displayName: 'Global International' });
    expect(r.uncertain).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/4000|1234 5678|12345678/);
  });

  it('tolerates OCR look-alikes in digits and fuzzy words', () => {
    const r = parseCardText(['lNDIAN BANK', 'DEB1T PLAT1NUM', '6O7O 0O12 3456 78I6', 'RuPay']);
    expect(r.issuer).toBe('Indian Bank');
    expect(r.cardType).toBe('debit');
    expect(r.network).toBe('rupay');
    expect(r.last4).toBe('7816');
    expect(r.uncertain).not.toContain('last4');
  });

  it('derives the network from the number prefix when no logo text is read', () => {
    expect(luhnValid('5500000000000004')).toBe(true);
    const r = parseCardText(['HDFC BANK', 'CREDIT CARD', '5500 0000 0000 0004']);
    expect(r.network).toBe('mastercard');
    expect(r.last4).toBe('0004');
  });

  it('flags uncertain fields', () => {
    const r = parseCardText(['SOMETHING ELSE', '1234 5678 9012 3456']);
    expect(r.issuer).toBeNull();
    expect(r.uncertain).toEqual(expect.arrayContaining(['issuer', 'network', 'cardType', 'last4']));
  });

  it('reads masked numbers and Amex grouping', () => {
    expect(parseCardText(['XXXX XXXX XXXX 4321']).last4).toBe('4321');
    const amex = parseCardText(['AMERICAN EXPRESS', '3782 822463 10005']);
    expect(amex.network).toBe('amex');
    expect(amex.last4).toBe('0005');
  });

  it('maps prefixes to networks', () => {
    expect(networkFromPrefix('4111111111111111')).toBe('visa');
    expect(networkFromPrefix('2221000000000009')).toBe('mastercard');
    expect(networkFromPrefix('6521000000000000')).toBe('rupay');
    expect(networkFromPrefix('378282246310005')).toBe('amex');
  });
});
