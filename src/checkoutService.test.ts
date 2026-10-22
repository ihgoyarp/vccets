import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckoutRequest,
  CheckoutResult,
  ICartRepository,
  ICheckoutService,
  IInventoryService,
  IPromotionEngine,
  StockCheckRequest,
  StockCheckResult,
} from '../domain/types';
import { CheckoutService } from '../application/services/checkout.service';
import {
  asCartId,
  asCartItemId,
  asCustomerId,
  asProductId,
  asQuantity,
  buildCart,
  buildCartItem,
  money,
} from './test-utils/fixtures';

describe('CheckoutService', () => {
  let cartRepository: Mocked<ICartRepository>;
  let inventoryService: Mocked<IInventoryService>;
  let promotionEngine: Mocked<IPromotionEngine>;
  let checkoutService: ICheckoutService;

  beforeEach(() => {
    cartRepository = {
      findById: vi.fn(),
      findActiveByCustomerId: vi.fn(),
    };

    inventoryService = {
      getStockLevel: vi.fn(),
      checkStock: vi.fn(),
      reserveStock: vi.fn(),
      releaseReservation: vi.fn(),
    };

    promotionEngine = {
      validatePromotion: vi.fn(),
      applyDiscount: vi.fn(),
    };

    checkoutService = new CheckoutService(cartRepository, inventoryService, promotionEngine);
  });

  it('berhasil menghitung total belanja ketika seluruh item memiliki stok yang cukup', async () => {
    const itemA = buildCartItem({
      id: asCartItemId('item-a'),
      productId: asProductId('product-a'),
      unitPrice: money(50_000),
      quantity: asQuantity(2),
      subtotal: money(100_000),
    });
    const itemB = buildCartItem({
      id: asCartItemId('item-b'),
      productId: asProductId('product-b'),
      unitPrice: money(30_000),
      quantity: asQuantity(1),
      subtotal: money(30_000),
    });
    const cart = buildCart([itemA, itemB], {
      id: asCartId('cart-checkout-1'),
      customerId: asCustomerId('customer-1'),
    });

    cartRepository.findById.mockResolvedValue(cart);
    inventoryService.checkStock.mockImplementation(
      async ({ productId, requestedQuantity }: StockCheckRequest): Promise<StockCheckResult> => ({
        isAvailable: true,
        productId,
        availableQuantity: requestedQuantity,
      })
    );

    const request: CheckoutRequest = {
      cartId: cart.id,
      customerId: cart.customerId,
    };

    const result: CheckoutResult = await checkoutService.checkout(request);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.subtotal).toEqual(money(130_000));
      expect(result.data.summary.grandTotal).toEqual(money(130_000));
    }
    expect(inventoryService.checkStock).toHaveBeenCalledTimes(2);
  });

  it('gagal checkout ketika salah satu item stoknya tidak mencukupi', async () => {
    const itemA = buildCartItem({
      productId: asProductId('product-a'),
      quantity: asQuantity(5),
    });
    const cart = buildCart([itemA], { id: asCartId('cart-checkout-2') });

    cartRepository.findById.mockResolvedValue(cart);
    inventoryService.checkStock.mockResolvedValue({
      isAvailable: false,
      productId: itemA.productId,
      availableQuantity: asQuantity(1),
      reason: 'INSUFFICIENT_STOCK',
    });

    const request: CheckoutRequest = {
      cartId: cart.id,
      customerId: cart.customerId,
    };

    const result = await checkoutService.checkout(request);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('STOCK_UNAVAILABLE');
    }
    expect(cartRepository.findById).toHaveBeenCalledWith(cart.id);
  });
});
