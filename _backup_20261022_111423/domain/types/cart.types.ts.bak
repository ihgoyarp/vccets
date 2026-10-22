/**
 * cart.types.ts
 * -----------------------------------------------------------------------------
 * Domain: Cart & Checkout
 * Fokus: representasi item keranjang dan kontrak layanan penghitungan total.
 * Tidak ada logika implementasi — murni interfaces & types.
 * -----------------------------------------------------------------------------
 */

import type {
  CartId,
  CartItemId,
  CustomerId,
  DomainError,
  Money,
  OrderId,
  ProductId,
  PromotionCode,
  Quantity,
  Result,
  SkuCode,
} from './common.types';
import type { PromotionApplicationResult } from './promotion.types';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface CartItem {
  readonly id: CartItemId;
  readonly productId: ProductId;
  readonly sku: SkuCode;
  readonly unitPrice: Money;
  readonly quantity: Quantity;
  /** unitPrice.amount * quantity, disimpan eksplisit agar tidak dihitung ulang di UI/layer lain. */
  readonly subtotal: Money;
}

export interface Cart {
  readonly id: CartId;
  readonly customerId: CustomerId;
  readonly items: ReadonlyArray<CartItem>;
  /** Kode promo yang sedang diterapkan pada cart ini, jika ada (diskon tunggal). */
  readonly appliedPromotionCode?: PromotionCode;
}

// ---------------------------------------------------------------------------
// Checkout summary — hasil kalkulasi total
// ---------------------------------------------------------------------------

export interface CheckoutSummary {
  readonly subtotal: Money;
  readonly discount?: PromotionApplicationResult;
  readonly shippingFee?: Money;
  readonly tax?: Money;
  readonly grandTotal: Money;
}

// ---------------------------------------------------------------------------
// Checkout request / result
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  readonly cartId: CartId;
  readonly customerId: CustomerId;
  readonly promotionCode?: PromotionCode;
}

export type CheckoutFailureReason =
  | 'CART_EMPTY'
  | 'CART_NOT_FOUND'
  | 'STOCK_UNAVAILABLE'
  | 'PROMOTION_INVALID'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_CART_ITEM'
  | 'PAYMENT_FAILED';

export interface CheckoutSuccess {
  readonly orderId: OrderId;
  readonly summary: CheckoutSummary;
}

export type CheckoutResult = Result<CheckoutSuccess, DomainError<CheckoutFailureReason>>;

// ---------------------------------------------------------------------------
// Repository & Service contracts
// ---------------------------------------------------------------------------

export interface ICartRepository {
  findById(cartId: CartId): Promise<Cart | null>;
  findActiveByCustomerId(customerId: CustomerId): Promise<Cart | null>;
}

/**
 * Kontrak utama Checkout Service.
 * `calculateSubtotal` dan `calculateSummary` dipisah agar konsumen (mis. tampilan
 * ringkasan cart di halaman keranjang) bisa memakai kalkulasi tanpa harus
 * menjalankan proses checkout penuh.
 */
export interface ICheckoutService {
  calculateSubtotal(cart: Cart): Money;
  calculateSummary(cart: Cart, promotionCode?: PromotionCode): Promise<CheckoutSummary>;
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;
}
