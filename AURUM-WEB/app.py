import mimetypes
import os
import json
from flask import Flask, render_template, jsonify, request, send_from_directory

app = Flask(__name__)

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 1 — CATÁLOGOS Y DATOS DE REFERENCIA
# ══════════════════════════════════════════════════════════════

TIPOS = {
    "AN": "Anillo",
    "AR": "Arete",
    "CO": "Collar",
    "PU": "Pulsera",
}

COLECCIONES = {
    "H1": "Horus",
    "H2": "Isis",
    "H3": "Osiris",
    "H4": "Anubis",
    "H5": "Bastet",
    "M1": "Maat",
    "M2": "Thoth",
    "M3": "Sekhmet",
    "M4": "Ra",
}

MATERIALES = {
    "AC": "Acero 316L",
    "SS": "Plata Esterlina 9.25",
}

MODELOS = {
    "01": "Modelo 1",
    "02": "Modelo 2",
    "03": "Modelo 3",
}

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 2 — RUTAS DE ARCHIVOS
# ══════════════════════════════════════════════════════════════

RUTA_INVENTARIO  = 'data/inventario_aurum.json'
RUTA_LOTES       = 'data/inventario_lote_aurum.json'
RUTA_VENTAS      = 'data/historial_ventas.json'

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 3 — HELPERS: LECTURA Y ESCRITURA JSON
# ══════════════════════════════════════════════════════════════

def leer_json(ruta):
    """
    Lee cualquier archivo JSON del proyecto.
    Devuelve lista vacía si el archivo no existe o está vacío,
    en lugar de lanzar una excepción.
    """
    if not os.path.exists(ruta) or os.stat(ruta).st_size == 0:
        return []
    with open(ruta, 'r', encoding='utf-8') as f:
        return json.load(f)

def escribir_json(ruta, datos):
    """
    Escribe datos en un archivo JSON.
    indent=4 para mantener el archivo legible al abrirlo manualmente.
    ensure_ascii=False para conservar tildes y caracteres especiales.
    """
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(datos, f, indent=4, ensure_ascii=False)

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 4 — UTILIDADES Y LÓGICA DE NEGOCIO

# ══════════════════════════════════════════════════════════════

def traductor_sku(sku):
    """
    Descompone un SKU en sus partes legibles.
    Ejemplo: "AN-H1-01-AC" → {Tipo: Anillo, Coleccion: Horus, ...}

    Args:
        sku (str): Código con formato TIPO-COLECCION-MODELO-MATERIAL.

    Returns:
        dict: Con claves Tipo, Coleccion, Modelo, Material.
              Devuelve 'Desconocido' para partes no reconocidas.
    """
    partes = sku.split("-")
    return {
        "Tipo":      TIPOS.get(partes[0], "Desconocido"),
        "Coleccion": COLECCIONES.get(partes[1], "Colección desconocida"),
        "Modelo":    MODELOS.get(partes[2], "Modelo desconocido"),
        "Material":  MATERIALES.get(partes[3], "Material desconocido"),
    }

def calculadora_precios(producto_referencia, costo_unitario):
    """
    Calcula precio sugerido y ganancias de un lote.
    Fórmula ajusta el precio para absorber comisión Stripe (3.6% + $3 fijos).

    Args:
        producto_referencia (dict): Producto del catálogo con clave 'margen'.
        costo_unitario (float): Costo por unidad del lote.

    Returns:
        tuple: (precio_sugerido, ganancia_unitaria, ganancia_total)
               ganancia_total usa 7 unidades como referencia base.
    """
    margen = producto_referencia["margen"]
    precio_sugerido   = (costo_unitario * margen) / (1 - 0.036) + 3
    ganancia_unitaria = precio_sugerido - costo_unitario
    ganancia_total    = ganancia_unitaria * 7
    return precio_sugerido, ganancia_unitaria, ganancia_total

