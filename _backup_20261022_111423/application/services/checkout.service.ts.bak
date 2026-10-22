import type {
  Cart,
  CheckoutFailureReason,
  CheckoutRequest,
  CheckoutResult,
  CheckoutSummary,
  CurrencyCode,
  DomainError,
  Failure,
  ICartRepository,
  ICheckoutService,
  IInventoryService,
  IPromotionEngine,
  IPromotionRepository,
  Money,
  OrderId,
  ProductId,
  PromotionApplicationResult,
  PromotionCode,
  Quantity,
  Result,
  StockCheckResult,
} from '../../domain/types';
import { DEFAULT_CURRENCY, createMoney, isValidMoneyAmount } from '../shared/money';
import { fail, ok } from '../shared/result';

type CheckoutError = DomainError<CheckoutFailureReason>;
type UnavailableStock = Extract<StockCheckResult, { readonly isAvailable: false }>;

const isUnavailable = (result: StockCheckResult): result is UnavailableStock =>
  !result.isAvailable;

const defaultOrderIdGenerator = (): OrderId =>
  `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` as OrderId;

/**
 * Dependency opsional. Semuanya punya default sehingga CheckoutService
 * cukup dibuat dengan tiga dependency utama.
 */
export interface CheckoutServiceOptions {
  /** Diperlukan agar kode promo bisa di-resolve menjadi Promotion. */
  readonly promotionRepository?: IPromotionRepository;
  /** Sumber waktu (dapat di-inject agar deterministik saat testing). */
  readonly clock?: () => Date;
  readonly generateOrderId?: () => OrderId;
}

/**
 * Dilempar oleh `calculateSummary` (kontraknya mengembalikan CheckoutSummary
 * langsung, bukan Result) ketika kalkulasi tidak dapat dilakukan.
 * `checkout` tidak melempar — ia selalu mengembalikan Result.
 */
export class CheckoutDomainError extends Error {
  readonly code: CheckoutFailureReason;

  constructor(error: CheckoutError) {
    super(error.message);
    this.name = 'CheckoutDomainError';
    this.code = error.code;
  }
}

export class CheckoutService implements ICheckoutService {
  private readonly cartRepository: ICartRepository;
  private readonly inventoryService: IInventoryService;
  private readonly promotionEngine: IPromotionEngine;
  private readonly promotionRepository: IPromotionRepository | undefined;
  private readonly clock: () => Date;
  private readonly generateOrderId: () => OrderId;

  constructor(
    cartRepository: ICartRepository,
    inventoryService: IInventoryService,
    promotionEngine: IPromotionEngine,
    options: CheckoutServiceOptions = {}
  ) {
    this.cartRepository = cartRepository;
    this.inventoryService = inventoryService;
    this.promotionEngine = promotionEngine;
    this.promotionRepository = options.promotionRepository;
    this.clock = options.clock ?? (() => new Date());
    this.generateOrderId = options.generateOrderId ?? defaultOrderIdGenerator;
  }

  /**
   * Menjumlah unitPrice x quantity seluruh item. Cart kosong menghasilkan 0
   * dalam mata uang default. Melempar RangeError bila mata uang item campur
   * (pelanggaran invarian; `checkout` sudah memeriksanya lebih dulu).
   */
  calculateSubtotal(cart: Cart): Money {
    const currency: CurrencyCode = cart.items[0]?.unitPrice.currency ?? DEFAULT_CURRENCY;
    let total = 0;

    for (const item of cart.items) {
      if (item.unitPrice.currency !== currency) {
        throw new RangeError('Item cart memakai lebih dari satu mata uang.');
      }
      total += item.unitPrice.amount * item.quantity;
    }

    return createMoney(total, currency);
  }

