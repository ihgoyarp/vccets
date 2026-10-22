/**
 * product.types.ts
 * -----------------------------------------------------------------------------
 * Domain: Product & Inventory
 * Fokus: representasi produk dan kontrak layanan pengecekan stok.
 * Tidak ada logika implementasi — murni interfaces & types.
 * -----------------------------------------------------------------------------
 */

import type { Money, ProductId, Quantity, Result, SkuCode } from './common.types';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface Product {
  readonly id: ProductId;
  readonly sku: SkuCode;
  readonly name: string;
  readonly price: Money;
  readonly status: ProductStatus;
}

/**
 * Snapshot level stok suatu produk pada satu titik waktu.
 * `availableQuantity` = totalQuantity - reservedQuantity (dihitung di layer implementasi).
 */
export interface StockLevel {
  readonly productId: ProductId;
  readonly totalQuantity: Quantity;
  readonly reservedQuantity: Quantity;
  readonly availableQuantity: Quantity;
}

// ---------------------------------------------------------------------------
// Stock check — request / result
// ---------------------------------------------------------------------------

export interface StockCheckRequest {
  readonly productId: ProductId;
  readonly requestedQuantity: Quantity;
}

export type StockCheckFailureReason =
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'INSUFFICIENT_STOCK';

/**
 * Discriminated union agar konsumen interface WAJIB menangani kedua kasus
 * (tersedia / tidak tersedia) secara eksplisit lewat narrowing pada `isAvailable`.
 */
export type StockCheckResult =
  | {
      readonly isAvailable: true;
      readonly productId: ProductId;
      readonly availableQuantity: Quantity;
    }
  | {
      readonly isAvailable: false;
      readonly productId: ProductId;
      readonly availableQuantity: Quantity;
      readonly reason: StockCheckFailureReason;
    };

// ---------------------------------------------------------------------------
// Stock reservation — dipakai saat checkout menahan stok sementara
// ---------------------------------------------------------------------------

export interface StockReservationRequest {
  readonly productId: ProductId;
  readonly quantity: Quantity;
  readonly reservationTtlSeconds: number;
}

export interface StockReservationToken {
  readonly reservationId: string;
  readonly productId: ProductId;
  readonly reservedQuantity: Quantity;
  readonly expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Repository & Service contracts
// ---------------------------------------------------------------------------

export interface IProductRepository {
  findById(productId: ProductId): Promise<Product | null>;
  findBySku(sku: SkuCode): Promise<Product | null>;
}

/**
 * Kontrak utama untuk pengecekan & pengelolaan stok.
 * Implementasi konkret (mis. berbasis DB, cache, atau layanan pihak ketiga)
 * disusun di layer infrastructure, bukan di sini.
 */
export interface IInventoryService {
  getStockLevel(productId: ProductId): Promise<StockLevel>;
  checkStock(request: StockCheckRequest): Promise<StockCheckResult>;
  reserveStock(request: StockReservationRequest): Promise<Result<StockReservationToken, StockCheckFailureReason>>;
  releaseReservation(reservationId: string): Promise<void>;
}
