/**
 * ============================================================
 * E-Commerce Checkout & Promotion Engine (v2 - Change Request)
 * ============================================================
 * Perubahan dari versi sebelumnya:
 * 1. STACKING DISCOUNT   -> bisa pakai >1 kode promo sekaligus
 *                           (mis. diskon kategori + diskon metode bayar)
 * 2. FLASH SALE          -> promo bisa dibatasi jam tayang & kuota harian
 * 3. EDGE CASE HANDLING  -> jika stok/kuota berubah di tengah proses
 *                           checkout, promo terkait otomatis dibatalkan
 *                           dan total dihitung ulang (bukan crash)
 *
 * Cara menjalankan:
 *   npx tsc checkout-engine.ts && node checkout-engine.js
 *   (atau: npx tsx checkout-engine.ts / npx ts-node checkout-engine.ts)
 * ============================================================
 */

// ------------------------------------------------------------
// 1. TIPE DATA & INTERFACE
// ------------------------------------------------------------

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string; // dipakai untuk promo bertipe CATEGORY
}

interface CartItem {
  productId: string;
  quantity: number;
}

type PromoValueType = "PERCENTAGE" | "FIXED";
type PromoScope = "CART" | "CATEGORY" | "PAYMENT_METHOD";

interface PromoSchedule {
  startHour: number; // 0-23, inklusif
  endHour: number; // 0-23, eksklusif (mis. 12-14 -> berlaku 12:00:00 s.d. 13:59:59)
}

interface Promo {
  code: string;
  description?: string;
  valueType: PromoValueType;
  value: number; // PERCENTAGE: 0-100, FIXED: nominal Rupiah
  scope: PromoScope;
  categoryId?: string; // wajib jika scope === "CATEGORY"
  paymentMethod?: string; // wajib jika scope === "PAYMENT_METHOD" (mis. "GOPAY", "CREDIT_CARD")
  minPurchase?: number; // syarat minimum belanja pada cakupan (scope) terkait
  maxDiscount?: number; // batas maksimum potongan (khusus PERCENTAGE)
  schedule?: PromoSchedule; // jam berlaku (flash sale). Kosong = berlaku sepanjang hari
  dailyQuota?: number; // batas jumlah pemakaian per hari. Kosong = tanpa batas
  stackable?: boolean; // default true. false = tidak bisa digabung promo lain
}

interface ItemLine {
  productId: string;
  name: string;
  category: string;
  requestedQuantity: number; // qty yang diminta user di awal
  quantity: number; // qty final setelah validasi commit-time
  unitPrice: number;
  subtotal: number; // unitPrice * quantity (final)
  adjusted: boolean; // true jika quantity dikurangi/dibatalkan karena stok berubah
}

interface AppliedPromoDetail {
  code: string;
  scope: PromoScope;
  valueType: PromoValueType;
  discount: number;
}

interface RejectedPromoDetail {
  code: string;
  reason: string;
}

interface CheckoutOptions {
  paymentMethod?: string; // mis. "GOPAY", "CREDIT_CARD", "COD"
  now?: Date; // waktu transaksi, default: waktu saat ini (untuk testing flash sale)
}

interface CheckoutResult {
  success: boolean;
  message: string;
  items: ItemLine[];
  subtotal: number; // total setelah kemungkinan penyesuaian stok, sebelum diskon
  totalDiscount: number;
  appliedPromos: AppliedPromoDetail[];
  rejectedPromos: RejectedPromoDetail[];
  warnings: string[]; // catatan penyesuaian otomatis (stok/kuota berubah, dsb)
  total: number;
  paymentMethod?: string;
}

class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}

// ------------------------------------------------------------
// 2. CLASS UTAMA: CheckoutEngine
// ------------------------------------------------------------

class CheckoutEngine {
  private products: Map<string, Product> = new Map();
  private promos: Map<string, Promo> = new Map();
  // Pemakaian kuota promo per hari: key = kode promo, value = { tanggal, jumlah terpakai }
  private promoUsage: Map<string, { date: string; used: number }> = new Map();

