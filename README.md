# M-Scanner 2.0

Escáner de códigos de barras y gestor de inventario PWA (Progressive Web App).

## Características

- **Escaneo de códigos de barras** - Usa la API `BarcodeDetector` del navegador (requiere HTTPS)
- **Base de datos local** - IndexedDB para almacenar productos offline
- **Búsqueda inteligente** - Busca por código de barras o nombre (con normalización de texto)
- **Fallback automático** - Consulta OpenFoodFacts si el producto no está en la base local
- **Importar/Exportar Excel** - Compatible con .xlsx y .xls (SheetJS)
- **Alertas de stock bajo** - Productos con stock ≤ 5
- **PWA instalable** - Funciona offline, se instala como app nativa
- **Imágenes de productos** - Guarda y muestra fotos de productos

## Requisitos

- **HTTPS obligatorio** (GitHub Pages, Netlify, Vercel, Firebase Hosting)
- Navegador moderno con soporte para:
  - `BarcodeDetector` API (Chrome 88+, Edge 88+, Opera 74+)
  - IndexedDB
  - Service Workers
  - Camera API (`getUserMedia`)

## Despliegue en GitHub Pages

1. Haz fork o clona este repositorio
2. Ve a **Settings > Pages**
3. Source: **Deploy from a branch**
4. Branch: **main** / **root**
5. Guarda y espera a que despliegue
6. Accede a `https://TU_USUARIO.github.io/TU_REPO/`

## Uso local (desarrollo)

```bash
# Con Python
python3 -m http.server 8000

# Con Node.js (npx serve)
npx serve .

# Con PHP
php -S localhost:8000
```

Luego abre `https://localhost:8000` (necesitas certificado SSL local para cámara) o usa `http://localhost:8000` en Chrome con flag `--unsafely-treat-insecure-origin-as-secure`.

## Estructura

```
.
├── index.html          # App principal
├── styles.css          # Estilos
├── script.js           # Lógica (IndexedDB, scanner, Excel, OpenFoodFacts)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline)
├── image/
│   ├── 1.jpg           # Fondo
│   ├── icon-192.png    # Icono PWA 192x192
│   └── icon-512.png    # Icono PWA 512x512
└── README.md
```

## Formato Excel para importar

Columnas soportadas (case-insensitive):
- `Código de Barras` / `barcode` - **Requerido**
- `Descripción` / `description`
- `Stock` / `stock`
- `Precio` / `Precio Costo` / `price`
- `Imagen` / `image` - URL de imagen

## Tecnologías

- **IndexedDB** - Base de datos local
- **BarcodeDetector API** - Escaneo nativo
- **SheetJS (xlsx)** - Import/Export Excel
- **OpenFoodFacts API** - Base de datos productos abierta
- **Service Workers** - Cache offline
- **PWA** - Instalable, standalone

## Licencia

©️ 2024 SYSMARKETHM. Todos los derechos reservados.
Propiedad de SYSMARKETHM. Uso no autorizado prohibido.
Contacto: https://sysmarket-hm.web.app/