// ══════════════════════════════════════════════════════════════
//  THE AURUM CREATIONS — script.js
//  Carrito (localStorage) + Catálogo dinámico (fetch /api/inventario)
// ══════════════════════════════════════════════════════════════

// ─── CARRITO ──────────────────────────────────────────────────
// El carrito vive en localStorage bajo la clave 'carrito_aurum'.
// Estructura: [{ nombre, precio, cantidad }, ...]

function obtenerCarrito() {
    return JSON.parse(localStorage.getItem('carrito_aurum') || '[]');
}

function guardarCarrito(carrito) {
    localStorage.setItem('carrito_aurum', JSON.stringify(carrito));
    actualizarContadorNav();
}

function actualizarContadorNav() {
    const carrito = obtenerCarrito();
    const total = carrito.reduce((s, i) => s + i.cantidad, 0);
    const el = document.getElementById('cart-count');
    if (el) el.textContent = total;
}

/**
 * Agrega un producto al carrito.
 * Si ya existe, suma la cantidad.
 * @param {string} nombre
 * @param {number} precio
 * @param {string} sku  — opcional, para referencia futura
 */
function agregarAlCarrito(nombre, precio, sku = '') {
    const carrito = obtenerCarrito();
    const idx = carrito.findIndex(i => i.nombre === nombre);

    if (idx >= 0) {
        carrito[idx].cantidad += 1;
    } else {
        carrito.push({ nombre, precio, cantidad: 1, sku });
    }

    guardarCarrito(carrito);
    mostrarFeedbackBoton(nombre);
    renderizarCarrito();
}

function mostrarFeedbackBoton(nombre) {
    // Busca el botón del producto recién agregado y muestra "✓ Añadido"
    document.querySelectorAll('.btn-add').forEach(btn => {
        if (btn.dataset.nombre === nombre) {
            const original = btn.textContent;
            btn.textContent = '✓ Añadido';
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = original;
                btn.disabled = false;
            }, 1500);
        }
    });
}

function renderizarCarrito() {
    const carrito = obtenerCarrito();
    const lista   = document.getElementById('lista-carrito');
    const total   = document.getElementById('total-precio');
    if (!lista) return;

    if (carrito.length === 0) {
        lista.innerHTML = '<p class="carrito-vacio">Tu bolsa está vacía.</p>';
        if (total) total.textContent = '$0';
        return;
    }

    lista.innerHTML = carrito.map((item, idx) => `
        <div class="carrito-item">
            <div class="carrito-info">
                <span class="carrito-nombre">${item.nombre}</span>
                <span class="carrito-precio">$${item.precio} MXN</span>
            </div>
            <div class="carrito-controles">
                <button onclick="cambiarCantidad(${idx}, -1)" class="btn-cant">−</button>
                <span>${item.cantidad}</span>
                <button onclick="cambiarCantidad(${idx}, 1)"  class="btn-cant">+</button>
                <button onclick="eliminarItem(${idx})" class="btn-eliminar">✕</button>
            </div>
        </div>`).join('');

    const suma = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    if (total) total.textContent = '$' + suma.toLocaleString('es-MX');
}

function cambiarCantidad(idx, delta) {
    const carrito = obtenerCarrito();
    carrito[idx].cantidad += delta;
    if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
    guardarCarrito(carrito);
    renderizarCarrito();
}

function eliminarItem(idx) {
    const carrito = obtenerCarrito();
    carrito.splice(idx, 1);
    guardarCarrito(carrito);
    renderizarCarrito();
}

// ─── MODAL DEL CARRITO ────────────────────────────────────────
function initModal() {
    const modal   = document.getElementById('modal-carrito');
    const cartBtn = document.getElementById('cart-btn');
    const closeEl = document.querySelector('.close');

    if (!modal) return;

    if (cartBtn) {
        cartBtn.addEventListener('click', () => {
            renderizarCarrito();
            modal.classList.add('open');
        });
    }

    if (closeEl) {
        closeEl.addEventListener('click', () => modal.classList.remove('open'));
    }

    // Cerrar al clicar fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
    });
}

// ─── CATÁLOGO DINÁMICO ────────────────────────────────────────
/**
 * Carga el catálogo desde /api/inventario y renderiza
 * solo los productos del tipo indicado que tengan web.visible = true.
 *
 * @param {string} tipoJoya — "Anillo", "Collar", "Brazalete", etc.
 *                            Si es null, muestra todos (para index.html)
 * @param {string} contenedorId — id del elemento donde insertar las tarjetas
 * @param {number|null} limite — máximo de productos a mostrar (null = todos)
 */