  constructor(products: Product[] = [], promos: Promo[] = []) {
    products.forEach((p) => this.products.set(p.id, { ...p }));
    promos.forEach((pr) => this.promos.set(pr.code.toUpperCase(), { ...pr }));
  }

  // ---------- Manajemen data ----------

  addProduct(product: Product): void {
    this.products.set(product.id, { ...product });
  }

  addPromo(promo: Promo): void {
    this.promos.set(promo.code.toUpperCase(), { ...promo });
  }

  getProduct(productId: string): Product | undefined {
    return this.products.get(productId);
  }

  /** Simulasi perubahan stok oleh proses lain (mis. transaksi customer lain) di tengah checkout. */
  simulateExternalStockChange(productId: string, newStock: number): void {
    const p = this.products.get(productId);
    if (p) p.stock = newStock;
  }

  /** Simulasi kuota promo mendadak habis dipakai transaksi lain (untuk testing race condition). */
  simulateExternalPromoUsage(code: string, usedCount: number, now: Date = new Date()): void {
    this.promoUsage.set(code.toUpperCase(), { date: this.getTodayKey(now), used: usedCount });
  }

  private getTodayKey(date: Date): string {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // ---------- FITUR 1: Pengecekan ketersediaan stok ----------

  checkStock(productId: string, quantity: number): boolean {
    const product = this.products.get(productId);
    if (!product) {
      throw new CheckoutError(`Produk dengan ID "${productId}" tidak ditemukan.`);
    }
    if (quantity <= 0) {
      throw new CheckoutError(`Kuantitas untuk produk "${productId}" harus lebih dari 0.`);
    }
    return product.stock >= quantity;
  }

  checkCartStock(cartItems: CartItem[]): { productId: string; requested: number; available: number }[] {
    const shortages: { productId: string; requested: number; available: number }[] = [];
    for (const item of cartItems) {
      const product = this.products.get(item.productId);
      if (!product) {
        throw new CheckoutError(`Produk dengan ID "${item.productId}" tidak ditemukan.`);
      }
      if (product.stock < item.quantity) {
        shortages.push({ productId: item.productId, requested: item.quantity, available: product.stock });
      }
    }
    return shortages;
  }

  // ---------- FITUR 2: Perhitungan total harga ----------

  /** Membangun rincian item + subtotal per kategori dari isi keranjang (snapshot awal). */
  private buildItemLines(cartItems: CartItem[]): {
    items: ItemLine[];
    subtotal: number;
    categorySubtotals: Map<string, number>;
  } {
    const items: ItemLine[] = [];
    const categorySubtotals = new Map<string, number>();
    let subtotal = 0;

    for (const ci of cartItems) {
      const product = this.products.get(ci.productId);
      if (!product) {
        throw new CheckoutError(`Produk dengan ID "${ci.productId}" tidak ditemukan.`);
      }
      if (ci.quantity <= 0) {
        throw new CheckoutError(`Kuantitas untuk produk "${ci.productId}" harus lebih dari 0.`);
      }

      const lineSubtotal = product.price * ci.quantity;
      subtotal += lineSubtotal;
      categorySubtotals.set(product.category, (categorySubtotals.get(product.category) ?? 0) + lineSubtotal);

      items.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        requestedQuantity: ci.quantity,
        quantity: ci.quantity,
        unitPrice: product.price,
        subtotal: lineSubtotal,
        adjusted: false,
      });
    }

