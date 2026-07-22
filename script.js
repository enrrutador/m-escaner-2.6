/* ©️ [2024] [SYSMARKETHM]. Todos los derechos reservados. Este archivo es parte de [M-Escaner], propiedad de [SYSMARKETHM]. El uso, distribución o reproducción no autorizados de este material están estrictamente prohibidos. Para obtener permiso para usar cualquier parte de este código, por favor contacta a [https://sysmarket-hm.web.app/]. */

/* ============================================================
   M-Scanner 2.0 - Lógica principal
   - Base de datos local: IndexedDB (ProductDatabase)
   - Escáner: BarcodeDetector API
   - Búsqueda online: VTEX Intelligent Search (Jumbo, Carrefour,
     Farmacity) + Constructor.io (Coto)
   - Import / Export Excel (SheetJS)
   ============================================================ */

/* ------------------------------------------------------------
   Capa de datos local: IndexedDB (sin cambios funcionales)
   ------------------------------------------------------------ */
class ProductDatabase {
    constructor() {
        this.dbName = 'MScannerDB';
        this.dbVersion = 1;
        this.storeName = 'products';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (event) => reject('Error al abrir la base de datos:', event.target.error);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const store = db.createObjectStore(this.storeName, { keyPath: 'barcode' });
                store.createIndex('description', 'description', { unique: false });
            };
        });
    }

    async addProduct(product) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(product);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject('Error al agregar el producto:', event.target.error);
        });
    }

    async getProduct(barcode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const request = transaction.objectStore(this.storeName).get(barcode);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject('Error al obtener el producto:', event.target.error);
        });
    }

    async getAllProducts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const request = transaction.objectStore(this.storeName).getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject('Error al obtener todos los productos:', event.target.error);
        });
    }

    async deleteProduct(barcode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const request = transaction.objectStore(this.storeName).delete(barcode);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject('Error al eliminar el producto:', event.target.error);
        });
    }

    async searchProducts(query) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('description');
            const request = index.openCursor();
            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const normalizedDescription = normalizeText(cursor.value.description || '');
                    const normalizedQuery = normalizeText(query);
                    if (normalizedDescription.includes(normalizedQuery)) {
                        results.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (event) => reject('Error al buscar productos:', event.target.error);
        });
    }
}

function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/* ------------------------------------------------------------
   Búsqueda online (VTEX Intelligent Search)
   Adaptado de la lógica del repo de referencia
   (pwa-escaner-1.2/src/app/api/buscar/route.ts) a vanilla JS.
   Se ejecuta 100% en el navegador gracias a que VTEX IS expone
   CORS abierto (no necesita backend).
   ------------------------------------------------------------ */

const VTEX_STORES = {
    jumbo:     'https://www.jumbo.com.ar',
    carrefour: 'https://www.carrefour.com.ar',
    changomas: 'https://www.changomas.com.ar',
    farmacity: 'https://www.farmacity.com',
};

const COTO_AUTOCOMPLETE = 'https://ac.cnstrc.com/autocomplete';
// Constructor.io publica esta key en su frontend de Coto
const COTO_KEY = 'key_Gpkd9CwgGwgJwPO';
const TIMEOUT_MS = 6000;

function fetchConTimeout(url, init) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch(url, { ...(init || {}), signal: ctrl.signal })
        .finally(() => clearTimeout(t));
}

function normalizarNombre(nombre) {
    return (nombre || '').trim().toLowerCase().slice(0, 30);
}

