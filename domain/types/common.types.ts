/**
 * common.types.ts
 * -----------------------------------------------------------------------------
 * Tipe & interface dasar yang dipakai lintas domain (Product, Cart, Promotion).
 * Tidak ada logika implementasi di file ini — murni kontrak tipe (types only).
 * -----------------------------------------------------------------------------
 */

/**
 * Utility untuk membuat "branded type" / nominal typing di TypeScript.
 * Mencegah tertukarnya string/number polos antar domain (mis. ProductId vs CartId)
 * meskipun secara struktural sama-sama `string`.
 */
export type Brand<K, T extends string> = K & { readonly __brand: T };

// ---------------------------------------------------------------------------
// Identifier types (branded)
// ---------------------------------------------------------------------------

export type ProductId = Brand<string, 'ProductId'>;
export type SkuCode = Brand<string, 'SkuCode'>;
export type CartId = Brand<string, 'CartId'>;
export type CartItemId = Brand<string, 'CartItemId'>;
export type CustomerId = Brand<string, 'CustomerId'>;
export type PromotionId = Brand<string, 'PromotionId'>;
export type PromotionCode = Brand<string, 'PromotionCode'>;
export type OrderId = Brand<string, 'OrderId'>;

// ---------------------------------------------------------------------------
// Primitive value objects
// ---------------------------------------------------------------------------

/**
 * Kode mata uang mengikuti ISO 4217. Dibatasi ke subset yang relevan
 * agar tetap strict; tambahkan sesuai kebutuhan pasar.
 */
export type CurrencyCode = 'IDR' | 'USD' | 'EUR' | 'SGD' | 'MYR';

/**
 * Representasi uang sebagai integer (satuan terkecil, mis. sen/rupiah penuh)
 * untuk menghindari floating-point error. `amount` WAJIB berupa integer >= 0.
 */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/**
 * Kuantitas yang valid harus berupa integer positif (>= 0 untuk stok,
 * >= 1 untuk quantity item di cart). Validasi nilai dilakukan di layer
 * implementasi, bukan di sini — file ini hanya mendeklarasikan bentuknya.
 */
export type Quantity = Brand<number, 'Quantity'>;

/**
 * Rentang waktu berlaku (dipakai promosi, reservasi stok, dsb).
 */
export interface DateRange {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

// ---------------------------------------------------------------------------
// Generic Result type — dipakai agar service interfaces tidak bergantung
// pada exception untuk mengekspresikan kegagalan (explicit error handling).
// ---------------------------------------------------------------------------

export interface Success<T> {
  readonly success: true;
  readonly data: T;
}

export interface Failure<E> {
  readonly success: false;
  readonly error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;

// ---------------------------------------------------------------------------
// Error codes generik yang bisa dipakai/diperluas oleh masing-masing domain
// ---------------------------------------------------------------------------

export interface DomainError<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
}
