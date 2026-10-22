import type {
  DomainError,
  Failure,
  FixedAmountDiscountPromotion,
  IPromotionEngine,
  Money,
  PercentageDiscountPromotion,
  Promotion,
  PromotionApplicationResult,
  PromotionValidationContext,
  PromotionValidationFailureReason,
  Result,
} from '../../domain/types';
import { createMoney, isValidMoneyAmount } from '../shared/money';
import { assertNever, fail, ok } from '../shared/result';

type PromotionError = DomainError<PromotionValidationFailureReason>;

/**
 * Implementasi Promotion Engine untuk diskon TUNGGAL.
 *
 * - `validatePromotion`: memeriksa status aktif, jendela waktu, dan minimum belanja.
 * - `applyDiscount`: murni menghitung potongan (tidak memeriksa tanggal); panggil
 *   `validatePromotion` lebih dulu untuk aturan kelayakan promo.
 *
 * Pembulatan: diskon persentase dibulatkan ke bawah (floor) ke satuan terkecil,
 * dan potongan tidak pernah melebihi nilai dasar (total tidak bisa negatif).
 */
export class PromotionEngine implements IPromotionEngine {
  validatePromotion(
    promotion: Promotion,
    context: PromotionValidationContext
  ): Result<true, PromotionError> {
    if (!promotion.isActive) {
      return this.error('PROMOTION_INACTIVE', `Promosi ${promotion.code} sedang tidak aktif.`);
    }

    if (context.evaluatedAt.getTime() < promotion.validity.startsAt.getTime()) {
      return this.error('PROMOTION_NOT_STARTED', `Promosi ${promotion.code} belum dimulai.`);
    }

    if (context.evaluatedAt.getTime() > promotion.validity.endsAt.getTime()) {
      return this.error('PROMOTION_EXPIRED', `Promosi ${promotion.code} sudah berakhir.`);
    }

    const minimumSpend = promotion.minimumSpend;
    if (minimumSpend !== undefined) {
      if (minimumSpend.currency !== context.subtotal.currency) {
        return this.error(
          'CURRENCY_MISMATCH',
          `Mata uang minimum belanja (${minimumSpend.currency}) berbeda dengan subtotal (${context.subtotal.currency}).`
        );
      }
      if (context.subtotal.amount < minimumSpend.amount) {
        return this.error(
          'MINIMUM_SPEND_NOT_MET',
          `Minimum belanja ${minimumSpend.amount} ${minimumSpend.currency} belum terpenuhi.`
        );
      }
    }

    return ok(true as const);
  }

  applyDiscount(
    baseAmount: Money,
    promotion: Promotion
  ): Result<PromotionApplicationResult, PromotionError> {
    if (!isValidMoneyAmount(baseAmount.amount)) {
      return this.error('INVALID_DISCOUNT_VALUE', 'Nilai dasar diskon harus integer non-negatif.');
    }

    const discount = this.computeDiscount(baseAmount, promotion);
    if (!discount.success) {
      return discount;
    }

    return ok<PromotionApplicationResult>({
      promotionId: promotion.id,
      discountType: promotion.discountType,
      discountAmount: discount.data,
      amountAfterDiscount: createMoney(
        baseAmount.amount - discount.data.amount,
        baseAmount.currency
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private computeDiscount(baseAmount: Money, promotion: Promotion): Result<Money, PromotionError> {
    switch (promotion.discountType) {
      case 'PERCENTAGE':
        return this.computePercentage(baseAmount, promotion);
      case 'FIXED_AMOUNT':
        return this.computeFixedAmount(baseAmount, promotion);
      default:
        return assertNever(promotion);
    }
  }

  private computePercentage(
    baseAmount: Money,
    promotion: PercentageDiscountPromotion
  ): Result<Money, PromotionError> {
    const { percentage, maxDiscountAmount } = promotion;

    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return this.error('INVALID_DISCOUNT_VALUE', 'Persentase diskon harus di antara 0 dan 100.');
    }

    let discount = Math.floor((baseAmount.amount * percentage) / 100);

    if (maxDiscountAmount !== undefined) {
      if (maxDiscountAmount.currency !== baseAmount.currency) {
        return this.error(
          'CURRENCY_MISMATCH',
          `Mata uang batas diskon (${maxDiscountAmount.currency}) berbeda dengan nilai dasar (${baseAmount.currency}).`
        );
      }
      if (!isValidMoneyAmount(maxDiscountAmount.amount)) {
        return this.error('INVALID_DISCOUNT_VALUE', 'Batas maksimum diskon harus integer non-negatif.');
      }
      discount = Math.min(discount, maxDiscountAmount.amount);
    }

    return ok(createMoney(Math.min(discount, baseAmount.amount), baseAmount.currency));
  }

  private computeFixedAmount(
    baseAmount: Money,
    promotion: FixedAmountDiscountPromotion
  ): Result<Money, PromotionError> {
    const { amount } = promotion;

    if (!isValidMoneyAmount(amount.amount)) {
      return this.error('INVALID_DISCOUNT_VALUE', 'Nominal diskon harus integer non-negatif.');
    }
    if (amount.currency !== baseAmount.currency) {
      return this.error(
        'CURRENCY_MISMATCH',
        `Mata uang diskon (${amount.currency}) berbeda dengan nilai dasar (${baseAmount.currency}).`
      );
    }

    return ok(createMoney(Math.min(amount.amount, baseAmount.amount), baseAmount.currency));
  }

  private error(
    code: PromotionValidationFailureReason,
    message: string
  ): Failure<PromotionError> {
    return fail<PromotionError>({ code, message });
  }
}