async function buscarVtexIntelligent(fuente, base, q) {
    try {
        const url = `${base}/api/io/_v/api/intelligent-search/product_search/?locale=es-AR&query=${encodeURIComponent(q)}`;
        const res = await fetchConTimeout(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        const data = await res.json();
        const products = data?.products ?? [];
        if (products.length === 0) return [];

        return products.slice(0, 3).map((p) => {
            const item = p.items?.[0];
            const seller = item?.sellers?.[0]?.commertialOffer;
            const img = item?.images?.[0]?.imageUrl;
            // Categoría: tomar la última de la jerarquía (más específica)
            const categories = p.categories ?? [];
            const categoriaRaw = categories.length ? categories[categories.length - 1] : undefined;
            const categoria = categoriaRaw ? categoriaRaw.replace(/^\//, '').trim() : undefined;
            // URL completa del producto en el sitio
            const link = p.link ? (base + p.link) : undefined;
            // Presentación: intentar extraer del nombre si existe patrón (ej: "X 500ml")
            const nombreClean = (p.productName || '').trim();
            const presentMatch = nombreClean.match(/\b(\d+(?:[.,]\d+)?\s?(?:ml|cc|l|lt|ltr|kg|g|gr|mg|un|u|pzas|pz|pack|pack\s?\d+))\b/i);
            return {
                nombre: p.productName ?? 'Sin nombre',
                codigoBarras: item?.ean ?? undefined,
                imagen: img ?? undefined,
                descripcion: p.description ?? undefined,
                precio: seller?.Price ?? p.priceRange?.sellingPrice?.lowPrice ?? undefined,
                marca: p.brand ?? undefined,
                categoria,
                presentacion: presentMatch ? presentMatch[0] : undefined,
                url: link,
                fuente,
            };
        });
    } catch (e) {
        console.error(`[buscar] ${fuente} (intelligent) error:`, e);
        return [];
    }
}

async function buscarVtexCatalog(fuente, base, q) {
    try {
        const url = `${base}/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(q)}`;
        const res = await fetchConTimeout(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return [];

        return data.slice(0, 3).map((p) => {
            const item = p.items?.[0];
            const seller = item?.sellers?.[0]?.commertialOffer;
            const categories = p.categories ?? [];
            const categoriaRaw = categories.length ? categories[categories.length - 1] : undefined;
            const categoria = categoriaRaw ? categoriaRaw.replace(/^\//, '').trim() : undefined;
            const link = p.link ? (base + p.link) : undefined;
            const nombreClean = (p.productName || '').trim();
            const presentMatch = nombreClean.match(/\b(\d+(?:[.,]\d+)?\s?(?:ml|cc|l|lt|ltr|kg|g|gr|mg|un|u|pzas|pz|pack|pack\s?\d+))\b/i);
            return {
                nombre: p.productName ?? 'Sin nombre',
                codigoBarras: item?.ean ?? undefined,
                imagen: item?.images?.[0]?.imageUrl ?? undefined,
                descripcion: p.description ?? undefined,
                precio: seller?.Price ?? undefined,
                marca: p.brand ?? undefined,
                categoria,
                presentacion: presentMatch ? presentMatch[0] : undefined,
                url: link,
                fuente,
            };
        });
    } catch (e) {
        console.error(`[buscar] ${fuente} (catalog) error:`, e);
        return [];
    }
}

async function buscarCoto(q) {
    try {
        const url = `${COTO_AUTOCOMPLETE}/${encodeURIComponent(q)}?key=${COTO_KEY}&num_results=3`;
        const res = await fetchConTimeout(url);
        if (!res.ok) return [];
        const data = await res.json();
        const items = data?.sections?.Products ?? [];
        return items.map((it) => {
            const nombreClean = (it.value || '').trim();
            const presentMatch = nombreClean.match(/\b(\d+(?:[.,]\d+)?\s?(?:ml|cc|l|lt|ltr|kg|g|gr|mg|un|u|pzas|pz|pack|pack\s?\d+))\b/i);
            return {
                nombre: it.value ?? 'Sin nombre',
                codigoBarras: it.data?.ean ?? undefined,
                imagen: it.data?.image_url ?? undefined,
                precio: it.data?.price ?? undefined,
                marca: it.data?.brand ?? undefined,
                presentacion: presentMatch ? presentMatch[0] : undefined,
                url: it.data?.url ? (it.data.url.startsWith('http') ? it.data.url : `https://www.cotodigital3.com.ar${it.data.url}`) : undefined,
                fuente: 'coto',
            };
        });
    } catch (e) {
        console.error('[buscar] coto error:', e);
        return [];
    }
}

function deduplicar(resultados) {
    const mapa = new Map();
    for (const r of resultados) {
        const clave = r.codigoBarras || normalizarNombre(r.nombre);
        const existente = mapa.get(clave);
        if (!existente) {
            mapa.set(clave, r);
        } else if (!existente.imagen && r.imagen) {
            mapa.set(clave, r);
        }
    }
    return [...mapa.values()].slice(0, 8);
}

/**
 * Busca el producto en Coto, Jumbo, Carrefour y Farmacity.
 * Devuelve array de ResultadoBusqueda. La UI decide qué hacer.
 */
async function buscarEnSupermercados(q) {
    const settled = await Promise.allSettled([
        buscarVtexIntelligent('jumbo',     VTEX_STORES.jumbo,     q),
        buscarVtexIntelligent('carrefour', VTEX_STORES.carrefour, q),
        buscarVtexIntelligent('changomas', VTEX_STORES.changomas, q),
        buscarVtexIntelligent('farmacity', VTEX_STORES.farmacity, q),
        buscarCoto(q),
    ]);

    const todos = [];
    for (const s of settled) {
        if (s.status === 'fulfilled') todos.push(...s.value);
    }

    if (todos.length === 0) {
        const fallback = await Promise.allSettled([
            buscarVtexCatalog('jumbo',     VTEX_STORES.jumbo,     q),
            buscarVtexCatalog('carrefour', VTEX_STORES.carrefour, q),
            buscarVtexCatalog('changomas', VTEX_STORES.changomas, q),
            buscarVtexCatalog('farmacity', VTEX_STORES.farmacity, q),
        ]);
        for (const s of fallback) {
            if (s.status === 'fulfilled') todos.push(...s.value);
        }
    }

    return deduplicar(todos);
}

/* ------------------------------------------------------------
   Toast helper (reemplaza alert para feedback moderno)
   ------------------------------------------------------------ */
let toastTimer = null;
function showToast(msg, variant = '') {
    const toast = document.getElementById('toast');
    if (!toast) return alert(msg);
    toast.textContent = msg;
    toast.className = 'toast' + (variant ? ' ' + variant : '');
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 3200);
    // Haptic feedback (móvil)
    if (navigator.vibrate) {
        try { navigator.vibrate(variant === 'error' ? 100 : 30); } catch (_) {}
    }
}

/* ------------------------------------------------------------
   Ripple effect helper (Material 3)
   ------------------------------------------------------------ */
function applyRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(e.clientX || rect.left + rect.width / 2) - rect.left - size / 2}px`;
    ripple.style.top = `${(e.clientY || rect.top + rect.height / 2) - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

/* ============================================================
   APP INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    const db = new ProductDatabase();
    await db.init();

    /* ---- Referencias DOM ---- */
    const barcodeInput       = document.getElementById('barcode');
    const descriptionInput   = document.getElementById('description');
    const stockInput         = document.getElementById('stock');
    const priceInput         = document.getElementById('price');
    const productImage       = document.getElementById('product-image');
    const productImageWrap   = document.getElementById('product-image-container');
    const scannerContainer   = document.getElementById('scanner-container');
    const video               = document.getElementById('video');
    const lowStockResults    = document.getElementById('low-stock-results');
    const lowStockList       = document.getElementById('low-stock-list');
    const lowStockButton     = document.getElementById('low-stock-button');
    const fileInput          = document.getElementById('fileInput');
    const inventoryList      = document.getElementById('inventory-list');
    const inventorySearch    = document.getElementById('inventory-search');
    const inventoryRefresh   = document.getElementById('inventory-refresh');
    const saveButton         = document.getElementById('save-button');
    const clearButton        = document.getElementById('clear-button');
    const searchButton       = document.getElementById('search-button');
    const scanButtonFab      = document.getElementById('scan-button-fab');
    const scannerClose       = document.getElementById('scanner-close');
    const importButton       = document.getElementById('import-button');
    const exportButton       = document.getElementById('export-button');
    const themeToggle        = document.getElementById('theme-toggle');
    // Nuevos campos
    const marcaInput         = document.getElementById('marca');
    const categoriaInput     = document.getElementById('categoria');
    const presentacionInput  = document.getElementById('presentacion');

    let barcodeDetector;
    let productNotFoundAlertShown = false;
    const cache = new Map();

    /* ---- Ripple global para botones ---- */
    document.querySelectorAll('.btn, .fab, .searchbar__btn, .topbar__action').forEach((b) => {
        b.addEventListener('click', applyRipple);
    });

    /* ---- Tabs / bottom nav ---- */
    function switchView(viewName) {
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
        document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('is-active'));
        const view = document.getElementById(`view-${viewName}`);
        if (view) view.classList.add('is-active');
        const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (navBtn) navBtn.classList.add('is-active');

        if (viewName === 'productos') renderInventory();
        if (viewName === 'stock-bajo') loadLowStock();
    }
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });

    /* ---- Theme toggle (manual, con localStorage) ---- */
    const savedTheme = localStorage.getItem('mscanner-theme');
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'dark' || (
                !document.documentElement.getAttribute('data-theme') &&
                window.matchMedia('(prefers-color-scheme: dark)').matches
            );
            if (current) {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('mscanner-theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('mscanner-theme', 'dark');
            }
        });
    }

    /* ---- Escáner de código de barras (ZXing + BarcodeDetector fallback) ---- */
    // ZXing funciona en iPhone Safari (iOS) vía WebRTC; BarcodeDetector
    // es más rápido pero solo Android/Chrome. Usamos ZXing como primario.
    let zxingReader = null;
    let zxingControls = null;

    async function startScanner() {
        try {
            scannerContainer.classList.add('is-open');

            // Preferencia: ZXing (soporta iOS Safari)
            if (typeof ZXing !== 'undefined') {
                startZXingScanner();
                return;
            }
            // Fallback: BarcodeDetector API nativa (Android/Chrome)
            if ('BarcodeDetector' in window) {
                if (!barcodeDetector) {
                    try {
                        barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] });
                    } catch (e) {
                        barcodeDetector = new BarcodeDetector();
                    }
                }
                startNativeScanner();
                return;
            }
            showToast('Tu navegador no soporta escaneo de códigos.', 'error');
            stopScanner();
        } catch (error) {
            console.error('Scanner error:', error);
            showToast('No se pudo acceder a la cámara.', 'error');
            stopScanner();
        }
    }

    /* --- ZXing (multiplataforma, soporta iPhone) --- */
    async function startZXingScanner() {
        try {
            // Redeclarar stream propio para ZXing (evita conflictos)
            if (!zxingReader) {
                zxingReader = new ZXing.BrowserMultiFormatReader();
            }
            // Usar la cámara trasera si existe (environment camera)
            let deviceId = undefined;
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cams = devices.filter(d => d.kind === 'videoinput');
                if (cams.length > 0) {
                    // Heurística: la última cámara suele ser la trasera en móviles
                    deviceId = cams[cams.length - 1].deviceId;
                }
            } catch (_) {}

            zxingControls = zxingReader.decodeFromVideoDevice(
                deviceId,
                video,
                (result, err) => {
                    if (result) {
                        const code = result.getText();
                        barcodeInput.value = code;
                        stopScanner();
                        searchProduct(code);
                    }
                }
            );
        } catch (error) {
            console.error('ZXing scanner error:', error);
            // Si ZXing falla y existe BarcodeDetector nativo, usarlo
            if ('BarcodeDetector' in window) startNativeScanner();
            else showToast('No se pudo iniciar el escáner.', 'error');
        }
    }

    /* --- BarcodeDetector nativo (Android/Chrome) --- */
    async function startNativeScanner() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } }
            });
            video.srcObject = stream;
            video.play();
            requestAnimationFrame(scanNativeFrame);
        } catch (error) {
            console.error('Native scanner error:', error);
            showToast('No se pudo acceder a la cámara.', 'error');
            stopScanner();
        }
    }

    async function scanNativeFrame() {
        if (!scannerContainer.classList.contains('is-open')) return;
        if (barcodeDetector && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
                const barcodes = await barcodeDetector.detect(video);
                if (barcodes.length > 0) {
                    barcodeInput.value = barcodes[0].rawValue;
                    stopScanner();
                    searchProduct(barcodes[0].rawValue);
                    return;
                }
            } catch (e) { /* ignore frame errors */ }
        }
        requestAnimationFrame(scanNativeFrame);
    }

    function stopScanner() {
        // Detener ZXing
        if (zxingControls) {
            try { zxingControls.stop(); } catch (_) {}
            zxingControls = null;
        }
        if (zxingReader) {
            try { zxingReader.reset(); } catch (_) {}
        }
        // Detener stream nativo
        const stream = video.srcObject;
        if (stream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        scannerContainer.classList.remove('is-open');
    }

    if (scanButtonFab) scanButtonFab.addEventListener('click', startScanner);

    if (scannerClose) scannerClose.addEventListener('click', stopScanner);

    /* ---- Búsqueda principal ---- */
    async function searchProduct(query) {
        query = (query || '').trim();
        if (!query) return;
        const isBarcode = /^\d+$/.test(query);

        if (cache.has(query)) {
            fillForm(cache.get(query));
            return;
        }

        let product;
        if (isBarcode) {
            product = await db.getProduct(query);
        } else {
            const results = await db.searchProducts(query);
            if (results.length > 0) product = results[0];
        }

        if (!product) {
            // Buscar online (múltiples fuentes en paralelo)
            const onlineResults = await buscarEnSupermercados(query);
            if (onlineResults.length > 0) {
                // Convertir resultado online al formato local y guardar el primero
                const r = onlineResults[0];
                product = {
                    barcode: r.codigoBarras || (isBarcode ? query : ''),
                    description: r.nombre || '',
                    stock: 0,
                    price: r.precio ?? 0,
                    image: r.imagen || '',
                    marca: r.marca || '',
                    categoria: r.categoria || '',
                    presentacion: r.presentacion || '',
                    url: r.url || '',
                    descripcionLarga: r.descripcion || '',
                    ultimaActualizacion: Date.now(),
                };
                // Persistir para próximas búsquedas (solo si tiene barcode)
                if (product.barcode) await db.addProduct(product);
            }
        }

        if (product) {
            cache.set(query, product);
            fillForm(product);
            productNotFoundAlertShown = false;
        } else {
            if (!productNotFoundAlertShown) {
                showToast('Producto no encontrado. Intentá con otro código o nombre.', 'error');
                productNotFoundAlertShown = true;
            }
        }
    }

    function fillForm(product) {
        barcodeInput.value     = product.barcode || '';
        descriptionInput.value = product.description || '';
        stockInput.value       = product.stock ?? '';
        priceInput.value       = product.price ?? '';
        if (marcaInput)     marcaInput.value       = product.marca || '';
        if (categoriaInput) categoriaInput.value   = product.categoria || '';
        if (presentacionInput) presentacionInput.value = product.presentacion || '';

        if (product.image) {
            productImage.src = product.image;
            productImage.alt = product.description || 'Imagen del producto';
            productImageWrap.classList.add('is-visible');
            productImageWrap.classList.add('has-image');
            productImage.style.display = '';
        } else {
            productImageWrap.classList.remove('is-visible');
            productImageWrap.classList.remove('has-image');
            productImage.style.display = 'none';
        }
        // Forzar refresh del label flotante
        [barcodeInput, descriptionInput, stockInput, priceInput,
         marcaInput, categoriaInput, presentacionInput].forEach((i) => {
            if (i) i.dispatchEvent(new Event('input'));
        });
    }

    if (searchButton) searchButton.addEventListener('click', () => {
        const query = (barcodeInput.value || '').trim() || (descriptionInput.value || '').trim();
        if (query) {
            searchProduct(query);
        } else {
            showToast('Ingresá un código de barras o nombre.', 'warning');
        }
    });

    if (barcodeInput) barcodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchButton.click();
        }
    });

    /* ---- Guardar / Borrar ---- */
    if (saveButton) saveButton.addEventListener('click', async () => {
        const barcode = (barcodeInput.value || '').trim();
        const description = (descriptionInput.value || '').trim();
        if (!barcode && !description) {
            showToast('Ingresá al menos un código o descripción.', 'warning');
            return;
        }
        const product = {
            barcode: barcode || 'sin-codigo-' + Date.now(),
            description: description,
            stock: parseInt(stockInput.value, 10) || 0,
            price: parseFloat(priceInput.value) || 0,
            image: (productImage.src && productImage.src !== window.location.href) ? productImage.src : '',
            marca: (marcaInput?.value || '').trim(),
            categoria: (categoriaInput?.value || '').trim(),
            presentacion: (presentacionInput?.value || '').trim(),
        };
        await db.addProduct(product);
        showToast('Producto guardado correctamente.', 'success');
        clearForm();
        // Refrescar vistas si están abiertas
        if (document.getElementById('view-productos').classList.contains('is-active')) {
            renderInventory();
        }
        if (document.getElementById('view-stock-bajo').classList.contains('is-active')) {
            loadLowStock();
        }
    });

    if (clearButton) clearButton.addEventListener('click', clearForm);

    function clearForm() {
        barcodeInput.value = '';
        descriptionInput.value = '';
        stockInput.value = '';
        priceInput.value = '';
        if (marcaInput) marcaInput.value = '';
        if (categoriaInput) categoriaInput.value = '';
        if (presentacionInput) presentacionInput.value = '';
        productImage.src = '';
        productImageWrap.classList.remove('is-visible', 'has-image');
        productImage.style.display = 'none';
    }

    /* ---- Lista de inventario (vista Productos) ---- */
    async function renderInventory() {
        if (!inventoryList) return;
        const allProducts = await db.getAllProducts();
        const term = (inventorySearch.value || '').trim().toLowerCase();
        let filtered = allProducts;
        const activeFilter = document.querySelector('.chip.is-active')?.dataset.filter;
        if (activeFilter === 'stock')    filtered = filtered.filter((p) => (p.stock || 0) > 5);
        if (activeFilter === 'low')      filtered = filtered.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 5);
        if (activeFilter === 'zero')    filtered = filtered.filter((p) => (p.stock || 0) <= 0);
        if (term) filtered = filtered.filter((p) =>
            normalizeText(p.description || '').includes(normalizeText(term)) ||
            normalizeText(p.barcode || '').includes(normalizeText(term)) ||
            normalizeText(p.marca || '').includes(normalizeText(term)) ||
            normalizeText(p.categoria || '').includes(normalizeText(term)) ||
            normalizeText(p.presentacion || '').includes(normalizeText(term))
        );

        inventoryList.innerHTML = '';
        if (filtered.length === 0) {
            inventoryList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <div class="empty-state__title">Sin productos</div>
                    <div class="empty-state__text">Probá escaneando o importando un Excel</div>
                </div>
            `;
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'results-list';
        filtered.forEach((p) => {
            const li = document.createElement('li');
            li.className = 'result-item';
            li.dataset.barcode = p.barcode;

            const stockNum = parseInt(p.stock, 10) || 0;
            const estado = stockNum <= 0 ? 'Sin stock' : (stockNum <= 5 ? 'Stock bajo' : 'En stock');
            const estadoClass = stockNum <= 0 ? 'result-item__badge--danger' : (stockNum <= 5 ? 'result-item__badge--danger' : '');

            const metaParts = [`<span class="result-item__badge ${estadoClass}">${estado}</span>`];
            if (p.marca) metaParts.push(`<span class="result-item__brand">${escapeHtml(p.marca)}</span>`);
            if (p.presentacion) metaParts.push(`<span>${escapeHtml(p.presentacion)}</span>`);
            metaParts.push(`<span>${formatPrice(p.price)}</span>`);

            li.innerHTML = `
                ${p.image ?
                    `<img class="result-item__img" src="${escapeHtml(p.image)}" alt="" onerror="this.classList.add('hidden')">` :
                    `<div class="result-item__img-placeholder">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>`
                }
                <div>
                    <div class="result-item__name">${escapeHtml(p.description || 'Sin nombre')}</div>
                    <div class="result-item__meta">
                        ${metaParts.join('<span class="result-item__sep">·</span>')}
                    </div>
                    ${p.categoria ? `<div class="result-item__cat">${escapeHtml(p.categoria)}</div>` : ''}
                </div>
                <div class="result-item__price">x${stockNum}</div>
            `;
            li.addEventListener('click', () => {
                switchView('escanear');
                fillForm(p);
            });
            ul.appendChild(li);
        });
        inventoryList.appendChild(ul);
    }

    function formatPrice(p) {
        const n = parseFloat(p);
        if (!n || isNaN(n)) return '$—';
        return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;'
        }[c]));
    }

    if (inventorySearch) {
        inventorySearch.addEventListener('input', () => renderInventory());
        inventorySearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') renderInventory(); });
    }
    if (inventoryRefresh) inventoryRefresh.addEventListener('click', () => {
        inventoryRefresh.classList.add('is-loading');
        renderInventory().finally(() => setTimeout(() => inventoryRefresh.classList.remove('is-loading'), 500));
    });
    document.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            renderInventory();
        });
    });

    /* ---- Stock bajo (vista dedicada) ---- */
    async function loadLowStock() {
        if (!lowStockList || !lowStockResults) return;
        const allProducts = await db.getAllProducts();
        const lowStockProducts = allProducts.filter(p => (p.stock || 0) <= 5);
        if (lowStockProducts.length > 0) {
            lowStockResults.innerHTML = `<div class="section-title">Productos con stock bajo (≤ 5)</div>`;
            lowStockList.innerHTML = '';
            lowStockProducts.forEach(p => {
                const li = document.createElement('li');
                li.className = 'low-stock-item';
                li.innerHTML = `
                    <div>
                        <div>${escapeHtml(p.description || 'Sin nombre')}</div>
                        <div style="font-size:.8rem;opacity:.7">Código: ${escapeHtml(p.barcode || '—')}</div>
                    </div>
                    <div>Stock: ${p.stock || 0}</div>
                `;
                lowStockList.appendChild(li);
            });
        } else {
            lowStockResults.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10-3-3"/></svg>
                    </div>
                    <div class="empty-state__title">Todo en orden</div>
                    <div class="empty-state__text">No hay productos con stock bajo.</div>
                </div>
            `;
            lowStockList.innerHTML = '';
        }
    }

    if (lowStockButton) lowStockButton.addEventListener('click', loadLowStock);

    /* ---- Import / Export Excel (sin cambios funcionales) ---- */
    if (importButton) importButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const products = XLSX.utils.sheet_to_json(worksheet);
                if (!products.length) {
                    showToast('El archivo no contiene productos.', 'warning');
                    return;
                }
                let importedCount = 0;
                for (let product of products) {
                    const findKey = (possibleKeys) => possibleKeys.find((k) => product.hasOwnProperty(k));
                    const barcodeKey = findKey(['Código de Barras', 'Código de barras', 'codigo de barras', 'barcode']);
                    const descriptionKey = findKey(['Descripción', 'Descripcion', 'descripción', 'description']);
                    const stockKey = findKey(['Stock', 'stock']);
                    const priceKey = findKey(['Precio Costo', 'Precio', 'precio', 'price']);
                    const imageKey = findKey(['Imagen', 'imagen', 'image']);
                    const marcaKey = findKey(['Marca', 'marca']);
                    const categoriaKey = findKey(['Categoría', 'Categoria', 'categoría', 'categoria', 'category']);
                    const presentacionKey = findKey(['Presentación', 'Presentacion', 'presentación', 'presentacion']);
                    if (!barcodeKey) continue;
                    try {
                        const newProduct = {
                            barcode: product[barcodeKey].toString(),
                            description: product[descriptionKey] || '',
                            stock: parseInt(product[stockKey] || '0', 10),
                            price: parseFloat(product[priceKey] || '0') || 0,
                            image: product[imageKey] || '',
                            marca: product[marcaKey] || '',
                            categoria: product[categoriaKey] || '',
                            presentacion: product[presentacionKey] || '',
                        };
                        await db.addProduct(newProduct);
                        importedCount++;
                    } catch (err) {
                        console.error('Error al agregar producto:', product, err);
                    }
                }
                showToast(`Importación completada. ${importedCount} productos.`, 'success');
                renderInventory();
            } catch (error) {
                console.error('Error durante la importación:', error);
                showToast('Error durante la importación.', 'error');
            }
        };
        reader.onerror = () => showToast('Error al leer el archivo.', 'error');
        reader.readAsArrayBuffer(file);
        // Reset input para permitir re-importar el mismo archivo
        fileInput.value = '';
    });

    if (exportButton) exportButton.addEventListener('click', async () => {
        const allProducts = await db.getAllProducts();
        if (allProducts.length === 0) {
            showToast('No hay productos para exportar.', 'warning');
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(allProducts.map(p => ({
            'Código de Barras': p.barcode,
            'Descripción':      p.description,
            'Marca':            p.marca || '',
            'Categoría':        p.categoria || '',
            'Presentación':    p.presentacion || '',
            'Stock':            p.stock,
            'Precio':           p.price,
            'Imagen':           p.image || ''
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
        XLSX.writeFile(workbook, "productos_exportados.xlsx");
        showToast('Exportado correctamente.', 'success');
    });

    /* ---- Carga inicial: inventario y stock bajo (en background) ---- */
    renderInventory();
});