def procesar_venta_fifo(sku_venta, cantidad_vendida, inventario_lote):
    """
    Descuenta unidades del inventario usando FIFO.
    Desactiva el lote automáticamente cuando llega a 0 unidades.

    Args:
        sku_venta (str): SKU del producto vendido.
        cantidad_vendida (int): Unidades a descontar.
        inventario_lote (list): Lista completa de lotes.

    Returns:
        tuple: (inventario_lote actualizado, dict con resultado)
               resultado tiene claves 'ok' (bool) y 'mensaje' (str).
    """
    lotes_candidatos = [
        l for l in inventario_lote
        if l['sku_referencia'] == sku_venta and l['activo'] == True
    ]
    lotes_candidatos.sort(key=lambda x: x['id_lote'])

    por_descontar = cantidad_vendida

    for lote in lotes_candidatos:
        if por_descontar <= 0:
            break
        if lote['unidades_disponibles'] > 0:
            quitar = min(lote['unidades_disponibles'], por_descontar)
            lote['unidades_disponibles'] -= quitar
            por_descontar -= quitar
            if lote['unidades_disponibles'] == 0:
                lote['activo'] = False

    if por_descontar > 0:
        return inventario_lote, {
            "ok": False,
            "mensaje": f"Stock insuficiente. Faltan {por_descontar} unidad(es)."
        }

    return inventario_lote, {"ok": True, "mensaje": "Venta procesada correctamente."}

def validar_existencias(inventario_lote):
    """
    Recorre todos los lotes y desactiva los que tengan 0 unidades.
    📋 COPIADO DE manager.py — sin print().
    """
    for lote in inventario_lote:
        if lote.get('unidades_disponibles', 0) <= 0:
            lote['activo'] = False
    return inventario_lote

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 5 — API: INVENTARIO DE PRODUCTOS
#  Rutas bajo /api/inventario
# ══════════════════════════════════════════════════════════════

@app.route('/api/inventario', methods=['GET'])
def get_inventario():
    """
    Devuelve el catálogo completo de productos.
    El dashboard llama a esta ruta al cargar la tabla de productos.
    """
    try:
        inventario = leer_json(RUTA_INVENTARIO)
        return jsonify(inventario), 200
    except Exception as e:
        return jsonify({"error": "Error al leer inventario", "detalle": str(e)}), 500


@app.route('/api/inventario', methods=['POST'])
def agregar_producto():
    """
    Agrega un producto nuevo al catálogo.

    El dashboard envía un JSON con al menos: sku, nombre, margen
    y los campos web. El SKU se traduce automáticamente con
    traductor_sku() — no necesitas enviar joya/coleccion/modelo/material,
    se calculan solos desde el SKU.

    Respuestas posibles:
        201 → producto creado correctamente
        400 → falta el campo SKU en el body
        409 → el SKU ya existe en el catálogo
        500 → error al guardar
    """
    nuevo = request.get_json()

    # Validación mínima: el SKU es la llave de todo el sistema
    if not nuevo or 'sku' not in nuevo:
        return jsonify({"error": "El campo 'sku' es obligatorio"}), 400

    sku = nuevo['sku'].upper().strip()
    inventario = leer_json(RUTA_INVENTARIO)

    # Evitar duplicados
    if any(p['sku'] == sku for p in inventario):
        return jsonify({"error": f"El SKU '{sku}' ya existe en el catálogo"}), 409

    # Traducir SKU automáticamente
    datos = traductor_sku(sku)

    producto = {
        "sku":       sku,
        "nombre":    nuevo.get('nombre', ''),
        "joya":      datos['Tipo'],
        "coleccion": datos['Coleccion'],
        "modelo":    datos['Modelo'],
        "material":  datos['Material'],
        "margen":    float(nuevo.get('margen', 0)),
        "web": {
            "visible":             nuevo.get('visible', True),
            "descripcion":         nuevo.get('descripcion', ''),
            "material_dije":       nuevo.get('material_dije', ''),
            "broches":             nuevo.get('broches', ''),
            "dimensiones_dije":    nuevo.get('dimensiones_dije', ''),
            "dimensiones_cadena":  nuevo.get('dimensiones_cadena', ''),
            # Convención: el nombre del archivo de imagen = SKU
            "imagen": nuevo.get('imagen', f"imgs/productos/{sku}.jpg"),
        }
    }

    try:
        inventario.append(producto)
        escribir_json(RUTA_INVENTARIO, inventario)
        return jsonify({"ok": True, "sku": sku, "producto": producto}), 201
    except Exception as e:
        return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500


