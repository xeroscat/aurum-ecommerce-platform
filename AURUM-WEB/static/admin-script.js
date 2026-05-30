// ══════════════════════════════════════════════════════════════
//  AURUM CREATIONS — ADMIN SCRIPT
//  Conecta el dashboard con app.py via fetch()
// ══════════════════════════════════════════════════════════════

// ═══ CATÁLOGOS (espejo del backend para preview del SKU) ═══
// ⚠️  REVISAR MANUALMENTE: si añades entradas en app.py,
//     actualiza también estos objetos para mantener sincronía.
const TIPOS = { AN:'Anillo', AR:'Arete', CO:'Collar', PU:'Pulsera' };
const COLECCIONES = {
    H1:'Horus', H2:'Isis', H3:'Osiris', H4:'Anubis', H5:'Bastet',
    M1:'Maat', M2:'Thoth', M3:'Sekhmet', M4:'Ra'
};
const MATERIALES = { AC:'Acero 316L', SS:'Plata Esterlina 9.25' };
const MODELOS = { '01':'Modelo 1', '02':'Modelo 2', '03':'Modelo 3' };

// ══════════════════════════════════════════════════════
//  HELPERS GLOBALES
// ══════════════════════════════════════════════════════

/** Muestra un mensaje de feedback en un elemento por id */
function setFeedback(id, msg, tipo = 'ok') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `feedback-msg ${tipo}`;
    // Auto-limpiar después de 4 segundos
    setTimeout(() => { el.textContent = ''; el.className = 'feedback-msg'; }, 4000);
}

