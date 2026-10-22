import type { CurrencyCode, Money } from '../../domain/types';

/** Mata uang default untuk nilai nol ketika tidak ada konteks mata uang (mis. cart kosong). */
export const DEFAULT_CURRENCY: CurrencyCode = 'IDR';

export const createMoney = (amount: number, currency: CurrencyCode): Money => ({
  amount,
  currency,
});

/** Nominal uang yang valid: integer (satuan terkecil) dan tidak negatif. */
export const isValidMoneyAmount = (amount: number): boolean =>
  Number.isInteger(amount) && amount >= 0;