@app.route('/api/inventario/<sku>', methods=['PUT'])
def editar_producto(sku):
    """
    Edita campos de un producto existente.

    Solo actualiza los campos que vengan en el body — los que no
    se envíen quedan intactos. El SKU no se puede cambiar (es la llave).

    ⚠️  REVISAR: si en el futuro se necesita editar campos
    dentro de 'web' (descripcion, broches, etc.), el dashboard debe
    enviarlos anidados: { "web": { "descripcion": "nuevo texto" } }
    Esta ruta ya lo maneja correctamente con .update() anidado.

    Respuestas posibles:
        200 → editado correctamente
        400 → body vacío
        404 → SKU no encontrado
        500 → error al guardar
    """
    datos = request.get_json()

    if not datos:
        return jsonify({"error": "Body vacío — nada que actualizar"}), 400

    inventario = leer_json(RUTA_INVENTARIO)

    for i, producto in enumerate(inventario):
        if producto['sku'] == sku.upper():

            # Actualizar campos de nivel raíz (nombre, margen, etc.)
            for campo in ['nombre', 'margen']:
                if campo in datos:
                    inventario[i][campo] = datos[campo]

            # Actualizar campos anidados dentro de 'web'
            if 'web' in datos and isinstance(datos['web'], dict):
                inventario[i]['web'].update(datos['web'])

            try:
                escribir_json(RUTA_INVENTARIO, inventario)
                return jsonify({"ok": True, "producto": inventario[i]}), 200
            except Exception as e:
                return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500

    return jsonify({"error": f"SKU '{sku}' no encontrado"}), 404


@app.route('/api/inventario/<sku>', methods=['DELETE'])
def eliminar_producto(sku):
    """
    Elimina un producto del catálogo por SKU.

    ⚠️  REVISAR: esta operación no elimina los lotes
    asociados al SKU. Si se elimina un producto que tiene lotes activos,
    esos lotes quedan huérfanos en inventario_lote_aurum.json.
    #Agregar una validacion posterior para eliminar y/o administrar los lotes huérfanos. Por ahora, eliminar un producto no borra los lotes.

    Respuestas posibles:
        200 → eliminado correctamente
        404 → SKU no encontrado
        500 → error al guardar
    """
    inventario  = leer_json(RUTA_INVENTARIO)
    nueva_lista = [p for p in inventario if p['sku'] != sku.upper()]

    if len(nueva_lista) == len(inventario):
        return jsonify({"error": f"SKU '{sku}' no encontrado"}), 404

    try:
        escribir_json(RUTA_INVENTARIO, nueva_lista)
        return jsonify({"ok": True, "eliminado": sku.upper()}), 200
    except Exception as e:
        return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500

#______________________________________________________________________________
#  SECCIÓN 5.1 — API: CATÁLOGOS DINÁMICOS
#______________________________________________________________________________

# NOTA CATALOGOS: Los catalogos viven en app.py como dics en memoria, posteriormentese deben de guardar en un JSON o adaptar durante la migraciona SQLite
@app.route('/api/catalogos', methods=['GET'])
def get_catalogos():
    return jsonify({
        "tipos":       TIPOS,
        "colecciones": COLECCIONES,
        "materiales":  MATERIALES
    }), 200