    return { items, subtotal, categorySubtotals };
  }

  calculateSubtotal(cartItems: CartItem[]): { items: ItemLine[]; subtotal: number } {
    const { items, subtotal } = this.buildItemLines(cartItems);
    return { items, subtotal };
  }

  // ---------- FITUR 3: Evaluasi promo (stacking, jadwal, kuota) ----------

  /**
   * Mengevaluasi satu promo terhadap kondisi keranjang saat ini.
   * Dipakai dua kali: sekali di validasi awal, sekali lagi di commit-time
   * (untuk mendeteksi perubahan stok/kuota yang terjadi di tengah proses).
   */
  private evaluatePromo(
    promo: Promo,
    ctx: {
      cartSubtotal: number;
      categorySubtotals: Map<string, number>;
      paymentMethod?: string;
      now: Date;
      totalRequested: number; // jumlah kode promo unik yang diminta dalam transaksi ini
    }
  ): { valid: boolean; reason?: string; discount?: number } {
    // Cek exclusivity (tidak bisa stacking)
    if (promo.stackable === false && ctx.totalRequested > 1) {
      return { valid: false, reason: `Promo "${promo.code}" tidak dapat digabung dengan promo lain.` };
    }

    // Cek jadwal (flash sale)
    if (promo.schedule) {
      const hour = ctx.now.getHours();
      const inWindow = hour >= promo.schedule.startHour && hour < promo.schedule.endHour;
      if (!inWindow) {
        return {
          valid: false,
          reason: `Promo hanya berlaku pukul ${promo.schedule.startHour}:00-${promo.schedule.endHour}:00.`,
        };
      }
    }

    // Cek kuota harian (baca saja, belum mengunci/reserve)
    if (promo.dailyQuota !== undefined) {
      const today = this.getTodayKey(ctx.now);
      const rec = this.promoUsage.get(promo.code.toUpperCase());
      const used = rec && rec.date === today ? rec.used : 0;
      if (used >= promo.dailyQuota) {
        return { valid: false, reason: `Kuota harian promo "${promo.code}" sudah habis (maks ${promo.dailyQuota}/hari).` };
      }
    }

    // Tentukan basis perhitungan sesuai scope
    let base = 0;
    if (promo.scope === "CART") {
      base = ctx.cartSubtotal;
    } else if (promo.scope === "CATEGORY") {
      base = ctx.categorySubtotals.get(promo.categoryId ?? "") ?? 0;
      if (base <= 0) {
        return { valid: false, reason: `Tidak ada produk kategori "${promo.categoryId}" di keranjang.` };
      }
    } else if (promo.scope === "PAYMENT_METHOD") {
      if (!ctx.paymentMethod || ctx.paymentMethod !== promo.paymentMethod) {
        return { valid: false, reason: `Promo ini memerlukan metode pembayaran "${promo.paymentMethod}".` };
      }
      base = ctx.cartSubtotal;
    }

    if (promo.minPurchase && base < promo.minPurchase) {
      return {
        valid: false,
        reason: `Minimum belanja Rp${promo.minPurchase.toLocaleString("id-ID")} untuk cakupan promo ini belum terpenuhi.`,
      };
    }

    let discount = promo.valueType === "PERCENTAGE" ? (promo.value / 100) * base : promo.value;
    if (promo.valueType === "PERCENTAGE" && promo.maxDiscount && discount > promo.maxDiscount) {
      discount = promo.maxDiscount;
    }
    if (discount > base) discount = base; // diskon 1 promo tidak boleh melebihi basisnya sendiri

    return { valid: true, discount };
  }

  /** Mengunci (reserve) satu slot kuota harian promo secara atomik. Return false jika sudah penuh. */
  private reserveQuota(code: string, dailyQuota: number, now: Date): boolean {
    const key = code.toUpperCase();
    const today = this.getTodayKey(now);
    const rec = this.promoUsage.get(key);

    if (!rec || rec.date !== today) {
      this.promoUsage.set(key, { date: today, used: 1 });
      return dailyQuota >= 1;
    }
    if (rec.used >= dailyQuota) return false;
    rec.used += 1;
    return true;
  }

  // ---------- PROSES CHECKOUT LENGKAP (2 fase: validasi -> commit) ----------

  /**
   * Alur checkout:
   *  FASE 1 (validasi awal): cek stok & kelayakan tiap promo berdasarkan kondisi saat ini.
   *  --- celah async (mis. menunggu respons payment gateway) ---
   *  FASE 2 (commit): baca ULANG kondisi stok & kuota promo (bisa saja sudah berubah
   *  karena transaksi lain), sesuaikan/batalkan otomatis apa yang sudah tidak valid,
   *  lalu hitung ulang total secara final sebelum benar-benar mengunci stok & kuota.
   */
  async checkout(cartItems: CartItem[], promoCodes: string[] = [], options: CheckoutOptions = {}): Promise<CheckoutResult> {
    const now = options.now ?? new Date();
    const paymentMethod = options.paymentMethod;

    if (!cartItems || cartItems.length === 0) {
      throw new CheckoutError("Keranjang belanja kosong.");
    }

    // Validasi stok awal (fail-fast jika dari awal memang sudah tidak cukup)
    const shortages = this.checkCartStock(cartItems);
    if (shortages.length > 0) {
      const detail = shortages
        .map((s) => `${s.productId} (diminta: ${s.requested}, tersedia: ${s.available})`)
        .join(", ");
      throw new CheckoutError(`Stok tidak mencukupi untuk: ${detail}.`);
    }

    const { items, subtotal, categorySubtotals } = this.buildItemLines(cartItems);

    // ---- FASE 1: evaluasi tiap kode promo (tentatif, belum mengunci kuota) ----
    const uniqueCodes = Array.from(new Set(promoCodes.map((c) => c.toUpperCase())));
    const candidates: { promo: Promo; discount: number }[] = [];
    const rejectedPromos: RejectedPromoDetail[] = [];

    for (const code of uniqueCodes) {
      const promo = this.promos.get(code);
      if (!promo) {
        rejectedPromos.push({ code, reason: "Kode promo tidak ditemukan atau sudah tidak berlaku." });
        continue;
      }
      const evaluation = this.evaluatePromo(promo, {
        cartSubtotal: subtotal,
        categorySubtotals,
        paymentMethod,
        now,
        totalRequested: uniqueCodes.length,
      });
      if (!evaluation.valid) {
        rejectedPromos.push({ code: promo.code, reason: evaluation.reason! });
        continue;
      }
      candidates.push({ promo, discount: evaluation.discount! });
    }

    // ---- CELAH ASYNC: simulasi jeda proses (mis. menunggu payment gateway) ----
    // Di sinilah, pada sistem nyata dengan banyak transaksi bersamaan, stok atau
    // kuota promo bisa berubah akibat checkout customer lain yang selesai lebih dulu.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // ---- FASE 2: commit-time re-validation ----
    const warnings: string[] = [];
    const finalItems: ItemLine[] = [];
    let finalSubtotal = 0;
    const finalCategorySubtotals = new Map<string, number>();

    for (const line of items) {
      const liveProduct = this.products.get(line.productId)!;
      let finalQty = line.quantity;
      let adjusted = false;

      if (liveProduct.stock < finalQty) {
        const available = Math.max(0, liveProduct.stock);
        warnings.push(
          `Stok "${liveProduct.name}" berubah saat proses checkout (tersisa ${available}). ` +
            `Kuantitas otomatis disesuaikan dari ${finalQty} menjadi ${available}.`
        );
        finalQty = available;
        adjusted = true;
      }

      const finalLineSubtotal = liveProduct.price * finalQty;
      finalSubtotal += finalLineSubtotal;
      finalCategorySubtotals.set(
        line.category,
        (finalCategorySubtotals.get(line.category) ?? 0) + finalLineSubtotal
      );

      finalItems.push({ ...line, quantity: finalQty, subtotal: finalLineSubtotal, adjusted });
    }

    // Re-evaluasi tiap promo kandidat terhadap kondisi FINAL, lalu kunci kuotanya
    const appliedPromos: AppliedPromoDetail[] = [];

    for (const cand of candidates) {
      const recheck = this.evaluatePromo(cand.promo, {
        cartSubtotal: finalSubtotal,
        categorySubtotals: finalCategorySubtotals,
        paymentMethod,
        now,
        totalRequested: candidates.length,
      });

      if (!recheck.valid) {
        warnings.push(`Promo "${cand.promo.code}" otomatis dibatalkan saat checkout: ${recheck.reason}`);
        rejectedPromos.push({ code: cand.promo.code, reason: recheck.reason! });
        continue;
      }

      if (cand.promo.dailyQuota !== undefined) {
        const locked = this.reserveQuota(cand.promo.code, cand.promo.dailyQuota, now);
        if (!locked) {
          warnings.push(`Promo "${cand.promo.code}" otomatis dibatalkan: kuota harian baru saja habis terpakai.`);
          rejectedPromos.push({ code: cand.promo.code, reason: "Kuota harian habis." });
          continue;
        }
      }

      appliedPromos.push({
        code: cand.promo.code,
        scope: cand.promo.scope,
        valueType: cand.promo.valueType,
        discount: recheck.discount!,
      });
    }

    let totalDiscount = appliedPromos.reduce((sum, p) => sum + p.discount, 0);
    if (totalDiscount > finalSubtotal) totalDiscount = finalSubtotal; // jaga total tidak minus
    const total = finalSubtotal - totalDiscount;

    // Kunci stok final (hanya untuk qty > 0)
    for (const line of finalItems) {
      if (line.quantity > 0) {
        const p = this.products.get(line.productId)!;
        p.stock -= line.quantity;
      }
    }

    return {
      success: true,
      message: warnings.length > 0 ? "Checkout berhasil dengan penyesuaian otomatis." : "Checkout berhasil.",
      items: finalItems,
      subtotal: finalSubtotal,
      totalDiscount,
      appliedPromos,
      rejectedPromos,
      warnings,
      total,
      paymentMethod,
    };
  }
}

