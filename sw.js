/* ============================================================
   Service Worker — Mayor de Stock
   - index.html / navegación: NETWORK-FIRST (siempre la última
     versión si hay internet; cache solo como respaldo offline).
   - iconos y estáticos: cache-first.
   - API (workers.dev): sin intervención (siempre a la red).
   - pdf.js (CDN): cache-first para importar offline.

   ACTUALIZACIÓN CONTROLADA (v39+):
   Ya NO auto-activamos la versión nueva con skipWaiting en install.
   Cuando hay una versión nueva, el SW queda "waiting" y la app muestra
   un botón "Update". Recién cuando el usuario lo toca, la app le manda
   el mensaje {type:"SKIP_WAITING"} y ahí sí se activa y recarga. Así
   nadie pierde una carga a medias por un refresh sorpresa.
   ============================================================ */
const CACHE = "mayor-stock-v109";   // v109: fecha de hoy en hora LOCAL en venta/compra/ajuste nuevos, compra importada, Excel del P&L y nombres de archivos descargados (antes en UTC: desde las 21 hs de Argentina proponía el día siguiente y la venta daba "fecha futura"). v108: seguridad — verificación en dos pasos (2FA con app autenticadora + códigos de recuperación, panel en Usuarios, reset por el admin), soporte de sesión por cookie HttpOnly (apagado hasta tener dominio propio), vista recortada para vendedores (la maneja el servidor). v107: la etiqueta "hoy" en tablas (Stock al cierre) usa el mismo estilo de pastilla que en los KPIs, con separación propia (no depende del espacio de la fuente). v106: el USD más chico/gris sólo en tablas y KPIs (no en frases), en negrita cuando el monto está en negrita, y sin comerse el espacio antes de "hoy". v105: Zona de peligro vuelve a ser una tarjeta aparte (en rojo) y "Borrar todo" pide escribir BORRAR / DELETE para habilitarse (antes era un confirm del navegador). v104: Configuración → General reacomodada (Facturación compacta con Guardar al pie, "Cuenta y datos" como lista), objetivos SOLO desde el Plan de ventas (se quitaron los objetivos manuales por mes), pie del menú lateral en fila. v103: vendedores del secret USERS se muestran como "Sin usuario en la app" (no "sin acceso") con botón "Pasar a usuario de la app" (mismo usuario y contraseña; queda vinculado al mismo vendedor aunque el login sea distinto). v102: pill "inversión" igual a la de bóveda en Movimientos, meses como "Septiembre 2026" en objetivos, vendedores con y sin acceso en una sola lista (con ficha para editar comisión o darles acceso), barras de desvío que no tocan el número, código de moneda más chico y gris en montos, catálogo muestra la hora real de consulta y se refresca solo cada 2 min. v101: sin recarga automática en la primera visita (el tour de bienvenida y lo escrito en el login ya no se cortan; "Update" sigue recargando), 20 estilos inline más pasados a clases, CSS con índice y 4 reglas duplicadas unificadas (estilo final idéntico), catálogo público alineado al sistema de diseño (contraste AA, nada <12px, botones de 44px). v100: tour de bienvenida del primer uso (pregunta idioma, distinto admin/vendedor) + guía "Cómo usar" (navegador de pestañas, glosario, si algo falla) que se abre con el botón ? al pie del menú; el menú queda sólo para el ERP. v99: Panel con menos rojo (reposición y alertas en ámbar, Plan del mes sin recuadro anidado), "Ver como Unidades/Cajas" en la cabecera de la tabla de stock, avisos (toasts) visibles en modo oscuro. v98: sistema de diseño — tokens de radio (xs/sm/md/lg/xl/pill), escala tipográfica de 9 pasos sin nada debajo de 12px, 5 pesos, 3 niveles de sombra, paleta propia para gráficos (ventas en índigo), montos en Inter Tight tabular, jerarquía de botones con estado pressed, ícono propio de compra, pills con SVG, 202 estilos inline migrados a clases utilitarias. v97: accesibilidad crítica — contraste AA en tema oscuro (rellenos y tintas separados), bordes de campos a 3:1, venta como acción primaria (deja de ser roja) y compra secundaria, áreas de toque de 44px en mobile, sync con ícono + texto (offline en ámbar), modales con role=dialog, foco atrapado y fondo inert. v96: blindaje (CSP, librerías dentro de la app en /vendor), papelera para admin, base comprimida en el servidor, seguridad del servidor (v95: el servidor calcula las ventas de los vendedores, sin choques entre vendedores; avisos traducidos; borrado masivo frenado). v94: mobile — tab bar inferior + botón flotante "Nueva venta" + hoja "Más", fix de overflow horizontal y hueco bajo el título, modales como hoja/pantalla completa con líneas en cards. v93: Resumen con filtro de sociedad. v92: catálogo — en tránsito como "Próximamente" bloqueado; tope del pedido = stock existente. v91: impuesto como gasto, catálogo con un solo link y stock > 0, cantidad del pedido en vivo, período "Mes" por defecto. v90: resultado neto en Excel y Resumen; stock al cierre por fecha de factura de compra. v89: P3 (desvío precio/volumen/mix, simulador, resultado neto, presupuesto y recurrentes en gastos, semanas, run rate, atribución en el catálogo). v88: P2 de UX financiera (Resumen con resultado operativo y punto de equilibrio, KPIs del P&L en cascada, sin meses vacíos ni centavos en tablas de gestión, gastos con contexto) + catálogo (nombre público, límite por cliente, cases enteros, tope de stock). v87: P1 de finanzas (plan a la fecha, presupuesto único FP&A, proyección con tope de stock, meses sin gastos marcados, compras vs costo vendido, días de stock con ventana real). v86: catálogo público (catalogo.html) + URL de imagen por producto; el SW ya no guarda otras páginas como index.html.   // v85: export del P&L con presentación (ExcelJS: tarjetas, colores, gráficos, hojas por sociedad/juego/vendedor/gastos). v84: categoría Mantenimiento, etiquetas del waterfall en 2 renglones. v83: pestaña Gastos de estructura (fijos mensuales + puntuales) que bajan al P&L como resultado operativo. v82: plan de ventas simplificado (plantilla de 3 columnas) + semáforo "Plan del mes" en el Panel (falta stock vs venta lenta). v81: PDF de factura más aireado (márgenes internos, filas medidas, salto de página). v80: conceptos de cargos/costos con mayúscula inicial (también en el PDF). v79: venta con tarjeta de rentabilidad (barra apilada) y botón "Confirmar venta". v78: referencia de pago en el PDF de la factura. v77: validación real de clientes y ventas (bloquea/avisa), medio de pago obligatorio, ref. de pago. v76: compras con prorrateo de handling/flete por línea (regalos en $0 excluidos). v75: nombres de clientes con mayúscula al mostrar en Ventas/drill. v74: nombres de clientes existentes con mayúscula inicial. v73: ícono de inversiones = gema (menú, ficha, kardex). v72: siglas de idioma traducidas (ES: JAP/ESP/COR/ING · EN: JP/SP/KR/EN). v71: fechas DD/MM en español, MM/DD en inglés (PDF siempre US). v70: Movimientos rediseñado (anchos, origen traducido y clickeable). v69: Panel sin columnas Akira/Silver (flag DASH_SHOW_SOC_COLS). v68: label EN en vez de English. v67: idioma KOR. v66: idioma English (EN) + migración de productos sin idioma. v65: en español "Juego" en vez de "Game". v64: "línea"/"categoría" de producto pasa a llamarse "Game". v63: país traducido en Análisis, filtros y drill. v62: países con desplegable+buscador, mayúsculas prolijas y email validado en clientes. v61: clientes con acciones en ícono (editar/eliminar). v60: sidebar con scroll interno y modo compacto en pantallas bajas (sincronizar/salir siempre visibles). v59: eje de gráficos sin cortes, ícono SVG de bóveda. v58: KPIs redondeados y que entran en la tarjeta, control de período con Rango. v57: fechas americanas, drill-down, proyección de cierre, fotos mensuales de stock. v56: Resumen ejecutivo + Plan vs Real (FP&A). v55: capa semántica financiera, filtros compartidos, subtotales del panel, fix FIFO

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./guia.css",
  "./js/00a-tema.js",
  "./js/00b-i18n.js",
  "./js/00c-icons.js",
  "./js/00d-i18n-fin.js",
  "./js/00e-i18n-guia.js",
  "./js/07-paises.js",
  "./js/01-core.js",
  "./js/02-engine.js",
  "./js/05-metrics.js",
  "./js/06-fpa.js",
  "./js/03-router.js",
  "./js/09-compat-select.js",
  "./js/10-view-dashboard.js",
  "./js/11-view-analisis.js",
  "./js/11b-view-pnl.js",
  "./js/11c-view-resumen.js",
  "./js/11d-view-plan.js",
  "./js/11e-drill.js",
  "./js/11f-view-gastos.js",
  "./js/12-view-investments.js",
  "./js/13-view-productos.js",
  "./js/14-view-documentos.js",
  "./js/15-view-movimientos.js",
  "./js/16-view-datos.js",
  "./js/17-view-clientes.js",
  "./js/20-modal-producto.js",
  "./js/21-modal-documento.js",
  "./js/22-ui-modales.js",
  "./js/30-pdf.js",
  "./js/31-export-pnl.js",
  "./js/31b-export-pnl-pro.js",
  "./js/32-importar-pdf.js",
  "./js/33-ficha-producto.js",
  "./js/34-datos-io.js",
  "./js/18-papelera.js",
  "./js/19-view-guia.js",
  "./js/40-field-enhancers.js",
  "./js/41-mobile-nav.js",
  "./js/43-seguridad.js",
  "./vendor/qrcode.js",
  "./js/42-moneda.js",
  "./js/91-onboarding.js",
  "./js/90-boot.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.png",
  "./favicon-32.png"
];