/** Formatea número como moneda MXN */
function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Muestra u oculta un formulario con animación */
function toggleForm(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ══════════════════════════════════════════════════════
//  NAVEGACIÓN — cambio de vistas
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

    // Fecha en el header de resumen
    const fechaEl = document.getElementById('fecha-hoy');
    if (fechaEl) {
        fechaEl.textContent = new Date().toLocaleDateString('es-MX', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    const botones = document.querySelectorAll('.menu-btn');
    const vistas  = document.querySelectorAll('.dashboard-view');

    botones.forEach(boton => {
        boton.addEventListener('click', () => {
            if (!boton.dataset.view) return; // botones sin data-view (acciones)

            botones.forEach(b => b.classList.remove('active'));
            vistas.forEach(v => v.classList.remove('active'));

            boton.classList.add('active');
            const view = document.getElementById(`view-${boton.dataset.view}`);
            if (view) {
                view.classList.add('active');
                // Re-disparar animación
                view.style.animation = 'none';
                view.offsetHeight; // reflow
                view.style.animation = '';

                // Cargar datos de la vista activada
                cargarVista(boton.dataset.view);
            }
        });
    });

    // Cargar datos de la vista inicial (resumen)
    cargarVista('resumen');
});

/** Dispatcher — carga los datos correctos según la vista activa */
function cargarVista(nombre) {
    switch (nombre) {
        case 'resumen':    cargarResumen();   break;
        case 'ventas':     cargarVentas();    break;
        case 'productos':  cargarProductos(); break;
        case 'lotes':      cargarLotes();     break;
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: RESUMEN
// ══════════════════════════════════════════════════════
async function cargarResumen() {
    try {
        const [resInv, resLotes, resIngresos] = await Promise.all([
            fetch('/api/inventario'),
            fetch('/api/lotes'),
            fetch('/api/ingresos_mensuales')
        ]);

        const inventario = await resInv.json();
        const lotes      = await resLotes.json();
        const ingresos   = await resIngresos.json();

        // KPIs
        const mesActual = new Date().toISOString().slice(0, 7);
        const ingreso   = ingresos[mesActual] || 0;
        const stock     = lotes
            .filter(l => l.activo)
            .reduce((s, l) => s + (l.unidades_disponibles || l.unidades || 0), 0);
        const lotesActivos = lotes.filter(l => l.activo).length;

        document.getElementById('kpi-ingresos').textContent  = fmt(ingreso);
        document.getElementById('kpi-stock').textContent     = stock;
        document.getElementById('kpi-productos').textContent = inventario.length;
        document.getElementById('kpi-lotes').textContent     = lotesActivos;

        // Barras por colección
        const colCount = {};
        lotes.filter(l => l.activo).forEach(l => {
            const prod = inventario.find(p => p.sku === l.sku_referencia);
            const col  = prod ? prod.coleccion : 'Sin colección';
            colCount[col] = (colCount[col] || 0) + (l.unidades_disponibles || l.unidades || 0);
        });

        const maxVal = Math.max(...Object.values(colCount), 1);
        const barListEl = document.getElementById('resumen-colecciones');
        if (barListEl) {
            if (Object.keys(colCount).length === 0) {
                barListEl.innerHTML = '<p class="alert-empty">Sin datos de stock</p>';
            } else {
                barListEl.innerHTML = Object.entries(colCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([col, cnt]) => `
                        <div class="bar-item">
                            <div class="bar-header">
                                <span>${col}</span><span>${cnt} uds</span>
                            </div>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${(cnt/maxVal*100).toFixed(1)}%"></div>
                            </div>
                        </div>`).join('');
            }
        }

        // Alertas de stock bajo (< 3 unidades disponibles)
        const alertEl = document.getElementById('resumen-alertas');
        if (alertEl) {
            const bajos = lotes.filter(l => l.activo && (l.unidades_disponibles || l.unidades || 0) < 3);
            if (bajos.length === 0) {
                alertEl.innerHTML = '<div class="alert-item ok">✓ Stock saludable en todos los lotes</div>';
            } else {
                alertEl.innerHTML = bajos.map(l => `
                    <div class="alert-item warn">
                        ⚠ ${l.sku_referencia} — ${l.unidades_disponibles || l.unidades || 0} unidad(es) disponibles
                    </div>`).join('');
            }
        }

    } catch (e) {
        console.error('Error cargando resumen:', e);
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: VENTAS
// ══════════════════════════════════════════════════════
async function cargarVentas() {
    try {
        const res     = await fetch('/api/ingresos_mensuales');
        const ingreso = await res.json();
        const mesActual = new Date().toISOString().slice(0, 7);
        const val = ingreso[mesActual] || 0;

        const el = document.getElementById('ventas-ingresos');
        if (el) el.textContent = fmt(val);

        // Los otros KPIs requieren historial_ventas.json — por ahora "—"
        const vt = document.getElementById('ventas-total');
        const vg = document.getElementById('ventas-ganancia');
        if (vt) vt.textContent = '—';
        if (vg) vg.textContent = '—';
    } catch(e) {
        console.error('Error cargando ventas:', e);
    }
}

/** Registrar venta — llama POST /api/lotes/venta */
async function registrarVenta() {
    const sku      = document.getElementById('venta-sku')?.value?.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById('venta-cantidad')?.value);

    if (!sku || !cantidad || cantidad < 1) {
        setFeedback('venta-feedback', 'Completa SKU y cantidad', 'error');
        return;
    }

    try {
        const res  = await fetch('/api/lotes/venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, cantidad })
        });
        const data = await res.json();

        if (data.ok) {
            setFeedback('venta-feedback', `✓ ${data.mensaje}`, 'ok');
            document.getElementById('venta-sku').value      = '';
            document.getElementById('venta-cantidad').value = '';
            cargarResumen(); // refrescar KPIs
        } else {
            setFeedback('venta-feedback', data.mensaje || data.error, 'error');
        }
    } catch(e) {
        setFeedback('venta-feedback', 'Error de conexión con el servidor', 'error');
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: PRODUCTOS
// ══════════════════════════════════════════════════════
async function cargarProductos() {
    try {
        const res        = await fetch('/api/inventario');
        const inventario = await res.json();

        const badge = document.getElementById('prod-count');
        if (badge) badge.textContent = inventario.length;

        const tbody = document.getElementById('tbody-productos');
        if (!tbody) return;

        if (!inventario.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Sin productos en el catálogo</td></tr>';
            return;
        }

        tbody.innerHTML = inventario.map(p => `
            <tr>
                <td>${p.sku}</td>
                <td>${p.nombre || '—'}</td>
                <td>${p.joya || '—'}</td>
                <td>${p.coleccion || '—'}</td>
                <td>${p.material || '—'}</td>
                <td>${p.margen}×</td>
                <td>
                    <span class="${p.web?.visible ? 'badge-visible' : 'badge-oculto'}">
                        ${p.web?.visible ? 'Visible' : 'Oculto'}
                    </span>
                </td>
                <td>
                    <button class="btn-table-delete" onclick="eliminarProducto('${p.sku}')">
                        Eliminar
                    </button>
                </td>
            </tr>`).join('');

    } catch(e) {
        console.error('Error cargando productos:', e);
    }
}

/** Preview del SKU en tiempo real mientras escribe */
function previewSku() {
    const sku   = document.getElementById('prod-sku')?.value?.trim().toUpperCase();
    const el    = document.getElementById('sku-preview');
    if (!el) return;

    if (!sku || sku.split('-').length < 4) {
        el.textContent = '';
        return;
    }

    const partes = sku.split('-');
    const tipo   = TIPOS[partes[0]]        || '?';
    const col    = COLECCIONES[partes[1]]  || '?';
    const mod    = MODELOS[partes[2]]      || '?';
    const mat    = MATERIALES[partes[3]]   || '?';
    el.textContent = `${tipo} · ${col} · ${mod} · ${mat}`;
}

/** Agregar producto — POST /api/inventario */
async function agregarProducto() {
    const sku = document.getElementById('prod-sku')?.value?.trim().toUpperCase();

    if (!sku) {
        setFeedback('prod-feedback', 'El SKU es obligatorio', 'error');
        return;
    }

    const payload = {
        sku,
        nombre:           document.getElementById('prod-nombre')?.value?.trim() || '',
        margen:           parseFloat(document.getElementById('prod-margen')?.value) || 0,
        descripcion:      document.getElementById('prod-descripcion')?.value?.trim() || '',
        material_dije:    document.getElementById('prod-mat-dije')?.value?.trim() || '',
        broches:          document.getElementById('prod-broches')?.value?.trim() || '',
        dimensiones_dije: document.getElementById('prod-dim-dije')?.value?.trim() || '',
        dimensiones_cadena: document.getElementById('prod-dim-cadena')?.value?.trim() || '',
        visible: true
    };

    try {
        const res  = await fetch('/api/inventario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('prod-feedback', `✓ Producto ${data.sku} guardado`, 'ok');
            toggleForm('form-producto'); // cerrar form
            cargarProductos();           // refrescar tabla
        } else {
            setFeedback('prod-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('prod-feedback', 'Error de conexión con el servidor', 'error');
    }
}

/** Eliminar producto — DELETE /api/inventario/<sku> */
async function eliminarProducto(sku) {
    if (!confirm(`¿Eliminar el producto ${sku}?\nEsta acción no se puede deshacer.`)) return;

    try {
        const res  = await fetch(`/api/inventario/${sku}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            cargarProductos();
        } else {
            alert('Error: ' + data.error);
        }
    } catch(e) {
        alert('Error de conexión con el servidor');
    }
}
// ══════════════════════════════════════════════════════
//  SUBIDA DE IMAGEN
// ══════════════════════════════════════════════════════

function previewImagen(input) {
    const preview  = document.getElementById('imagen-preview');
    const uploadTx = document.getElementById('upload-text');

    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            uploadTx.textContent = input.files[0].name;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Subir la imagen ANTES de guardar el producto.
// agregarProducto() la llama internamente — no es manual.
async function subirImagen(sku) {
    const input = document.getElementById('prod-imagen');
    if (!input || !input.files || !input.files[0]) return null;

    const formData = new FormData();
    formData.append('imagen', input.files[0]);
    formData.append('sku', sku);

    // ⚠️  FormData NO lleva 'Content-Type' manual —
    //     el browser lo pone con el boundary correcto automáticamente
    const res  = await fetch('/api/upload_imagen', {
        method: 'POST',
        body:   formData
    });
    const data = await res.json();
    return res.ok ? data.imagen : null;
}

//_______________________________________________________
//  CALCULADORA INLINE (en formulario de producto)

function calcularInline() {
    const costo  = parseFloat(document.getElementById('prod-costo-calc')?.value);
    const margen = parseFloat(document.getElementById('prod-margen')?.value);
    const el     = document.getElementById('calc-inline-precio');
    const panel  = document.getElementById('calc-inline-result');

    if (!costo || !margen || isNaN(costo) || isNaN(margen)) {
        if (el) el.textContent = '—';
        return;
    }

    // Misma fórmula del backend
    const precio = (costo * margen) / (1 - 0.036) + 3;
    if (el)    el.textContent  = fmt(precio);
    if (panel) panel.dataset.precio = precio;
}

function usarPrecioCalculado() {
    const panel = document.getElementById('calc-inline-result');
    const precio = parseFloat(panel?.dataset.precio);
    if (!precio || isNaN(precio)) return;

    const input = document.getElementById('prod-precio');
    if (input) {
        input.value = precio.toFixed(2);
        // Flash visual para confirmar
        input.style.borderColor = 'var(--gold)';
        setTimeout(() => input.style.borderColor = '', 1000);
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: LOTES
// ══════════════════════════════════════════════════════
async function cargarLotes() {
    try {
        const res   = await fetch('/api/lotes');
        const lotes = await res.json();

        const badge = document.getElementById('lote-count');
        if (badge) badge.textContent = lotes.length;

        const tbody = document.getElementById('tbody-lotes');
        if (!tbody) return;

        if (!lotes.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Sin lotes registrados</td></tr>';
            return;
        }

        tbody.innerHTML = lotes.map(l => `
            <tr>
                <td>${l.id_lote}</td>
                <td>${l.sku_referencia}</td>
                <td>${l.unidades}</td>
                <td>${l.unidades_disponibles ?? l.unidades}</td>
                <td>${fmt(l.costo_unitario)}</td>
                <td>${fmt(l.precio_sugerido)}</td>
                <td>${fmt(l.ganancia_unitaria)}</td>
                <td>
                    <span class="${(l.activo || l.estatus) ? 'badge-activo' : 'badge-inactivo'}">
                        ${(l.activo || l.estatus) ? 'Activo' : 'Agotado'}
                    </span>
                </td>
            </tr>`).join('');

    } catch(e) {
        console.error('Error cargando lotes:', e);
    }
}

/** Registrar lote — POST /api/lotes */
async function registrarLote() {
    const sku       = document.getElementById('lote-sku')?.value?.trim().toUpperCase();
    const unidades  = parseInt(document.getElementById('lote-unidades')?.value);
    const empaque   = parseFloat(document.getElementById('lote-empaque')?.value) || 0;
    const dije      = parseFloat(document.getElementById('lote-dije')?.value) || 0;
    const cadena    = parseFloat(document.getElementById('lote-cadena')?.value) || 0;
    const complem   = parseFloat(document.getElementById('lote-complementos')?.value) || 0;
    const envio     = parseFloat(document.getElementById('lote-envio')?.value) || 0;

    if (!sku || !unidades || unidades < 1) {
        setFeedback('lote-feedback', 'SKU y unidades son obligatorios', 'error');
        return;
    }

    const payload = {
        sku_referencia: sku,
        unidades,
        empaque,
        main_dije:    dije,
        cadena,
        complementos: complem,
        envio
    };

    try {
        const res  = await fetch('/api/lotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('lote-feedback', `✓ Lote ${data.lote.id_lote} registrado`, 'ok');
            toggleForm('form-lote');
            cargarLotes();
            cargarResumen();
        } else {
            setFeedback('lote-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('lote-feedback', 'Error de conexión con el servidor', 'error');
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: MOVIMIENTOS — Devolución
// ══════════════════════════════════════════════════════
async function registrarDevolucion() {
    const idLote  = document.getElementById('dev-id-lote')?.value?.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById('dev-cantidad')?.value);

    if (!idLote || !cantidad || cantidad < 1) {
        setFeedback('dev-feedback', 'ID de lote y cantidad son obligatorios', 'error');
        return;
    }

    try {
        const res  = await fetch('/api/lotes/devolucion', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_lote: idLote, cantidad })
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('dev-feedback', `✓ Devolución registrada en ${data.lote.id_lote}`, 'ok');
            document.getElementById('dev-id-lote').value  = '';
            document.getElementById('dev-cantidad').value = '';
            cargarResumen();
        } else {
            setFeedback('dev-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('dev-feedback', 'Error de conexión con el servidor', 'error');
    }
}

// ══════════════════════════════════════════════════════
//  VISTA: CALCULADORA DE PRECIOS (sin backend — cálculo local)
// ══════════════════════════════════════════════════════
function calcularPrecio() {
    const costo  = parseFloat(document.getElementById('calc-costo')?.value);
    const margen = parseFloat(document.getElementById('calc-margen')?.value);

    const precioEl   = document.getElementById('calc-precio');
    const gananciaEl = document.getElementById('calc-ganancia');
    const totalEl    = document.getElementById('calc-total');

    if (!costo || !margen || isNaN(costo) || isNaN(margen)) {
        if (precioEl)   precioEl.textContent   = '—';
        if (gananciaEl) gananciaEl.textContent = '—';
        if (totalEl)    totalEl.textContent    = '—';
        return;
    }

    // Misma fórmula que calculadora_precios() en app.py
    const precio   = (costo * margen) / (1 - 0.036) + 3;
    const ganancia = precio - costo;
    const total    = ganancia * 7;

    if (precioEl)   precioEl.textContent   = fmt(precio);
    if (gananciaEl) gananciaEl.textContent = fmt(ganancia);
    if (totalEl)    totalEl.textContent    = fmt(total);
}


// ══════════════════════════════════════════════════════════════
//  NUEVAS FUNCIONES 25/MAY/2026** Terminar de revisar y organizar
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  AUTOCOMPLETE DE SKU EN LOTES
// ══════════════════════════════════════════════════════

// Cache del inventario — se carga una sola vez por sesión
let _inventarioCache = null;

async function getInventarioCache() {
    if (_inventarioCache) return _inventarioCache;
    const res = await fetch('/api/inventario');
    _inventarioCache = await res.json();
    return _inventarioCache;
}

async function filtrarSkus(query) {
    const dropdown = document.getElementById('sku-dropdown');
    if (!dropdown) return;

    if (!query || query.length < 1) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }

    const inventario = await getInventarioCache();
    const q = query.toUpperCase();
    const coincidencias = inventario.filter(p =>
        p.sku.includes(q) || (p.nombre || '').toUpperCase().includes(q)
    ).slice(0, 6); // máximo 6 sugerencias

    if (!coincidencias.length) {
        dropdown.classList.add('hidden');
        return;
    }

    dropdown.innerHTML = coincidencias.map(p => `
        <div class="sku-option" onclick="seleccionarSku(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            <span class="sku-option-code">${p.sku}</span>
            <span class="sku-option-name">${p.nombre || '—'}</span>
            <span class="sku-option-meta">${p.coleccion} · ${p.material}</span>
        </div>`).join('');

    dropdown.classList.remove('hidden');
}

function seleccionarSku(producto) {
    // Rellena el input con el SKU elegido
    const input = document.getElementById('lote-sku');
    if (input) input.value = producto.sku;

    // Cierra el dropdown
    const dropdown = document.getElementById('sku-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
    }

    // Muestra la info del producto seleccionado
    const infoTag = document.getElementById('lote-producto-info');
    if (infoTag) {
        document.getElementById('lote-prod-nombre').textContent    = producto.nombre || producto.sku;
        document.getElementById('lote-prod-coleccion').textContent = producto.coleccion || '—';
        document.getElementById('lote-prod-material').textContent  = producto.material || '—';
        document.getElementById('lote-prod-margen').textContent    = producto.margen + '×';
        infoTag.classList.remove('hidden');
    }
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', e => {
    const wrap = document.querySelector('.autocomplete-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dd = document.getElementById('sku-dropdown');
        if (dd) dd.classList.add('hidden');
    }
});

// Modificar agregarProducto para subir imagen antes de guardar
// Parchea la función para incluir la imagen en el flujo
const _agregarProductoOriginal = agregarProducto;
agregarProducto = async function() {
    const sku = document.getElementById('prod-sku')?.value?.trim().toUpperCase();
    if (!sku) {
        setFeedback('prod-feedback', 'El SKU es obligatorio', 'error');
        return;
    }

    // 1. Subir imagen primero si hay una seleccionada
    const rutaImagen = await subirImagen(sku);

    // 2. Construir payload incluyendo la imagen
    const payload = {
        sku,
        nombre:             document.getElementById('prod-nombre')?.value?.trim() || '',
        margen:             parseFloat(document.getElementById('prod-margen')?.value) || 0,
        descripcion:        document.getElementById('prod-descripcion')?.value?.trim() || '',
        material_dije:      document.getElementById('prod-mat-dije')?.value?.trim() || '',
        broches:            document.getElementById('prod-broches')?.value?.trim() || '',
        dimensiones_dije:   document.getElementById('prod-dim-dije')?.value?.trim() || '',
        dimensiones_cadena: document.getElementById('prod-dim-cadena')?.value?.trim() || '',
        precio_publico:     parseFloat(document.getElementById('prod-precio')?.value) || 0,
        imagen:             rutaImagen || `imgs/productos/${sku}.jpg`,
        visible:            true
    };

    try {
        const res  = await fetch('/api/inventario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('prod-feedback', `✓ Producto ${data.sku} guardado`, 'ok');
            toggleForm('form-producto');
            cargarProductos();
        } else {
            setFeedback('prod-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('prod-feedback', 'Error de conexión con el servidor', 'error');
    }
};
// ─── TABLA PRODUCTOS — versión actualizada con editar/visibilidad
// Sobrescribe cargarProductos() anterior
async function cargarProductos() {
    try {
        const res        = await fetch('/api/inventario');
        const inventario = await res.json();

        const badge = document.getElementById('prod-count');
        if (badge) badge.textContent = inventario.length;

        const tbody = document.getElementById('tbody-productos');
        if (!tbody) return;

        if (!inventario.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Sin productos en el catálogo</td></tr>';
            return;
        }

        tbody.innerHTML = inventario.map(p => {
            const visible   = p.web?.visible !== false;
            const precio    = p.web?.precio_publico ? '$' + Number(p.web.precio_publico).toLocaleString('es-MX') : '—';
            return `
            <tr>
                <td>${p.sku}</td>
                <td>${p.nombre || '—'}</td>
                <td>${p.joya || '—'}</td>
                <td>${p.coleccion || '—'}</td>
                <td>${p.material || '—'}</td>
                <td>${p.margen}×</td>
                <td class="precio-tag">${precio}</td>
                <td>
                    <button
                        class="btn-visibility ${visible ? 'visible' : ''}"
                        onclick="toggleVisibilidad('${p.sku}', ${!visible})">
                        ${visible ? '● Visible' : '○ Oculto'}
                    </button>
                </td>
                <td>
                    <div class="btn-table-actions">
                        <button class="btn-table-edit" onclick="abrirEdicion(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                            Editar
                        </button>
                        <button class="btn-table-delete" onclick="eliminarProducto('${p.sku}')">
                            Eliminar
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

    } catch(e) {
        console.error('Error cargando productos:', e);
    }
}

// ─── ABRIR FORMULARIO EDICIÓN (rellena los campos con datos del producto)
function abrirEdicion(producto) {
    // Cerrar form de agregar si estaba abierto
    const formAgregar = document.getElementById('form-producto');
    if (formAgregar && !formAgregar.classList.contains('hidden')) {
        formAgregar.classList.add('hidden');
    }

    document.getElementById('edit-sku-original').value  = producto.sku;
    document.getElementById('edit-sku-titulo').textContent = producto.sku;
    document.getElementById('edit-nombre').value          = producto.nombre || '';
    document.getElementById('edit-margen').value          = producto.margen || '';
    document.getElementById('edit-precio').value          = producto.web?.precio_publico || '';
    document.getElementById('edit-mat-dije').value        = producto.web?.material_dije || '';
    document.getElementById('edit-broches').value         = producto.web?.broches || '';
    document.getElementById('edit-dim-dije').value        = producto.web?.dimensiones_dije || '';
    document.getElementById('edit-dim-cadena').value      = producto.web?.dimensiones_cadena || '';
    document.getElementById('edit-descripcion').value     = producto.web?.descripcion || '';

    const form = document.getElementById('form-editar-producto');
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── GUARDAR EDICIÓN — PUT /api/inventario/<sku>
async function guardarEdicion() {
    const sku = document.getElementById('edit-sku-original').value;

    const payload = {
        nombre: document.getElementById('edit-nombre').value.trim(),
        margen: parseFloat(document.getElementById('edit-margen').value),
        web: {
            precio_publico:    parseFloat(document.getElementById('edit-precio').value) || 0,
            material_dije:     document.getElementById('edit-mat-dije').value.trim(),
            broches:           document.getElementById('edit-broches').value.trim(),
            dimensiones_dije:  document.getElementById('edit-dim-dije').value.trim(),
            dimensiones_cadena:document.getElementById('edit-dim-cadena').value.trim(),
            descripcion:       document.getElementById('edit-descripcion').value.trim(),
        }
    };

    try {
        const res  = await fetch(`/api/inventario/${sku}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('edit-feedback', `✓ ${sku} actualizado`, 'ok');
            toggleForm('form-editar-producto');
            cargarProductos();
        } else {
            setFeedback('edit-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('edit-feedback', 'Error de conexión con el servidor', 'error');
    }
}

// ─── TOGGLE VISIBILIDAD — PUT /api/inventario/<sku>
async function toggleVisibilidad(sku, nuevoEstado) {
    try {
        const res = await fetch(`/api/inventario/${sku}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ web: { visible: nuevoEstado } })
        });

        if (res.ok) cargarProductos(); // refrescar tabla
        else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch(e) {
        alert('Error de conexión con el servidor');
    }
}

// ─── AGREGAR PRODUCTO — ahora incluye precio_publico
// Sobrescribe agregarProducto() anterior
async function agregarProducto() {
    const sku = document.getElementById('prod-sku')?.value?.trim().toUpperCase();
    if (!sku) {
        setFeedback('prod-feedback', 'El SKU es obligatorio', 'error');
        return;
    }

    const payload = {
        sku,
        nombre:             document.getElementById('prod-nombre')?.value?.trim() || '',
        margen:             parseFloat(document.getElementById('prod-margen')?.value) || 0,
        descripcion:        document.getElementById('prod-descripcion')?.value?.trim() || '',
        material_dije:      document.getElementById('prod-mat-dije')?.value?.trim() || '',
        broches:            document.getElementById('prod-broches')?.value?.trim() || '',
        dimensiones_dije:   document.getElementById('prod-dim-dije')?.value?.trim() || '',
        dimensiones_cadena: document.getElementById('prod-dim-cadena')?.value?.trim() || '',
        precio_publico:     parseFloat(document.getElementById('prod-precio')?.value) || 0,
        visible: true
    };

    try {
        const res  = await fetch('/api/inventario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback('prod-feedback', `✓ Producto ${data.sku} guardado`, 'ok');
            toggleForm('form-producto');
            cargarProductos();
        } else {
            setFeedback('prod-feedback', data.error, 'error');
        }
    } catch(e) {
        setFeedback('prod-feedback', 'Error de conexión con el servidor', 'error');
    }
}

// ─── TABLA LOTES — versión actualizada con botón eliminar
// Sobrescribe cargarLotes() anterior
async function cargarLotes() {
    try {
        const res   = await fetch('/api/lotes');
        const lotes = await res.json();

        const badge = document.getElementById('lote-count');
        if (badge) badge.textContent = lotes.length;

        const tbody = document.getElementById('tbody-lotes');
        if (!tbody) return;

        if (!lotes.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Sin lotes registrados</td></tr>';
            return;
        }

        tbody.innerHTML = lotes.map(l => `
            <tr>
                <td>${l.id_lote}</td>
                <td>${l.sku_referencia}</td>
                <td>${l.unidades}</td>
                <td>${l.unidades_disponibles ?? l.unidades}</td>
                <td>${fmt(l.costo_unitario)}</td>
                <td>${fmt(l.precio_sugerido)}</td>
                <td>${fmt(l.ganancia_unitaria)}</td>
                <td>
                    <span class="${(l.activo || l.estatus) ? 'badge-activo' : 'badge-inactivo'}">
                        ${(l.activo || l.estatus) ? 'Activo' : 'Agotado'}
                    </span>
                </td>
                <td>
                    <button class="btn-table-delete" onclick="eliminarLote('${l.id_lote}')">
                        Eliminar
                    </button>
                </td>
            </tr>`).join('');

    } catch(e) {
        console.error('Error cargando lotes:', e);
    }
}

// ─── ELIMINAR LOTE — DELETE /api/lotes/<id_lote>

async function eliminarLote(idLote) {
    if (!confirm(`¿Eliminar el lote ${idLote}?\nEsta acción no se puede deshacer.`)) return;

    try {
        const res  = await fetch(`/api/lotes/${encodeURIComponent(idLote)}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            cargarLotes();
            cargarResumen();
        } else {
            alert('Error: ' + data.error);
        }
    } catch(e) {
        alert('Error de conexión con el servidor');
    }
}
//══════════════════════════════════════════════════════
// ─── CONFIGURACIÓN: CATÁLOGOS (tipos, colecciones, materiales) ─
// Los catálogos viven en app.py. Esta sección los lee y edita
// via rutas /api/catalogos que hay que agregar en app.py.
//══════════════════════════════════════════════════════

async function cargarConfiguracion() {
    try {
        const res      = await fetch('/api/catalogos');
        const catalogs = await res.json();

        renderCatalogoList('lista-tipos',       catalogs.tipos,      'tipo');
        renderCatalogoList('lista-colecciones', catalogs.colecciones,'coleccion');
        renderCatalogoList('lista-materiales',  catalogs.materiales, 'material');
    } catch(e) {
        // Si la ruta no existe aún, muestra los catálogos hardcodeados del JS
        renderCatalogoList('lista-tipos',       TIPOS,      'tipo');
        renderCatalogoList('lista-colecciones', COLECCIONES,'coleccion');
        renderCatalogoList('lista-materiales',  MATERIALES, 'material');
    }
}

function renderCatalogoList(contenedorId, catalogo, tipo) {
    const el = document.getElementById(contenedorId);
    if (!el) return;

    const entradas = Object.entries(catalogo);
    if (!entradas.length) {
        el.innerHTML = '<p class="alert-empty">Sin entradas</p>';
        return;
    }

    el.innerHTML = entradas.map(([clave, valor]) => `
        <div class="catalogo-item">
            <span class="catalogo-item-clave">${clave}</span>
            <span class="catalogo-item-valor">${valor}</span>
            <div class="catalogo-item-actions">
                <button class="btn-table-delete btn-sm"
                    onclick="eliminarCatalogo('${tipo}', '${clave}')">✕</button>
            </div>
        </div>`).join('');
}

async function agregarCatalogo(tipo) {
    const claveEl = document.getElementById(`${tipo === 'tipo' ? 'tipo' : tipo === 'coleccion' ? 'col' : 'mat'}-clave`);
    const valorEl = document.getElementById(`${tipo === 'tipo' ? 'tipo' : tipo === 'coleccion' ? 'col' : 'mat'}-valor`);

    const clave = claveEl?.value?.trim().toUpperCase();
    const valor = valorEl?.value?.trim();
    const fbId  = `${tipo}-feedback`;

    if (!clave || !valor) {
        setFeedback(fbId, 'Clave y nombre son obligatorios', 'error');
        return;
    }

    try {
        const res  = await fetch('/api/catalogos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, clave, valor })
        });
        const data = await res.json();

        if (res.ok) {
            setFeedback(fbId, `✓ "${clave}: ${valor}" agregado`, 'ok');
            claveEl.value = '';
            valorEl.value = '';
            toggleForm(`form-${tipo}`);
            cargarConfiguracion();
        } else {
            setFeedback(fbId, data.error, 'error');
        }
    } catch(e) {
        setFeedback(fbId, 'Error de conexión — ruta /api/catalogos pendiente en app.py', 'error');
    }
}

async function eliminarCatalogo(tipo, clave) {
    if (!confirm(`¿Eliminar "${clave}" del catálogo de ${tipo}s?`)) return;

    try {
        const res  = await fetch(`/api/catalogos/${tipo}/${clave}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) cargarConfiguracion();
        else alert('Error: ' + data.error);
    } catch(e) {
        alert('Error de conexión — ruta /api/catalogos pendiente en app.py');
    }
}

// ── Agregar 'configuracion' al dispatcher de cargarVista() ────
// El dispatcher original no tiene este caso — lo parcheamos aquí:
const _cargarVistaOriginal = cargarVista;
cargarVista = function(nombre) {
    if (nombre === 'configuracion') {
        cargarConfiguracion();
    } else {
        _cargarVistaOriginal(nombre);
    }
};