async function cargarCatalogo(tipoJoya, contenedorId, limite = null) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="cargando-catalogo">Cargando productos...</p>';

    try {
        const res        = await fetch('/api/inventario');
        const inventario = await res.json();

        // Filtrar por tipo y visibilidad
        let productos = inventario.filter(p => {
            const visible = p.web?.visible !== false; // true por defecto si no existe
            const tipo    = tipoJoya ? p.joya === tipoJoya : true;
            return visible && tipo;
        });

        // Aplicar límite si se indica
        if (limite) productos = productos.slice(0, limite);

        if (productos.length === 0) {
            contenedor.innerHTML = '<p class="cargando-catalogo">No hay productos disponibles por el momento.</p>';
            return;
        }

        contenedor.innerHTML = productos.map(p => {
            //web.imagen guarda la ruta relativa
            const imgSrc = p.web?.imagen ? `/static/${p.web.imagen}` : '/static/imgs/${p.sku}.jpg';
            return `
            <div class="tarjeta-producto">
                <img
                    src="${imgSrc}"
                    alt="${p.nombre}"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
                >
                <div class="img-placeholder" style="display:none;"><span>Imagen no disponible</span></div>
                <h3>${p.nombre || p.sku}</h3>
                <p class="desc-generica">${p.web?.descripcion || ''}</p>
                <p class="precio">$${p.web?.precio_publico ?? '—'} MXN</p>
                <button
                    class="btn-add"
                    data-nombre="${p.nombre}"
                    onclick="agregarAlCarrito('${p.nombre}', ${p.web?.precio_publico ?? 0}, '${p.sku}')">
                    Añadir
                </button>
            </div>`;
        }).join('');
        
    } catch (error) {
        console.error('Error al cargar catálogo:', error);
        contenedor.innerHTML = '<p class="cargando-catalogo">Error al cargar productos. Intenta recargar la página.</p>';
        }

   
}


// ─── PÁGINA DE PAGO: leer carrito de localStorage ────────────
function initPago() {
    const resumenEl = document.getElementById('resumen-items');
    const montoEl   = document.getElementById('monto-final');
    if (!resumenEl) return;

    const carrito = obtenerCarrito();

    if (carrito.length === 0) {
        resumenEl.innerHTML = '<p class="carrito-vacio">No hay productos en tu bolsa.</p>';
        if (montoEl) montoEl.textContent = '$0';
        return;
    }

    resumenEl.innerHTML = carrito.map(i => `
        <div class="resumen-linea">
            <span>${i.nombre} × ${i.cantidad}</span>
            <span>$${(i.precio * i.cantidad).toLocaleString('es-MX')}</span>
        </div>`).join('');

    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    if (montoEl) montoEl.textContent = '$' + total.toLocaleString('es-MX');
}

// ─── TARJETA VISUAL EN PAGO ───────────────────────────────────
function initTarjetaVisual() {
    const inputNombre = document.getElementById('input-nombre');
    const inputNumero = document.getElementById('input-numero');
    const inputExp    = document.getElementById('input-exp');

    if (!inputNombre) return;

    inputNombre.addEventListener('input', () => {
        const el = document.getElementById('card-name-display');
        if (el) el.textContent = inputNombre.value.toUpperCase() || 'TITULAR';
    });

    inputNumero.addEventListener('input', () => {
        // Formato: grupos de 4 dígitos
        let val = inputNumero.value.replace(/\D/g, '').slice(0, 16);
        inputNumero.value = val.replace(/(.{4})/g, '$1 ').trim();

        const el = document.getElementById('card-number-display');
        if (el) el.textContent = inputNumero.value || '0000 0000 0000 0000';

        // Detectar red (Visa / Mastercard)
        const logoEl = document.getElementById('card-logo-display');
        if (logoEl) {
            if (val.startsWith('4'))       logoEl.textContent = 'VISA';
            else if (val.startsWith('5'))  logoEl.textContent = 'MC';
            else                           logoEl.textContent = '';
        }
    });

    inputExp.addEventListener('input', () => {
        let val = inputExp.value.replace(/\D/g, '').slice(0, 4);
        if (val.length >= 3) val = val.slice(0,2) + '/' + val.slice(2);
        inputExp.value = val;

        const el = document.getElementById('card-exp-display');
        if (el) el.textContent = inputExp.value || 'MM/AA';
    });
}

// ─── INIT GENERAL ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    actualizarContadorNav();
    initModal();
    initPago();
    initTarjetaVisual();

    // ⚠️  REVISAR MANUALMENTE: cada página llama a cargarCatalogo()
    // con su propio tipo. El data-page en <body> decide cuál.
    // Si cambias el nombre de una ruta Flask, actualiza también
    // el data-page en el <body> del template correspondiente.
    const pagina = document.body.dataset.page;

    switch (pagina) {
        case 'anillos':
            cargarCatalogo('Anillo', 'grid-catalogo-dinamico');
            break;
        case 'collares':
            cargarCatalogo('Collar', 'grid-catalogo-dinamico');
            break;
        case 'brazaletes':
            cargarCatalogo('Brazalete', 'grid-catalogo-dinamico');
            break;
        case 'index':
            // Solo muestra 4 productos destacados en el home
            cargarCatalogo(null, 'grid-productos-dinamico', 4);
            break;
    }
});