  async calculateSummary(cart: Cart, promotionCode?: PromotionCode): Promise<CheckoutSummary> {
    const validation = this.validateCart(cart);
    if (!validation.success) {
      throw new CheckoutDomainError(validation.error);
    }

    const summary = await this.computeSummary(cart, promotionCode ?? cart.appliedPromotionCode);
    if (!summary.success) {
      throw new CheckoutDomainError(summary.error);
    }

    return summary.data;
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const cart = await this.cartRepository.findById(request.cartId);

    if (cart === null || cart.customerId !== request.customerId) {
      return this.failure('CART_NOT_FOUND', `Cart ${request.cartId} tidak ditemukan.`);
    }
    if (cart.items.length === 0) {
      return this.failure('CART_EMPTY', 'Cart kosong, tidak ada yang dapat di-checkout.');
    }

    const validation = this.validateCart(cart);
    if (!validation.success) {
      return validation;
    }

    const unavailable = await this.findUnavailableStock(cart);
    if (unavailable !== undefined) {
      return this.failure(
        'STOCK_UNAVAILABLE',
        `Stok produk ${unavailable.productId} tidak mencukupi ` +
          `(tersedia: ${unavailable.availableQuantity}, alasan: ${unavailable.reason}).`
      );
    }

    const summary = await this.computeSummary(
      cart,
      request.promotionCode ?? cart.appliedPromotionCode
    );
    if (!summary.success) {
      return summary;
    }

    return ok({ orderId: this.generateOrderId(), summary: summary.data });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private validateCart(cart: Cart): Result<true, CheckoutError> {
    const currencies = new Set<CurrencyCode>();

    for (const item of cart.items) {
      const isValidQuantity = Number.isInteger(item.quantity) && item.quantity >= 1;
      if (!isValidQuantity || !isValidMoneyAmount(item.unitPrice.amount)) {
        return this.failure(
          'INVALID_CART_ITEM',
          `Item ${item.id} tidak valid: quantity harus integer >= 1 dan harga integer non-negatif.`
        );
      }
      currencies.add(item.unitPrice.currency);
    }

    if (currencies.size > 1) {
      return this.failure('CURRENCY_MISMATCH', 'Item cart memakai lebih dari satu mata uang.');
    }

    return ok(true as const);
  }

  /**
   * Stok dicek per produk dengan kuantitas teragregasi, sehingga produk yang
   * muncul di beberapa baris cart tidak lolos hanya karena tiap baris "cukup".
   */
  private async findUnavailableStock(cart: Cart): Promise<UnavailableStock | undefined> {
    const requested = new Map<ProductId, number>();
    for (const item of cart.items) {
      requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    }

    const results = await Promise.all(
      Array.from(requested, ([productId, total]) =>
        this.inventoryService.checkStock({
          productId,
          requestedQuantity: total as Quantity,
        })
      )
    );

    return results.find(isUnavailable);
  }

  private async computeSummary(
    cart: Cart,
    promotionCode: PromotionCode | undefined
  ): Promise<Result<CheckoutSummary, CheckoutError>> {
    const subtotal = this.calculateSubtotal(cart);

    if (promotionCode === undefined) {
      return ok<CheckoutSummary>({ subtotal, grandTotal: subtotal });
    }

    const discount = await this.resolveDiscount(subtotal, promotionCode);
    if (!discount.success) {
      return discount;
    }

    return ok<CheckoutSummary>({
      subtotal,
      discount: discount.data,
      grandTotal: discount.data.amountAfterDiscount,
    });
  }

  private async resolveDiscount(
    subtotal: Money,
    promotionCode: PromotionCode
  ): Promise<Result<PromotionApplicationResult, CheckoutError>> {
    if (this.promotionRepository === undefined) {
      return this.failure(
        'PROMOTION_INVALID',
        `Kode promo ${promotionCode} tidak dapat diproses: promotionRepository tidak dikonfigurasi.`
      );
    }

    const promotion = await this.promotionRepository.findByCode(promotionCode);
    if (promotion === null) {
      return this.failure('PROMOTION_INVALID', `Kode promo ${promotionCode} tidak ditemukan.`);
    }

    const validation = this.promotionEngine.validatePromotion(promotion, {
      subtotal,
      evaluatedAt: this.clock(),
    });
    if (!validation.success) {
      return this.failure('PROMOTION_INVALID', validation.error.message);
    }

    const applied = this.promotionEngine.applyDiscount(subtotal, promotion);
    if (!applied.success) {
      return this.failure('PROMOTION_INVALID', applied.error.message);
    }

    return ok(applied.data);
  }

  private failure(code: CheckoutFailureReason, message: string): Failure<CheckoutError> {
    return fail<CheckoutError>({ code, message });
  }
}
