> Full-stack web platform for a jewelry brand. Built with Flask + Vanilla JS. Features a customer-facing store and a complete business admin dashboard with inventory management, batch costing, pricing logic, and sales tracking.

---

## Live Demo

| Interface | URL |
|-----------|-----|
| Store | `http://localhost:5000/` |
| Admin Dashboard | `http://localhost:5000/admin` |

> Deployment in progress — Railway/Render link coming soon.

---

## Screenshots


| Store Front | Admin Dashboard |
|-------------|-----------------|
| (https://imgur.com/a/jCC7igx) |

---

## What This Project Does

This is a real platform built for an active jewelry e-commerce business. It solves two problems:

**For customers:** Browse catalog by jewelry type (rings, necklaces, bracelets), add items to cart, and complete a checkout flow with card preview.

**For the business owner:** A glassmorphism admin dashboard that replaces spreadsheets and a terminal-based manager script. The owner can add products, register purchase lots with automatic pricing calculations, process sales using FIFO inventory logic, track monthly revenue, and manage catalog visibility — all from a browser.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Python 3 + Flask | Lightweight, fast to iterate |
| Data | JSON files | Portable, no DB setup required for v1 |
| Frontend | Vanilla HTML/CSS/JS | No framework overhead, full control |
| Fonts | Cormorant Garamond + DM Sans | Brand-appropriate editorial feel |
| Deployment | Railway (planned) | Free tier, Flask-compatible |

> **Roadmap:** migrating data layer to SQLAlchemy + SQLite. JSON files are intentional for v1 — the REST API contract stays identical after migration, only the internal read/write functions change.

---

## Architecture

```
AURUM-WEB/
│
├── app.py                  # Flask app — all backend logic
│   ├── Section 1           # Catalog dictionaries (SKU translation)
│   ├── Section 2           # File paths config
│   ├── Section 3           # JSON read/write helpers
│   ├── Section 4           # Business logic (pricing, FIFO, SKU decoder)
│   ├── Section 5           # API: /api/inventario  (GET/POST/PUT/DELETE)
│   ├── Section 6           # API: /api/lotes        (GET/POST)
│   │                       #      /api/lotes/venta  (POST — FIFO sale)
│   │                       #      /api/lotes/devolucion (PUT — return)
│   ├── Section 7           # API: /api/ingresos_mensuales (GET)
│   └── Section 8           # Page rendering routes (/, /admin, etc.). Also some scrips for start
│
├── data/
│   ├── inventario_aurum.json         # Product catalog
│   ├── inventario_lote_aurum.json    # Purchase lot history
│   └── historial_ventas.json         # Sales history
│
├── templates/
│   ├── admin.html          # Admin dashboard (7 views)
│   ├── index.html          # Store home
│   ├── anillos.html        # Rings catalog
│   ├── collares.html       # Necklaces catalog
│   ├── brazaletes.html     # Bracelets catalog
│   └── pago.html           # Checkout page
│
└── static/
    ├── admin-style.css     # Dashboard styles (glassmorphism, CSS vars)
    ├── admin-script.js     # Dashboard JS (fetch, forms, autocomplete)
    ├── style.css           # Store styles
    ├── script.js           # Store JS (cart, dynamic catalog)
    └── imgs/
        ├── logo-aurum.png
        ├── productos/      # Product images (named by SKU)
        └──banners          # Category banners
```

---

## Key Technical Decisions

**SKU as the system's primary key**
Every product, lot, and sale references a SKU with format `TYPE-COLLECTION-MODEL-MATERIAL` (e.g. `AN-H1-01-SS` = Ring, Horus collection, Model 1, Sterling Silver). The backend auto-decodes the SKU using dictionary lookups — no manual field entry needed for type/collection/material.

**FIFO inventory across purchase lots**
When a sale is processed, `procesar_venta_fifo()` exhausts the oldest active lot first before moving to the next. Lots auto-deactivate at zero units. Returns reactivate lots.

**Pricing formula accounts for Stripe fees**
`precio_sugerido = (costo_unitario × margen) / (1 - 0.036) + 3`
The formula back-calculates the price needed to hit the target margin after Stripe's 3.6% + $3 MXN fixed fee is deducted.

**Clean API separation**
All data routes live under `/api/*` and return pure JSON. Page routes (`/`, `/admin`, etc.) only serve HTML. The frontend fetches data independently — this makes the SQLite migration a backend-only change with zero frontend impact.

**No framework on the frontend**
The store's dynamic catalog is rendered by `cargarCatalogo(tipoJoya, contenedorId)` in `script.js` — a single function that fetches, filters by jewelry type, and renders cards. The admin dashboard uses a dispatcher pattern (`cargarVista()`) that loads the correct data function when a nav button is clicked.

---

## API Reference

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventario` | Get full product catalog |
| `POST` | `/api/inventario` | Add new product (SKU auto-decoded) |
| `PUT` | `/api/inventario/<sku>` | Update product fields (partial update) |
| `DELETE` | `/api/inventario/<sku>` | Remove product |

**POST body example:**
```json
{
  "sku": "AN-H1-01-SS",
  "nombre": "Anillo Horus I",
  "margen": 3.0,
  "precio_publico": 650.00,
  "descripcion": "Ring from the Horus collection.",
  "visible": true
}
```

### Lots

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/lotes` | Get all purchase lots |
| `POST` | `/api/lotes` | Register new lot (auto-calculates pricing) |
| `POST` | `/api/lotes/venta` | Process sale — FIFO stock deduction |
| `PUT` | `/api/lotes/devolucion` | Return units to a lot |

**POST /api/lotes body example:**
```json
{
  "sku_referencia": "AN-H1-01-SS",
  "unidades": 22,
  "empaque": 120.00,
  "main_dije": 3500.00,
  "cadena": 0,
  "complementos": 80.00,
  "envio": 250.00
}
```

### Revenue

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ingresos_mensuales` | Monthly revenue grouped by `YYYY-MM` |

---

## Getting Started

**Requirements:** Python 3.8+

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/aurum-ecommerce-plataform.git
cd aurum-platform

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install flask werkzeug

# 4. Run the app
python app.py
```

Open `http://127.0.0.1:5000` for the store, `http://127.0.0.1:5000/admin` for the dashboard.

> The `data/` folder contains empty JSON arrays `[]` — start by adding a product from the admin dashboard.

---

## Admin Dashboard — Feature Map

| View | What you can do |
|------|-----------------|
| **Resumen** | KPIs (revenue, stock, active SKUs, lots), inventory by collection bar chart, low-stock alerts |
| **Ventas** | Register sales, view monthly revenue KPIs |
| **Productos** | Add product (with image upload + inline price calculator), edit, toggle visibility, delete |
| **Lotes** | Register purchase lots (SKU autocomplete, auto-pricing), delete lots, view full history |
| **Movimientos** | Register product returns to specific lots |
| **Calculadora** | Standalone price calculator using the Stripe-adjusted formula |
| **Configuración** | Add/remove jewelry types, collections, and materials from the catalog |

---

## Roadmap

- [ ] SQLAlchemy + SQLite migration (data layer only — API unchanged)
- [ ] Sales history recording on `POST /api/lotes/venta`
- [ ] Catalog persistence for types/collections/materials (currently in-memory)
- [ ] Image optimization on upload (auto-resize to 800×800)
- [ ] Authentication for `/admin` route (Flask session or JWT)
- [ ] Deploy to Railway with environment variable config

---

## Author

**Erik Jhoel Martinez Lopez**
Web & E-Commerce Developer · Branding Specialist

[![LinkedIn](https://img.shields.io/badge/LinkedIn-jhoel--martinez--lopez-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/jhoel-martinez-lopez/)
[![Email](https://img.shields.io/badge/Email-jhoel.martinez.dev%40gmail.com-lightgrey?style=flat)](mailto:jhoel.martinez.dev@gmail.com)
[![EF SET B2+](https://img.shields.io/badge/English-EF%20SET%20B2%2B%2FC1-green?style=flat)](https://cert.efset.org/en/r4srrq)

---

*Built as a real production tool for The Aurum Creations, Cancún Q.ROO — not a tutorial clone.*
