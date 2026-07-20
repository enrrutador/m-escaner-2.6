# M-Scanner 2.0

Escáner de códigos de barras y gestor de inventario **PWA 2026** (Material You + glassmorphism).
La búsqueda online consulta automáticamente **Coto, Jumbo, Carrefour y Farmacity** (VTEX + Constructor.io).

## Características

- **Escaneo de códigos de barras** - API `BarcodeDetector` (EAN-13, EAN-8, UPC-A, Code-128)
- **Búsqueda online multi-supermercado** - VTEX Intelligent Search + Constructor.io
  - Coto, Jumbo, Carrefour, Farmacity
- **Base de datos local** - IndexedDB (funciona offline, sin backend)
- **Diseño 2026** - Material You, glassmorphism, dark mode automático + manual toggle
- **Bottom navigation + FAB** - 3 vistas: Escanear, Productos, Stock Bajo
- **Filtros de inventario** - Chips (Todos / Con stock / Stock bajo / Sin stock)
- **Feedback moderno** - Toasts, ripple effects, haptic feedback, empty states
- **Importar/Exportar Excel** - Compatible con .xlsx y .xls (SheetJS)
- **Alertas de stock bajo** - Productos con stock ≤ 5
- **PWA instalable** - Offline-ready, íconos maskable, shortcuts (Escanear / Productos)
- **Imágenes de productos** - Se guardan y muestran en cards

## Requisitos

- **HTTPS obligatorio** (GitHub Pages, Netlify, Vercel, Firebase Hosting)
- Navegador moderno (2023+):
  - `BarcodeDetector` (Chrome 88+, Edge 88+, Opera 74+, Android Chrome 92+)
  - IndexedDB
  - Service Workers + `backdrop-filter` (glassmorphism)
  - Camera API (`getUserMedia` con `facingMode: environment`)
  - JS modules, fetch, `Promise.allSettled`

> En iPhone/iPad el `BarcodeDetector` no está disponible; igualmente funciona todo el resto (búsqueda manual, importar, exportar, stock bajo).

## URLs

- **Repositorio:** https://github.com/enrrutador/m-escaner-2.6
- **Demo (GitHub Pages):** https://enrrutador.github.io/m-escaner-2.6/

## Despliegue en GitHub Pages

1. Hacé fork o cloná este repo
2. **Settings > Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / `/root`
5. Guardá. En 1-2 min quedará en `https://TU_USUARIO.github.io/TU_REPO/`

## Uso local

```bash
# Servidor estático (cualquiera de estos)
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Then abrí `http://localhost:8000` (localhost es contexto seguro: la cámara funciona sin HTTPS).

## Estructura

```
.
├── index.html          # App principal (PWA)
├── styles.css          # Design system 2026 (M3 + glass + dark)
├── script.js           # Lógica (IndexedDB, scanner, VTEX IS, Excel)
├── manifest.json       # PWA manifest con shortcuts
├── sw.js               # Service Worker (cache offline + APIs VTEX)
├── image/
│   ├── icon-192.png            # Icono PWA 192x192
│   ├── icon-512.png            # Icono PWA 512x512
│   ├── apple-touch-icon.png    # iOS home screen icon
│   └── 1.jpg                   # Fondo heredado
└── README.md
```

## Cómo funciona la búsqueda online

La lógica está adaptada de [pwa-escaner-1.2](https://github.com/enrrutador/pwa-escaner-1.2) y se ejecuta **100% en el navegador** (sin backend). Esto es posible porque:

- **Jumbo, Carrefour y Farmacity** usan **VTEX** como plataforma de e-commerce, que expone la API **Intelligent Search** con CORS abierto:
  - `GET https://www.jumbo.com.ar/api/io/_v/api/intelligent-search/product_search/?locale=es-AR&query=...`
  - `GET https://www.carrefour.com.ar/api/io/_v/api/intelligent-search/product_search/?...`
  - `GET https://www.farmacity.com/api/io/_v/api/intelligent-search/product_search/?...`
  - Fallback a `catalog_system/pub/products/search/?ft=...`
- **Coto** usa **Constructor.io** para autocompletar, con API pública (key pública del frontend):
  - `GET https://ac.cnstrc.com/autocomplete/<query>?key=...`

Flujo de búsqueda de un producto:
1. Busca en IndexedDB (base local del usuario)
2. Si no existe, busca en paralelo en los 4 supermercados (`Promise.allSettled`)
3. Deduplica por `codigoBarras` o nombre
4. El primer resultado se guarda en IndexedDB para próximas búsquedas
5. Llena el formulario (nombre, precio, imagen)

## Formato Excel para importar

Columnas soportadas (case-insensitive, buscan la 1ª que exista):

- `Código de Barras` / `Código de barras` / `codigo de barras` / `barcode` → **Requerido**
- `Descripción` / `Descripcion` / `description`
- `Stock` / `stock`
- `Precio Costo` / `Precio` / `precio` / `price`
- `Imagen` / `imagen` / `image` → URL

## Tecnologías

| Stack | Uso |
|-------|-----|
| **IndexedDB** | Base de datos local (offline-first) |
| **BarcodeDetector API** | Escaneo de códigos nativo |
| **VTEX Intelligent Search** | API pública de Jumbo/Carrefour/Farmacity |
| **Constructor.io** | API pública de Coto (autocomplete) |
| **SheetJS (xlsx)** | Import / Export Excel |
| **Service Worker** | Cache offline + stale-while-revalidate |
| **PWA + manifest** | Instalable, standalone, shortcuts |
| **Material You 2026** | Design system (M3 tokens, glassmorphism) |
| **CSS variables** | Theming light/dark sin JS frameworks |
| **Vanilla JS (ES2020)** | Sin build tools ni dependencias runtime |

## Licencia

©️ 2024 SYSMARKETHM. Todos los derechos reservados.
Propiedad de SYSMARKETHM. Uso no autorizado prohibido.
Contacto: https://sysmarket-hm.web.app/