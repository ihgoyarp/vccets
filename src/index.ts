/**
 * Titik masuk publik modul E-Commerce Checkout & Promotion Engine.
 * Implementasi dipisah per layer (domain / application); file ini hanya
 * me-re-export agar konsumen cukup `import { ... } from './src'`.
 */

export * from '../domain/types';
export { CheckoutService, CheckoutDomainError } from '../application/services/checkout.service';
export type { CheckoutServiceOptions } from '../application/services/checkout.service';
export { PromotionEngine } from '../application/services/promotion.service';
