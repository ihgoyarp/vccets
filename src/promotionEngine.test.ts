import { describe, expect, it } from 'vitest';
import type { IPromotionEngine } from '../domain/types';
import { PromotionEngine } from '../application/services/promotion.service';
import { buildFixedAmountPromotion, buildPercentagePromotion, money } from './test-utils/fixtures';

describe('PromotionEngine', () => {
  const promotionEngine: IPromotionEngine = new PromotionEngine();

  it('berhasil menerapkan diskon persentase pada subtotal', () => {
    const promotion = buildPercentagePromotion({ percentage: 10 });
    const baseAmount = money(200_000);

    const result = promotionEngine.applyDiscount(baseAmount, promotion);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountType).toBe('PERCENTAGE');
      expect(result.data.discountAmount).toEqual(money(20_000));
      expect(result.data.amountAfterDiscount).toEqual(money(180_000));
    }
  });

  it('berhasil menerapkan diskon nominal tetap pada subtotal', () => {
    const promotion = buildFixedAmountPromotion({ amount: money(20_000) });
    const baseAmount = money(150_000);

    const result = promotionEngine.applyDiscount(baseAmount, promotion);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountType).toBe('FIXED_AMOUNT');
      expect(result.data.discountAmount).toEqual(money(20_000));
      expect(result.data.amountAfterDiscount).toEqual(money(130_000));
    }
  });
});
