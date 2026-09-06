/**
 * ============================================================
 * E-Commerce Checkout & Promotion Engine
 * ============================================================
 * Modul TypeScript untuk:
 * 1. Pengecekan ketersediaan stok produk
 * 2. Perhitungan total harga belanjaan
 * 3. Penerapan kupon diskon (persentase / nominal tetap)
 *
 * Cara menjalankan (lihat bagian paling bawah file untuk contoh):
 *   npm install -D typescript ts-node
 *   npx ts-node checkout-engine.ts
 * ============================================================
 */
// Error kustom agar mudah dibedakan penyebab kegagalannya
class CheckoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "CheckoutError";
    }
}
// ------------------------------------------------------------
// 2. CLASS UTAMA: CheckoutEngine
// ------------------------------------------------------------
class CheckoutEngine {
    products = new Map();
    coupons = new Map();
    constructor(products = [], coupons = []) {
        products.forEach((p) => this.products.set(p.id, { ...p }));
        coupons.forEach((c) => this.coupons.set(c.code.toUpperCase(), { ...c }));
    }
    // ---------- Manajemen data (helper) ----------
    addProduct(product) {
        this.products.set(product.id, { ...product });
    }
    addCoupon(coupon) {
        this.coupons.set(coupon.code.toUpperCase(), { ...coupon });
    }
    getProduct(productId) {
        return this.products.get(productId);
    }
    // ---------- FITUR 1: Pengecekan ketersediaan stok ----------
    /**
     * Mengecek apakah produk tersedia dengan jumlah yang diminta.
     */
    checkStock(productId, quantity) {
        const product = this.products.get(productId);
        if (!product) {
            throw new CheckoutError(`Produk dengan ID "${productId}" tidak ditemukan.`);
        }
        if (quantity <= 0) {
            throw new CheckoutError(`Kuantitas untuk produk "${productId}" harus lebih dari 0.`);
        }
        return product.stock >= quantity;
    }
    /**
     * Mengecek ketersediaan stok untuk seluruh isi keranjang sekaligus.
     * Mengembalikan daftar item yang stoknya tidak mencukupi.
     */
    checkCartStock(cartItems) {
        const shortages = [];
        for (const item of cartItems) {
            const product = this.products.get(item.productId);
            if (!product) {
                throw new CheckoutError(`Produk dengan ID "${item.productId}" tidak ditemukan.`);
            }
            if (product.stock < item.quantity) {
                shortages.push({
                    productId: item.productId,
                    requested: item.quantity,
                    available: product.stock,
                });
            }
        }
        return shortages;
    }
    // ---------- FITUR 2: Perhitungan total harga ----------
    /**
     * Menghitung subtotal (harga x kuantitas) untuk seluruh item di keranjang,
     * tanpa memotong stok atau menerapkan kupon.
     */
    calculateSubtotal(cartItems) {
        const items = [];
        let subtotal = 0;
        for (const item of cartItems) {
            const product = this.products.get(item.productId);
            if (!product) {
                throw new CheckoutError(`Produk dengan ID "${item.productId}" tidak ditemukan.`);
            }
            if (item.quantity <= 0) {
                throw new CheckoutError(`Kuantitas untuk produk "${item.productId}" harus lebih dari 0.`);
            }
            const itemSubtotal = product.price * item.quantity;
            subtotal += itemSubtotal;
            items.push({
                productId: product.id,
                name: product.name,
                quantity: item.quantity,
                unitPrice: product.price,
                subtotal: itemSubtotal,
            });
        }
        return { items, subtotal };
    }
    // ---------- FITUR 3: Penerapan kupon diskon ----------
    /**
     * Menghitung besaran diskon berdasarkan kode kupon dan subtotal belanja.
     * Melempar CheckoutError jika kupon tidak valid atau syarat tidak terpenuhi.
     */
    applyCoupon(couponCode, subtotal) {
        const coupon = this.coupons.get(couponCode.toUpperCase());
        if (!coupon) {
            throw new CheckoutError(`Kode kupon "${couponCode}" tidak valid atau sudah tidak berlaku.`);
        }
        if (coupon.minPurchase && subtotal < coupon.minPurchase) {
            throw new CheckoutError(`Kupon "${coupon.code}" membutuhkan minimum belanja Rp${coupon.minPurchase.toLocaleString("id-ID")}. Subtotal Anda Rp${subtotal.toLocaleString("id-ID")}.`);
        }
        let discount = 0;
        if (coupon.type === "PERCENTAGE") {
            discount = (coupon.value / 100) * subtotal;
            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
        }
        else if (coupon.type === "FIXED") {
            discount = coupon.value;
        }
        // Diskon tidak boleh melebihi subtotal (hindari total minus)
        if (discount > subtotal) {
            discount = subtotal;
        }
        return { discount, coupon };
    }
    // ---------- PROSES CHECKOUT LENGKAP (menggabungkan 3 fitur) ----------
    /**
     * Menjalankan alur checkout penuh:
     * 1. Cek stok semua item
     * 2. Hitung subtotal
     * 3. Terapkan kupon (jika ada)
     * Mengembalikan objek CheckoutResult yang siap ditampilkan/disimpan.
     * Stok produk akan dikurangi otomatis jika checkout berhasil.
     */
    checkout(cartItems, couponCode) {
        if (!cartItems || cartItems.length === 0) {
            throw new CheckoutError("Keranjang belanja kosong.");
        }
        // 1. Validasi stok
        const shortages = this.checkCartStock(cartItems);
        if (shortages.length > 0) {
            const detail = shortages
                .map((s) => `${s.productId} (diminta: ${s.requested}, tersedia: ${s.available})`)
                .join(", ");
            throw new CheckoutError(`Stok tidak mencukupi untuk: ${detail}.`);
        }
        // 2. Hitung subtotal
        const { items, subtotal } = this.calculateSubtotal(cartItems);
        // 3. Terapkan kupon jika diberikan
        let discount = 0;
        let couponApplied = null;
        if (couponCode) {
            const result = this.applyCoupon(couponCode, subtotal);
            discount = result.discount;
            couponApplied = result.coupon.code;
        }
        const total = subtotal - discount;
        // 4. Kurangi stok (checkout dianggap final/berhasil)
        for (const item of cartItems) {
            const product = this.products.get(item.productId);
            product.stock -= item.quantity;
        }
        return {
            success: true,
            message: "Checkout berhasil.",
            items,
            subtotal,
            discount,
            couponApplied,
            total,
        };
    }
}
// ------------------------------------------------------------
// 3. CONTOH PENGGUNAAN
// ------------------------------------------------------------
function formatRupiah(amount) {
    return `Rp${amount.toLocaleString("id-ID")}`;
}
function main() {
    // Data awal: daftar produk
    const initialProducts = [
        { id: "P001", name: "Kaos Polos Hitam", price: 75000, stock: 10 },
        { id: "P002", name: "Celana Jeans", price: 250000, stock: 5 },
        { id: "P003", name: "Sepatu Sneakers", price: 450000, stock: 2 },
    ];
    // Data awal: daftar kupon
    const initialCoupons = [
        { code: "DISKON10", type: "PERCENTAGE", value: 10, maxDiscount: 50000 },
        { code: "POTONG20K", type: "FIXED", value: 20000, minPurchase: 100000 },
    ];
    const engine = new CheckoutEngine(initialProducts, initialCoupons);
    console.log("=== CONTOH 1: Cek stok produk ===");
    console.log("Stok P001 cukup untuk 3 pcs?", engine.checkStock("P001", 3)); // true
    console.log("Stok P003 cukup untuk 5 pcs?", engine.checkStock("P003", 5)); // false
    console.log();
    console.log("=== CONTOH 2: Hitung subtotal belanja ===");
    const cart = [
        { productId: "P001", quantity: 2 }, // 2 x 75.000
        { productId: "P002", quantity: 1 }, // 1 x 250.000
    ];
    const subtotalResult = engine.calculateSubtotal(cart);
    subtotalResult.items.forEach((it) => console.log(`- ${it.name} x${it.quantity} = ${formatRupiah(it.subtotal)}`));
    console.log("Subtotal:", formatRupiah(subtotalResult.subtotal));
    console.log();
    console.log("=== CONTOH 3: Checkout dengan kupon persentase (DISKON10) ===");
    try {
        const result1 = engine.checkout(cart, "DISKON10");
        console.log(JSON.stringify(result1, null, 2));
        console.log("Total bayar:", formatRupiah(result1.total));
    }
    catch (err) {
        if (err instanceof CheckoutError) {
            console.error("Checkout gagal:", err.message);
        }
        else {
            throw err;
        }
    }
    console.log();
    console.log("=== CONTOH 4: Checkout dengan kupon nominal tetap (POTONG20K) ===");
    const engine2 = new CheckoutEngine(initialProducts, initialCoupons); // reset stok
    try {
        const cart2 = [{ productId: "P002", quantity: 1 }];
        const result2 = engine2.checkout(cart2, "POTONG20K");
        console.log("Total bayar:", formatRupiah(result2.total));
    }
    catch (err) {
        if (err instanceof CheckoutError)
            console.error("Checkout gagal:", err.message);
    }
    console.log();
    console.log("=== CONTOH 5: Checkout gagal karena stok tidak cukup ===");
    const engine3 = new CheckoutEngine(initialProducts, initialCoupons);
    try {
        const cartGagal = [{ productId: "P003", quantity: 10 }]; // stok hanya 2
        engine3.checkout(cartGagal);
    }
    catch (err) {
        if (err instanceof CheckoutError)
            console.error("Checkout gagal:", err.message);
    }
    console.log();
    console.log("=== CONTOH 6: Checkout gagal karena kupon tidak valid ===");
    const engine4 = new CheckoutEngine(initialProducts, initialCoupons);
    try {
        engine4.checkout([{ productId: "P001", quantity: 1 }], "KUPONNGASAL");
    }
    catch (err) {
        if (err instanceof CheckoutError)
            console.error("Checkout gagal:", err.message);
    }
}
main();
// Export untuk digunakan di file/modul lain
export { CheckoutEngine, CheckoutError };