// ------------------------------------------------------------
// 3. CONTOH PENGGUNAAN
// ------------------------------------------------------------

function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function printResult(label: string, result: CheckoutResult) {
  console.log(`--- ${label} ---`);
  result.items.forEach((it) => {
    const tag = it.adjusted ? " (DISESUAIKAN)" : "";
    console.log(`  ${it.name}: ${it.requestedQuantity} -> ${it.quantity} pcs${tag} = ${formatRupiah(it.subtotal)}`);
  });
  console.log("  Subtotal:", formatRupiah(result.subtotal));
  result.appliedPromos.forEach((p) => console.log(`  Promo diterapkan [${p.code}]: -${formatRupiah(p.discount)}`));
  result.rejectedPromos.forEach((p) => console.log(`  Promo ditolak [${p.code}]: ${p.reason}`));
  result.warnings.forEach((w) => console.log(`  WARNING: ${w}`));
  console.log("  Total diskon:", formatRupiah(result.totalDiscount));
  console.log("  TOTAL BAYAR:", formatRupiah(result.total));
  console.log();
}

async function main() {
  const baseProducts: Product[] = [
    { id: "P001", name: "Kaos Polos Hitam", price: 75000, stock: 10, category: "FASHION" },
    { id: "P002", name: "Celana Jeans", price: 250000, stock: 5, category: "FASHION" },
    { id: "P003", name: "Sepatu Sneakers", price: 450000, stock: 3, category: "FASHION" },
    { id: "P004", name: "Power Bank 10000mAh", price: 180000, stock: 4, category: "ELECTRONICS" },
  ];

  const basePromos: Promo[] = [
    // 1. Diskon kategori FASHION 15%, bisa digabung promo lain
    { code: "FASHION15", valueType: "PERCENTAGE", value: 15, scope: "CATEGORY", categoryId: "FASHION", maxDiscount: 100000, stackable: true },
    // 2. Diskon metode pembayaran GoPay, potongan tetap Rp10.000
    { code: "GOPAY10K", valueType: "FIXED", value: 10000, scope: "PAYMENT_METHOD", paymentMethod: "GOPAY", minPurchase: 50000, stackable: true },
    // 3. Flash sale jam 12:00-14:00, diskon 20% dari total belanja, kuota 2 transaksi/hari
    { code: "FLASHJAM12", valueType: "PERCENTAGE", value: 20, scope: "CART", schedule: { startHour: 12, endHour: 14 }, dailyQuota: 2, maxDiscount: 150000, stackable: true },
    // 4. Promo eksklusif: tidak bisa digabung promo lain
    { code: "EXCLUSIVE50K", valueType: "FIXED", value: 50000, scope: "CART", minPurchase: 300000, stackable: false },
  ];

  // Waktu simulasi: dalam jendela flash sale (jam 13:00)
  const duringFlashSale = new Date();
  duringFlashSale.setHours(13, 0, 0, 0);

  // Waktu simulasi: di luar jendela flash sale (jam 09:00)
  const outsideFlashSale = new Date();
  outsideFlashSale.setHours(9, 0, 0, 0);

  // ============================================================
  console.log("=== SKENARIO 1: Stacking - Diskon Kategori + Diskon GoPay ===");
  const engine1 = new CheckoutEngine(baseProducts, basePromos);
  const result1 = await engine1.checkout(
    [
      { productId: "P001", quantity: 2 }, // FASHION
      { productId: "P004", quantity: 1 }, // ELECTRONICS (tidak kena FASHION15)
    ],
    ["FASHION15", "GOPAY10K"],
    { paymentMethod: "GOPAY", now: outsideFlashSale }
  );
  printResult("Stacking 2 promo sekaligus", result1);

  // ============================================================
  console.log("=== SKENARIO 2: Flash Sale - dalam jendela waktu (berhasil) ===");
  const engine2 = new CheckoutEngine(baseProducts, basePromos);
  const result2 = await engine2.checkout(
    [{ productId: "P002", quantity: 1 }],
    ["FLASHJAM12"],
    { now: duringFlashSale }
  );
  printResult("Checkout jam 13:00 (dalam jendela flash sale)", result2);

  // ============================================================
  console.log("=== SKENARIO 3: Flash Sale - di luar jendela waktu (promo ditolak) ===");
  const engine3 = new CheckoutEngine(baseProducts, basePromos);
  const result3 = await engine3.checkout(
    [{ productId: "P002", quantity: 1 }],
    ["FLASHJAM12"],
    { now: outsideFlashSale }
  );
  printResult("Checkout jam 09:00 (di luar jendela flash sale)", result3);

  // ============================================================
  console.log("=== SKENARIO 4: Promo eksklusif ditolak karena digabung promo lain ===");
  const engine4 = new CheckoutEngine(baseProducts, basePromos);
  const result4 = await engine4.checkout(
    [{ productId: "P002", quantity: 2 }], // 2 x 250.000 = 500.000, penuhi minPurchase EXCLUSIVE50K
    ["EXCLUSIVE50K", "GOPAY10K"],
    { paymentMethod: "GOPAY", now: outsideFlashSale }
  );
  printResult("EXCLUSIVE50K digabung dengan GOPAY10K", result4);

  // ============================================================
  console.log("=== SKENARIO 5 (EDGE CASE): Stok mendadak habis di tengah proses checkout ===");
  const engine5 = new CheckoutEngine(baseProducts, basePromos);
  // Checkout dimulai (belum di-await) untuk 2 pcs Sepatu Sneakers (stok awal 3)...
  const checkoutPromise5 = engine5.checkout(
    [{ productId: "P003", quantity: 2 }],
    ["FASHION15"],
    { now: outsideFlashSale }
  );
  // ...tapi TEPAT SETELAH itu, sistem lain "menyerobot" stok hingga tersisa 1 (simulasi race condition)
  engine5.simulateExternalStockChange("P003", 1);
  const result5 = await checkoutPromise5;
  printResult("Stok Sneakers berubah 3 -> 1 di tengah proses (qty diminta 2)", result5);

  // ============================================================
  console.log("=== SKENARIO 6 (EDGE CASE): Kuota flash sale habis di tengah proses checkout ===");
  const engine6 = new CheckoutEngine(baseProducts, basePromos);
  const checkoutPromise6 = engine6.checkout(
    [{ productId: "P002", quantity: 1 }],
    ["FLASHJAM12"],
    { now: duringFlashSale }
  );
  // Di tengah proses, kuota FLASHJAM12 "habis diserobot" transaksi lain (2/2 terpakai)
  engine6.simulateExternalPromoUsage("FLASHJAM12", 2, duringFlashSale);
  const result6 = await checkoutPromise6;
  printResult("Kuota FLASHJAM12 habis (2/2) tepat sebelum commit", result6);
}

main().catch((err) => {
  if (err instanceof CheckoutError) {
    console.error("Checkout gagal:", err.message);
  } else {
    console.error("Terjadi kesalahan tak terduga:", err);
  }
});

// Export untuk digunakan di file/modul lain
export {
  CheckoutEngine,
  CheckoutError,
  Product,
  Promo,
  CartItem,
  CheckoutResult,
  ItemLine,
  AppliedPromoDetail,
  RejectedPromoDetail,
  CheckoutOptions,
};