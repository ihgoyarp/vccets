import type {
  Cart,
  CartId,
  CartItem,
  CartItemId,
  CurrencyCode,
  CustomerId,
  DateRange,
  FixedAmountDiscountPromotion,
  Money,
  PercentageDiscountPromotion,
  ProductId,
  PromotionCode,
  PromotionId,
  Quantity,
  SkuCode,
} from '../../domain/types';

// ---------------------------------------------------------------------------
// Branded-type casters (khusus test — bukan bagian dari domain)
// ---------------------------------------------------------------------------

export const asProductId = (value: string): ProductId => value as ProductId;
export const asSku = (value: string): SkuCode => value as SkuCode;
export const asCartId = (value: string): CartId => value as CartId;
export const asCartItemId = (value: string): CartItemId => value as CartItemId;
export const asCustomerId = (value: string): CustomerId => value as CustomerId;
export const asQuantity = (value: number): Quantity => value as Quantity;
export const asPromotionId = (value: string): PromotionId => value as PromotionId;
export const asPromotionCode = (value: string): PromotionCode => value as PromotionCode;

// ---------------------------------------------------------------------------
// Value object helpers
// ---------------------------------------------------------------------------

export const money = (amount: number, currency: CurrencyCode = 'IDR'): Money => ({
  amount,
  currency,
});

const activeValidity: DateRange = {
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: new Date('2026-12-31T23:59:59Z'),
};

// ---------------------------------------------------------------------------
// Builders — Cart & CartItem
// ---------------------------------------------------------------------------

export const buildCartItem = (overrides: Partial<CartItem> = {}): CartItem => {
  const unitPrice = overrides.unitPrice ?? money(50_000);
  const quantity = overrides.quantity ?? asQuantity(2);

  return {
    id: asCartItemId('item-1'),
    productId: asProductId('product-1'),
    sku: asSku('SKU-001'),
    unitPrice,
    quantity,
    subtotal: money(unitPrice.amount * quantity, unitPrice.currency),
    ...overrides,
  };
};

export const buildCart = (items: CartItem[], overrides: Partial<Cart> = {}): Cart => ({
  id: asCartId('cart-1'),
  customerId: asCustomerId('customer-1'),
  items,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Builders — Promotion (diskon tunggal: persentase & nominal)
// ---------------------------------------------------------------------------

export const buildPercentagePromotion = (
  overrides: Partial<PercentageDiscountPromotion> = {}
): PercentageDiscountPromotion => ({
  id: asPromotionId('promo-percentage-1'),
  code: asPromotionCode('DISKON10'),
  name: 'Diskon 10%',
  isActive: true,
  validity: activeValidity,
  discountType: 'PERCENTAGE',
  percentage: 10,
  ...overrides,
});

export const buildFixedAmountPromotion = (
  overrides: Partial<FixedAmountDiscountPromotion> = {}
): FixedAmountDiscountPromotion => ({
  id: asPromotionId('promo-fixed-1'),
  code: asPromotionCode('POTONGAN20K'),
  name: 'Potongan Rp20.000',
  isActive: true,
  validity: activeValidity,
  discountType: 'FIXED_AMOUNT',
  amount: money(20_000),
  ...overrides,
});