const VENDOR = [
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/exceljs.min.js"
];

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/";   // pdf.js + jsPDF: cache-first offline

self.addEventListener("install", e => {
  // Precargamos el cache nuevo, pero NO llamamos skipWaiting: quedamos "waiting"
  // hasta que el usuario apriete "Update" en la app.
  // v96: las librerías de /vendor se guardan de a una: si alguna falta, no frena la instalación.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).then(() =>
    Promise.all(VENDOR.map(u => c.add(u).catch(() => {})))
  )));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// La app pide activarse cuando el usuario toca "Update".
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // API: no la tocamos, va siempre a la red
  if (url.hostname.endsWith("workers.dev")) return;

  // pdf.js (CDN): cache-first, guardando copia para offline
  if (req.url.startsWith(CDN)) {
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  if (req.method !== "GET") return;

  // Codigo propio (js/css): network-first -> siempre la ultima al editar, con copia offline
  if (url.origin === location.origin && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Navegación / index.html: NETWORK-FIRST
  // catalogo.html es una página aparte (pública): network-first con su PROPIA copia.
  // Antes toda navegación se guardaba como "./index.html" y la pisaba.
  if (url.origin === location.origin && url.pathname.endsWith("/catalogo.html")) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  const isNav = req.mode === "navigate" ||
                url.pathname.endsWith("/") ||
                url.pathname.endsWith("/index.html");
  if (isNav) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html").then(h => h || caches.match("./")))
    );
    return;
  }

  // Resto (iconos, manifest, etc.): cache-first con fallback a red
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