@app.route('/api/catalogos', methods=['POST'])
def agregar_catalogo():
    datos = request.get_json()
    tipo  = datos.get('tipo')
    clave = datos.get('clave', '').upper()
    valor = datos.get('valor', '')
    if not tipo or not clave or not valor:
        return jsonify({"error": "tipo, clave y valor son obligatorios"}), 400
    if tipo == 'tipo':        TIPOS[clave]       = valor
    elif tipo == 'coleccion': COLECCIONES[clave] = valor
    elif tipo == 'material':  MATERIALES[clave]  = valor
    else:
        return jsonify({"error": "tipo inválido"}), 400
    return jsonify({"ok": True}), 201

@app.route('/api/catalogos/<tipo>/<clave>', methods=['DELETE'])
def eliminar_catalogo(tipo, clave):
    if tipo == 'tipo':        TIPOS.pop(clave.upper(), None)
    elif tipo == 'coleccion': COLECCIONES.pop(clave.upper(), None)
    elif tipo == 'material':  MATERIALES.pop(clave.upper(), None)
    return jsonify({"ok": True}), 200

#_____________________________________________________________________________
#  SECCIÓN 5.1 — API: SUBIDA DE IMÁGENES
#______________________________________________________________________________

RUTA_IMAGENES = 'static/imgs/productos'
EXTENSIONES_PERMITIDAS = {'jpg', 'jpeg', 'png', 'webp'}

