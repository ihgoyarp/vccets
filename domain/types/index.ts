/**
 * domain/types/index.ts
 * -----------------------------------------------------------------------------
 * Barrel export — titik masuk tunggal untuk seluruh domain types & interfaces.
 * Modul lain (application/infrastructure layer) cukup import dari path ini,
 * mis: `import type { Product, ICheckoutService } from '@/domain/types';`
 * -----------------------------------------------------------------------------
 */

export * from './common.types';
export * from './product.types';
export * from './cart.types';
export * from './promotion.types';