def extension_valida(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in EXTENSIONES_PERMITIDAS

@app.route('/api/upload_imagen', methods=['POST'])
def upload_imagen():

    """
    Recibe un archivo de imagen y un SKU.
    Guarda el archivo como static/imgs/productos/<SKU>.<ext>
    """

    if 'imagen' not in request.files:
        return jsonify({"error": "No se recibió ningún archivo"}), 400

    archivo = request.files['imagen']
    sku     = request.form.get('sku', '').upper().strip()

    if not sku:
        return jsonify({"error": "SKU requerido para nombrar la imagen"}), 400

    if archivo.filename == '':
        return jsonify({"error": "Archivo vacío"}), 400

    if not extension_valida(archivo.filename):
        return jsonify({"error": "Solo se permiten jpg, jpeg, png, webp"}), 400

    ext          = archivo.filename.rsplit('.', 1)[1].lower()
    nombre_final = f"{sku}.{ext}"
    ruta_destino = os.path.join(RUTA_IMAGENES, nombre_final)

    os.makedirs(RUTA_IMAGENES, exist_ok=True)
    archivo.save(ruta_destino)

    return jsonify({
        "ok":     True,
        "imagen": f"imgs/productos/{nombre_final}"
    }), 201

# ══════════════════════════════════════════════════════════════
#  SECCIÓN 6 — API: LOTES
#  Rutas bajo /api/lotes
# ══════════════════════════════════════════════════════════════

@app.route('/api/lotes', methods=['GET'])
def get_lotes():
    """
    Devuelve todos los lotes registrados.
    El dashboard llama a esta ruta al cargar la tabla de lotes.
    """
    try:
        lotes = leer_json(RUTA_LOTES)
        return jsonify(lotes), 200
    except Exception as e:
        return jsonify({"error": "Error al leer lotes", "detalle": str(e)}), 500


@app.route('/api/lotes', methods=['POST'])
def registrar_lote():
    """
    Registra un lote nuevo de compra para un SKU existente.

    El dashboard envía los costos desglosados del lote. Esta ruta:
      1. Verifica que el SKU exista en el catálogo
      2. Genera el ID del lote automáticamente (LOTE-SKU-001, 002, etc.)
      3. Calcula costo unitario y precio sugerido con calculadora_precios()
      4. Guarda el lote en inventario_lote_aurum.json

    Body esperado (todos obligatorios):
        sku_referencia  (str)   → SKU del producto
        unidades        (int)   → cantidad de piezas en el lote
        empaque         (float) → costo total de empaque del lote
        main_dije       (float) → costo total de main/dije
        cadena          (float) → costo total de cadena
        complementos    (float) → costo total de complementos
        envio           (float) → costo total de envío

    Respuestas posibles:
        201 → lote registrado, devuelve el objeto lote completo
        400 → faltan campos obligatorios
        404 → SKU no encontrado en el catálogo
        500 → error al guardar
    """
    datos = request.get_json()

    if not datos:
        return jsonify({"error": "Body vacío"}), 400

    # Validar campos obligatorios
    campos_requeridos = ['sku_referencia', 'unidades', 'empaque',
                         'main_dije', 'cadena', 'complementos', 'envio']
    faltantes = [c for c in campos_requeridos if c not in datos]
    if faltantes:
        return jsonify({"error": f"Campos obligatorios faltantes: {faltantes}"}), 400

    sku_ref = datos['sku_referencia'].upper().strip()

    # El SKU debe existir en el catálogo — necesitamos su margen para calcular precio
    inventario     = leer_json(RUTA_INVENTARIO)
    producto_ref   = next((p for p in inventario if p['sku'] == sku_ref), None)

    if not producto_ref:
        return jsonify({"error": f"SKU '{sku_ref}' no encontrado en el catálogo"}), 404

    # Generar ID del lote: contar lotes previos de ese SKU + 1
    lotes          = leer_json(RUTA_LOTES)
    lotes_del_sku  = sum(1 for l in lotes if l['sku_referencia'] == sku_ref)
    id_lote        = f"LOTE-{sku_ref}-{lotes_del_sku + 1:03d}"

    # Calcular costos
    unidades        = int(datos['unidades'])
    costo_total     = (float(datos['empaque'])      +
                       float(datos['main_dije'])    +
                       float(datos['cadena'])       +
                       float(datos['complementos']) +
                       float(datos['envio']))
    costo_unitario  = costo_total / unidades

    precio_sugerido, ganancia_unitaria, ganancia_total = calculadora_precios(
        producto_ref, costo_unitario
    )

    nuevo_lote = {
        "id_lote":            id_lote,
        "sku_referencia":     sku_ref,
        "unidades":           unidades,
        "unidades_disponibles": unidades,
        "activo":             True,
        "costo_total_lote":   round(costo_total, 2),
        "costo_unitario":     round(costo_unitario, 2),
        "precio_sugerido":    round(precio_sugerido, 2),
        "ganancia_unitaria":  round(ganancia_unitaria, 2),
        "ganancia_total":     round(ganancia_total, 2),
    }

    try:
        lotes.append(nuevo_lote)
        escribir_json(RUTA_LOTES, lotes)
        return jsonify({"ok": True, "lote": nuevo_lote}), 201
    except Exception as e:
        return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500


@app.route('/api/lotes/venta', methods=['POST'])
def procesar_venta():
    """
    Descuenta unidades del inventario usando lógica FIFO.
    Agota el lote más antiguo primero antes de pasar al siguiente.

    Body esperado:
        sku      (str) → SKU del producto vendido
        cantidad (int) → unidades vendidas

    ⚠️  REVISAR MANUALMENTE: esta ruta no registra la venta en
    historial_ventas.json todavía — solo descuenta el stock.
    En sesión 4 o posterior se puede agregar el registro de venta
    con fecha y total para que /api/ingresos_mensuales tenga datos.

    Respuestas posibles:
        200 → venta procesada (puede incluir alerta de stock insuficiente)
        400 → faltan campos obligatorios
        500 → error al guardar
    """
    datos = request.get_json()

    if not datos or 'sku' not in datos or 'cantidad' not in datos:
        return jsonify({"error": "Se requieren los campos 'sku' y 'cantidad'"}), 400

    sku      = datos['sku'].upper().strip()
    cantidad = int(datos['cantidad'])

    lotes = leer_json(RUTA_LOTES)
    lotes_actualizados, resultado = procesar_venta_fifo(sku, cantidad, lotes)

    try:
        escribir_json(RUTA_LOTES, lotes_actualizados)
        status = 200 if resultado['ok'] else 200  # 200 en ambos casos — el mensaje explica
        return jsonify(resultado), status
    except Exception as e:
        return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500


@app.route('/api/lotes/devolucion', methods=['PUT'])
def registrar_devolucion():
    """
    Devuelve unidades a un lote existente.
    Si el lote estaba desactivado por agotamiento, lo reactiva.

    Body esperado:
        id_lote  (str) → ID del lote (ej. "LOTE-AN-H1-01-SS-001")
        cantidad (int) → unidades a devolver

    Respuestas posibles:
        200 → devolución registrada, devuelve el lote actualizado
        400 → faltan campos obligatorios
        404 → id_lote no encontrado
        500 → error al guardar
    """
    datos = request.get_json()

    if not datos or 'id_lote' not in datos or 'cantidad' not in datos:
        return jsonify({"error": "Se requieren los campos 'id_lote' y 'cantidad'"}), 400

    id_lote  = datos['id_lote'].upper().strip()
    cantidad = int(datos['cantidad'])

    lotes = leer_json(RUTA_LOTES)
    lote  = next((l for l in lotes if l['id_lote'] == id_lote), None)

    if not lote:
        return jsonify({"error": f"Lote '{id_lote}' no encontrado"}), 404

    lote['unidades_disponibles'] += cantidad
    lote['activo'] = True  # Reactiva si estaba agotado

    try:
        escribir_json(RUTA_LOTES, lotes)
        return jsonify({"ok": True, "lote": lote}), 200
    except Exception as e:
        return jsonify({"error": "Error al guardar", "detalle": str(e)}), 500

@app.route('/api/lotes/<id_lote>', methods=['DELETE'])
def eliminar_lote(id_lote):
    lotes = leer_json(RUTA_LOTES)
    nueva = [l for l in lotes if l['id_lote'] != id_lote]
    if len(nueva) == len(lotes):
        return jsonify({"error": "Lote no encontrado"}), 404
    escribir_json(RUTA_LOTES, nueva)
    return jsonify({"ok": True}), 200


# ══════════════════════════════════════════════════════════════
#  SECCIÓN 7 — API: VENTAS E INGRESOS
# ══════════════════════════════════════════════════════════════

@app.route('/api/ingresos_mensuales', methods=['GET'])
def get_ingresos_mensuales():
    """
    Calcula ingresos agrupados por mes desde historial_ventas.json.
    Devuelve JSON puro — el dashboard maneja la visualización.

    """
    ventas = leer_json(RUTA_VENTAS)

    if not ventas:
        return jsonify({}), 200

    ingresos_por_mes = {}
    for venta in ventas:
        if not isinstance(venta, dict):
            continue
        fecha = venta.get('fecha')
        total = venta.get('total')
        if isinstance(fecha, str) and isinstance(total, (int, float)):
            mes = fecha[:7]
            ingresos_por_mes[mes] = ingresos_por_mes.get(mes, 0) + total

    return jsonify(ingresos_por_mes), 200


# ══════════════════════════════════════════════════════════════
#  SECCIÓN 8 — RENDERING DE PÁGINAS (FRONT END)
# ══════════════════════════════════════════════════════════════

@app.route('/admin')
def ver_admin():
    return render_template('admin.html')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/anillos')
def ver_anillos():
    return render_template('anillos.html')

@app.route('/collares')
def ver_collares():
    return render_template('collares.html')

@app.route('/brazaletes')
def ver_brazaletes():
    return render_template('brazaletes.html')

@app.route('/pago')
def ver_pago():
    return render_template('pago.html')



# ══════════════════════════════════════════════════════════════
#  ARRANQUE
# ══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.run(debug=True)

#DEV TUNNEL
@app.after_request
def add_header(response):
    # Fuerza el tipo correcto para archivos JS
    if response.headers.get('Content-Type') == 'text/plain' and request.path.endswith('.js'):
        response.headers['Content-Type'] = 'application/javascript'
    return response



@app.route('/static/<path:path>')
def send_js(path):
    # Flask's send_from_directory usually guesses the correct mimetype
    return send_from_directory('static', path, mimetype='application/javascript')