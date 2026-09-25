/* ============================================================
   Gestor de Stock — vanilla, último costo, sincronizado
   ============================================================ */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";   // v96: local (antes CDN)
}

const KEY = "gstock_v1";
const SKEY = "gstock_sync";       // { syncedRev, dirty }
const SESKEY = "gstock_session";  // { user, token, space, role, store }

/* ============================================================
   MULTI-STORE / ROLES / LANGUAGE / SPECIAL STATES  (Phase 1)
   ------------------------------------------------------------
   STORES: separate selling entities. Stock, FIFO cost layers and
   sale price live PER STORE, but the product master is SHARED so we
   can compare the same SKU across stores (margin analysis, point 4).
   ROLES: 'admin' (a.k.a. master: sees everything incl. investment
   vault) and 'seller' (only their own store).
   PRODUCT STATE: 'sale' (normal) | 'blocked' (best-offer, visible to
   sellers with a flag, not sellable without approval) | 'investment'
   (executive hold, leaves the sellable inventory, admin-only vault).
   LANGUAGE: per-product tag JP | ESP.
   ============================================================ */
const STORES = [
  { id:"akira",  name:"Akira"  },
  { id:"silver", name:"Silver" }
];
const STORE_IDS = STORES.map(s=>s.id);
/* Investment vault = a hidden pseudo-store. Stock and FIFO cost layers moved
   here LEAVE the sellable inventory (STORE_IDS) but keep full traceability.
   It's deliberately NOT part of STORE_IDS, so it never counts as sellable
   stock, never shows in selling views, and never inflates valuation. */
const INV_STORE = "__inv";
function storeName(id){ if(id===INV_STORE) return t("core.store.vault"); const s=STORES.find(x=>x.id===id); return s?s.name:(id||"—"); }
function isStore(id){ return STORE_IDS.includes(id); }

const ROLES = { ADMIN:"admin", SELLER:"seller" };
function currentRole(){ return (session && session.role) || ROLES.ADMIN; }  // Local mode (no session) = full access
function isAdmin(){ return currentRole()===ROLES.ADMIN; }
function isSeller(){ return currentRole()===ROLES.SELLER; }
/* Vistas reservadas al admin. Un vendedor NO carga compras, no manda a inversión,
   no ve análisis/comisiones globales ni la exportación de datos. Sólo vende. */
const ADMIN_VIEWS = ["compras","inv","analisis","datos","mov","pnl","resumen","plan","usuarios"];
/* Capacidades gateadas por rol (punto 3). El modo Local (sin sesión) = admin. */
function puedeComprar(){ return isAdmin(); }        // cargar compras / recibir facturas
function puedeInvertir(){ return isAdmin(); }       // enviar / traer de la bóveda de inversión
function puedeAjustar(){ return isAdmin(); }        // ajustes de inventario
function puedeEditarProductos(){ return isAdmin(); }// ABM de productos
/* SOCIEDADES: akira/silver (y futuras) son las entidades que COMPRAN. Definen la
   procedencia de cada lote, NO un local de venta. El stock es un pool único: para
   VENDER no se elige sociedad. Todos ven el mismo pool; el desglose por sociedad
   (columnas Akira/Silver) es info de procedencia y se muestra sólo al admin. */
function allowedStores(){ return STORE_IDS.slice(); }
/* Desglose por sociedad (procedencia). Admin, vista consolidada, 2+ sociedades.
   Genérico: una columna por sociedad, así escala a futuras sociedades sin tocar código. */
function showSociedadCols(){ return isAdmin() && activeStore==="all" && STORE_IDS.length>1; }
function sociedadColsHead(f){ return showSociedadCols() ? STORE_IDS.map(s=> f ? sortTh(f, "soc_"+s, storeName(s), "r") : `<th class="r">${esc(storeName(s))}</th>`).join("") : ""; }
function sociedadColsCells(p, isT){ return showSociedadCols() ? STORE_IDS.map(s=>`<td class="r num">${stockDisplay(p, isT?transitoDe(p,s):stockDe(p,s))}</td>`).join("") : ""; }
/* The store currently in focus. 'all' = consolidated (admin only). */
let activeStore = "all";
/* Vistas donde el SWITCHER de sociedad (foco de procedencia) aporta:
   - prod / compras: procedencia del stock (quién lo compró) y foco de conteo.
   Analysis NO usa el switcher: la venta no está atada a una sociedad (pool único),
   así que los chips no filtrarían nada. En su lugar mostramos una tabla real de
   costo/margen POR SOCIEDAD (procedencia del stock consumido). En dashboard, ventas
   y movimientos el stock es un pool único -> consolidado, sin chips. */
const SOCIETY_VIEWS = ["prod", "compras", "analisis", "pnl", "resumen"];   // v93: + resumen   // analisis: filtra ventas por procedencia (FIFO consumido)
function viewUsesSociety(){ return SOCIETY_VIEWS.includes(view); }
function effectiveStores(){
  const allow = allowedStores();
  // En vistas sin desglose por sociedad, o en "All", devolvemos el pool completo.
  if(activeStore==="all" || !viewUsesSociety()) return allow;
  return allow.includes(activeStore) ? [activeStore] : allow;
}

const PRODUCT_STATES = { SALE:"sale", BLOCKED:"blocked", INVESTMENT:"investment" };
/* Estado de envío de una factura de COMPRA (tracking, no toca stock). */
const INVOICE_STATUS = { IN_TRANSIT:"in_transit", RECEIVED:"received" };
function invoiceStatusLabel(s){ return s===INVOICE_STATUS.RECEIVED ? t("core.inv.received") : t("core.inv.transit"); }
/* Idiomas de producto. El CÓDIGO guardado es fijo (JP | ESP | KOR | EN); la sigla
   que se ve sale del diccionario, así cambia con el idioma de la app:
     ES → JAP · ESP · COR · ING      EN → JP · SP · KR · EN
   langOpts() arma los pares [código, sigla] al momento de dibujar. */
const LANG_CODES = ["JP","ESP","KOR","EN"];
function langOpts(){ return LANG_CODES.map(c=> [c, t("lang."+c)]); }
function langLabel(v){ return LANG_CODES.includes(v) ? t("lang."+v) : (v||"—"); }
/* Idioma sugerido para un producto NUEVO a partir de su SKU/nombre:
   si dice JP/Japanese → JP; ESP/SP/Spanish → ESP; KOR/KR/Korean → KOR; si no, English. */
function idiomaSugerido(texto){
  const s = String(texto||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(/(^|[^A-Z])(JP|JPN|JAP|JAPANESE|JAPONES)([^A-Z]|$)/.test(s)) return "JP";
  if(/(^|[^A-Z])(ESP|SP|SPANISH|ESPANOL|CASTELLANO)([^A-Z]|$)/.test(s)) return "ESP";
  if(/(^|[^A-Z])(KOR|KR|KOREAN|COREANO)([^A-Z]|$)/.test(s)) return "KOR";
  return "EN";
}

/* URL del servidor (Cloudflare Worker). Si algún día lo redeploya en otra
   cuenta/nombre, cambiar solo esta línea. */
const API_URL = (location.hostname==="localhost"||location.hostname==="127.0.0.1") ? "http://localhost:8787" : "https://mayor-stock-api.juanbautistacrespialomar.workers.dev";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* ---------- Estado local ---------- */
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw) return migrate(JSON.parse(raw));
  }catch(e){ console.warn("load fail", e); }
  return migrate({ config:{ moneda:"$" }, productos:[], compras:[], ventas:[], movimientos:[] });
}
/* Migración idempotente: completa campos nuevos sin romper datos viejos.
   - Costos desglosados: el costo total histórico (ultimoCosto) pasa a ser Neto
     (handling/flete arrancan en 0). El total sigue siendo ultimoCosto.
   - Jerarquía TCG (metadata, sin conversión de stock): categoría/nivel/factores.
   - Clientes y numeración US (arranca en 101). */
/* Feature flag: columna "Target product" (mapeo manual de SKU) en el editor de factura.
   Hoy la ocultamos visualmente. El <select> sigue existiendo en el DOM y funcionando,
   así que la auto-detección por SKU/nombre no cambia en nada. Para reactivar el
   mapeo manual el día de mañana: poné esto en true. Nada más. */
const SHOW_TARGET_PRODUCT_COL = false;
const PACKS_POR_BOX_DEF = 24;
const BOXES_POR_CASE = { "Pokémon TCG":6, "Magic":6, "One Piece TCG":12, "Yu-Gi-Oh!":12, "Disney Lorcana":4, "Digimon":12, "Dragon Ball":12, "Flesh and Blood":4 };
function boxesCaseDefault(cat){ return BOXES_POR_CASE[cat] || 6; }
function migrate(d){
  d.config = d.config || {};
  if(d.config.moneda==null) d.config.moneda = "$";
  if(d.config.facturaInicio==null) d.config.facturaInicio = 101;   // numeración US
  if(d.config.emisor==null) d.config.emisor = { nombre:"", direccion:"", email:"", tel:"" };
  if(d.config.commissionRate==null) d.config.commissionRate = 0.10;  // tasa por defecto para vendedores nuevos (0.10 = 10%)
  // Vendedores: perfiles a los que se les atribuye la venta (y su comisión). NO son
  // sociedades: son las personas que venden. Cada uno tiene SU PROPIA tasa de comisión
  // (rate). Default Teo/Tonio; editable en Data → Sellers.
  if(!Array.isArray(d.config.vendedores) || !d.config.vendedores.length){
    d.config.vendedores = [ { id:"teo", nombre:"Teo", rate:d.config.commissionRate }, { id:"tonio", nombre:"Tonio", rate:d.config.commissionRate } ];
  }
  // Vendedores viejos sin tasa propia: heredan la global como punto de partida.
  d.config.vendedores.forEach(v=>{ if(v.rate==null) v.rate = d.config.commissionRate; });
  d.productos = d.productos || [];
  d.compras = d.compras || [];
  d.ventas = d.ventas || [];
  d.movimientos = d.movimientos || [];
  d.clientes = d.clientes || [];
  d.solicitudes = d.solicitudes || [];
  // Plan FP&A importado (versiones). Ver 06-fpa.js.
  if(!d.fpa || !Array.isArray(d.fpa.versions)) d.fpa = { versions:[], vigente:null };
  // Fotos de stock al cierre de cada mes (ver 05-metrics.js)
  if(!d.stockSnaps || typeof d.stockSnaps!=="object") d.stockSnaps = {};   // approval requests for blocked items (point 5, MVP2)
  // Invoices de COMPRA: estado de envío que AHORA gobierna el stock. Las compras
  // que ya existían impactaron el inventario en su momento, así que se migran como
  // "received" (si las pusiéramos en tránsito, vaciaríamos el stock actual). Sólo
  // las compras nuevas nacerán "in_transit" y no suman hasta marcarse recibidas.
  d.compras.forEach(c=>{ if(c.status==null) c.status = INVOICE_STATUS.RECEIVED; });
  // Ventas: snapshot de la tasa de comisión vigente al momento de la venta, para
  // que un cambio futuro de tasa no reescriba comisiones ya devengadas.
  d.ventas.forEach(v=>{
    if(v.commissionRate==null) v.commissionRate = d.config.commissionRate;
    // Vendedor de la venta (para comisión y columna "Sold by"). Las ventas viejas no
    // lo tienen: quedan como null y se muestran como "—" (sin vendedor atribuido).
    if(v.vendedorId===undefined) v.vendedorId = null;
    if(v.vendedor===undefined)   v.vendedor   = null;
    // storeVenta: las ventas viejas nacieron atadas a UNA sociedad (v.store). Lo
    // conservamos SÓLO como fallback para revertir su consumo FIFO si se editan/borran.
    // Las ventas nuevas ya no eligen sociedad (consumo global), así que no lo usan.
    if(v.storeVenta===undefined) v.storeVenta = v.store || null;
  });
  const r2 = n => Math.round((n||0)*100)/100;
  const DEF_STORE = STORE_IDS[0];   // "akira": target for legacy (store-less) stock
  d.productos.forEach(p=>{
    if(p.costoNeto==null){ p.costoNeto = p.ultimoCosto||0; p.costoHandling = 0; p.costoFlete = 0; }
    // total = neto+handling+flete; ultimoCosto stays as the canonical landed TOTAL (last purchase ref)
    if(p.ultimoCosto==null) p.ultimoCosto = r2((p.costoNeto||0)+(p.costoHandling||0)+(p.costoFlete||0));
    if(p.categoria==null) p.categoria = "";
    if(p.nivel==null) p.nivel = "unidad";
    if(p.packsPorBox==null) p.packsPorBox = PACKS_POR_BOX_DEF;
    if(p.boxesPorCase==null) p.boxesPorCase = boxesCaseDefault(p.categoria);

    // --- NEW: special state + language (points 5 & 10) ---
    if(p.estado==null) p.estado = PRODUCT_STATES.SALE;   // sale | blocked | investment
    if(p.idioma==null) p.idioma = "";                    // JP | ESP | KOR | EN

    // --- NEW: per-store stock + FIFO cost layers (points 1 & 3) ---
    if(p.stockPorTienda==null){
      p.stockPorTienda = {};
      STORE_IDS.forEach(s=> p.stockPorTienda[s] = 0);
      // legacy single stock -> assign to the default store
      p.stockPorTienda[DEF_STORE] = p.stock||0;
    } else {
      STORE_IDS.forEach(s=>{ if(p.stockPorTienda[s]==null) p.stockPorTienda[s]=0; });
    }
    if(p.lotes==null){
      p.lotes = {};
      STORE_IDS.forEach(s=> p.lotes[s] = []);
      // seed one FIFO layer for pre-existing positive stock, at the known landed cost
      const seed = p.stockPorTienda[DEF_STORE];
      if(seed>0) p.lotes[DEF_STORE].push({ id:uid(), fecha:new Date().toISOString(), cantidad:seed, costoUnit:(p.ultimoCosto||0), ref:"opening balance" });
    } else {
      STORE_IDS.forEach(s=>{ if(!Array.isArray(p.lotes[s])) p.lotes[s]=[]; });
    }
    // --- Investment vault bucket (points 2 & 4) ---
    if(p.stockPorTienda[INV_STORE]==null) p.stockPorTienda[INV_STORE]=0;
    if(!Array.isArray(p.lotes[INV_STORE])) p.lotes[INV_STORE]=[];
    // Legacy migration: products flagged estado==="investment" used to hold their
    // WHOLE stock as an investment. Move every store's units + FIFO layers into the
    // vault bucket (value preserved) and clear the flag. Idempotent: once the flag
    // is gone it won't run again. No kardex is fabricated for these legacy holds.
    if(p.estado===PRODUCT_STATES.INVESTMENT){
      STORE_IDS.forEach(s=>{
        (p.lotes[s]||[]).forEach(L=> p.lotes[INV_STORE].push({ id:uid(), fecha:L.fecha||new Date().toISOString(), cantidad:L.cantidad, costoUnit:L.costoUnit, ref:"legacy hold · "+storeName(s) }));
        p.lotes[s] = [];
        p.stockPorTienda[INV_STORE] = r2((p.stockPorTienda[INV_STORE]||0) + (p.stockPorTienda[s]||0));
        p.stockPorTienda[s] = 0;
      });
      p.estado = PRODUCT_STATES.SALE;
    }
    // per-store sale price (point 4: detect who marks the same product up)
    if(p.precioVentaPorTienda==null){
      p.precioVentaPorTienda = {};
      STORE_IDS.forEach(s=> p.precioVentaPorTienda[s] = p.precioVenta||0);
    } else {
      STORE_IDS.forEach(s=>{ if(p.precioVentaPorTienda[s]==null) p.precioVentaPorTienda[s]=(p.precioVenta||0); });
    }
    // keep p.stock as a DERIVED mirror (sum across stores) for backward-compat views
    p.stock = STORE_IDS.reduce((a,s)=> a + (p.stockPorTienda[s]||0), 0);
  });
  // Idioma English (una sola vez): todo producto que no tenía idioma pasa a EN.
  // Con la marca en config no se repite: si después alguien deja un producto en "—"
  // (ej. un accesorio sin idioma), no se lo volvemos a pisar. Las ventas toman el
  // idioma del producto al consultar, así que el histórico se reclasifica solo.
  if(!d.config.idiomaEnV1){
    (d.productos||[]).forEach(p=>{ if(!p.idioma) p.idioma = "EN"; });
    d.config.idiomaEnV1 = true;
  }
  d.clientes.forEach(c=>{ if(c.pais==null) c.pais = ""; });   // country of buyer (point 7 slicer)
  // País canónico (07-paises.js): "USA", "usa", "EEUU" → "United States". También en la foto
  // del cliente guardada en cada venta, así el slicer de país de Análisis no los separa.
  // Idempotente: lo que ya es canónico o no se reconoce queda igual.
  // Mayúsculas prolijas en la ficha de clientes (una sola vez), con la misma regla
  // del formulario (smartCase): sólo se corrige lo que está TODO en minúscula
  // ("jimmy lam" → "Jimmy Lam"); lo que ya tiene mayúsculas se respeta tal cual
  // ("DMT HOBBIES LLC", "Dat x n"). Las facturas ya emitidas NO se tocan: guardan
  // la foto del cliente tal como se facturó.
  if(!d.config.clientesCaseV1 && typeof smartCase==="function"){
    const CASING = { nombre:"name", contacto:"name", empresa:"name", direccion:"name", ciudad:"name", estado:"state", zip:"upper", email:"email" };
    d.clientes.forEach(c=> Object.entries(CASING).forEach(([k,kind])=>{ if(c[k]) c[k] = smartCase(c[k], kind); }));
    d.config.clientesCaseV1 = true;
  }
  if(typeof paisCanon==="function"){
    d.clientes.forEach(c=>{ if(c.pais) c.pais = paisCanon(c.pais); });
    (d.ventas||[]).forEach(v=>{ if(v.cliente && v.cliente.pais) v.cliente.pais = paisCanon(v.cliente.pais); });
  }
  // Punto 11: normalizar fechas viejas mezcladas (ISO vs "01-Jul-2026") a YYYY-MM-DD
  [...(d.compras||[]), ...(d.ventas||[])].forEach(doc=>{ if(doc.fecha) doc.fecha = normISO(doc.fecha) || doc.fecha; });
  return d;
}
/* ---- per-store helpers ---- */
function stockDe(p, store){ return (p.stockPorTienda && p.stockPorTienda[store]) || 0; }
/* Puntos 7/9/15: ¿este producto PERTENECE a este local?
   Sí cuando: tiene stock ahí, tiene capas FIFO ahí, o alguna vez tuvo
   una compra/venta en ese local. Un producto que sólo vive en Silver NO
   debe aparecer (ni en cero, ni como opción de venta) cuando mirás Akira. */
function perteneceAStore(p, store){
  if(stockDe(p, store) !== 0) return true;
  if(p.lotes && Array.isArray(p.lotes[store]) && p.lotes[store].length) return true;
  const docs = (db.compras||[]).concat(db.ventas||[]);
  return docs.some(d => d.store===store && (d.lineas||[]).some(l=>l.productoId===p.id));
}
function stockEnFoco(p){ return effectiveStores().reduce((a,s)=> a + stockDe(p,s), 0); }
/* ¿Este producto está dentro del foco de local actual?
   - En "All (consolidated)" mostramos todo.
   - En un local puntual, sólo los que PERTENECEN a alguno de los locales en foco.
   Misma regla que el maestro (perteneceAStore) para que dashboard y lista coincidan. */
function enFocoActual(p){
  if(activeStore==="all" || !viewUsesSociety()) return true;
  return effectiveStores().some(s=> perteneceAStore(p, s));
}

/* ============================================================
   STOCK EN TRÁNSITO (compras aún no recibidas)
   ------------------------------------------------------------
   Es DERIVADO de db.compras con status "in_transit": no hay campo
   nuevo en el producto, así que nunca se desincroniza. La mercadería
   en tránsito NO está en stockPorTienda ni en las capas FIFO, por eso
   no se puede vender ni cuenta en la valuación vendible. Se recibe
   (marca "received") y recién ahí entra al inventario.
   ============================================================ */
function transitoDe(p, store){
  let u = 0;
  (db.compras||[]).forEach(c=>{
    if(c.status!==INVOICE_STATUS.IN_TRANSIT) return;
    if((c.store||STORE_IDS[0])!==store) return;
    (c.lineas||[]).forEach(l=>{ if(l.productoId===p.id) u += (l.cantidad||0); });
  });
  return u;
}
function transitoValorDe(p, store){
  let v = 0;
  (db.compras||[]).forEach(c=>{
    if(c.status!==INVOICE_STATUS.IN_TRANSIT) return;
    if((c.store||STORE_IDS[0])!==store) return;
    (c.lineas||[]).forEach(l=>{ if(l.productoId===p.id){ const landed=(l.costoTotal!=null)?l.costoTotal:(l.precio||0); v += (l.cantidad||0)*landed; } });
  });
  return round2(v);
}
function transitoEnFoco(p){ return effectiveStores().reduce((a,s)=> a + transitoDe(p,s), 0); }
function transitoValorEnFoco(p){ return round2(effectiveStores().reduce((a,s)=> a + transitoValorDe(p,s), 0)); }
/* Total de unidades en tránsito bajo el foco actual (para el KPI del panel). */
function unidadesEnTransito(){ return productosVendibles().reduce((a,p)=> a + transitoEnFoco(p), 0); }

/* ============================================================
   Punto 2/3: vista de stock en UNIDADES o CASES
   ------------------------------------------------------------
   unitsPerCase(p): cuántas unidades de stock entran en un case de ESE
   producto. Reusamos boxesPorCase (que ya trae defaults por categoría,
   Pokémon=6, etc.) porque la unidad de stock de Juan es el box y el case
   trae N boxes. Es editable por producto en el formulario.
   ============================================================ */
let stockView = "units";   // "units" | "cases"  (toggle global de la barra superior)
function unitsPerCase(p){ const u = (p && (p.boxesPorCase)) || boxesCaseDefault(p&&p.categoria); return u>0 ? u : 1; }
/* Convierte una cantidad de unidades a la vista activa. En cases mostramos
   hasta 2 decimales (un case parcial es 6,5 y no "6"); si da entero, entero. */
function stockDisplay(p, units){
  if(stockView!=="cases") return qty(units);
  const cases = units / unitsPerCase(p);
  return nf0.format(Math.round(cases*100)/100);
}
/* Sufijo textual para encabezados/celdas según la vista. */
function stockUnitWord(){ return stockView==="cases" ? "cases" : "units"; }

/* ============================================================
   Punto 4: comisión del vendedor = MARGEN de la venta × tasa
   ------------------------------------------------------------
   El margen se toma sobre productos (precio − COGS FIFO), sin envío.
   La tasa se congela por venta (doc.commissionRate); si falta, cae a la
   tasa global vigente. TODO el consumo de estos valores va detrás de
   isAdmin() en la UI: un seller no ve la comisión bajo ningún caso.
   ============================================================ */
function saleRevenueProd(d){ return round2((d.lineas||[]).reduce((a,l)=> a + (l.cantidad||0)*(l.precio||0), 0)); }
function saleCogs(d){
  return round2((d.lineas||[]).reduce((a,l)=>{
    if(l.cogs!=null) return a + l.cogs;
    const c = (l.costo!=null) ? l.costo : ((prodById(l.productoId)||{}).ultimoCosto||0);
    return a + (l.cantidad||0)*c;
  }, 0));
}
function saleMargin(d){ return round2(saleRevenueProd(d) - saleCogs(d)); }
/* ---- Costos de venta (portado de stockselect) ----
   Gastos propios de UNA venta que achican su margen (no el costo del stock):
   envío/ShipStation, horas hombre (horas × valor hora), comisión de venta manual
   (distinta del % del vendedor) y otro. Sólo admin. NUNCA salen en la factura.
   Margen NETO = margen FIFO − comisión del vendedor (%) − estos costos.
   App USD-only: sin columna de moneda (en stockselect cada costo tiene la suya). */
const COSTO_TIPOS = [ { id:"envio" }, { id:"labor" }, { id:"comision" }, { id:"otro" } ];
function costoTipoLabel(id){ return COSTO_TIPOS.some(x=>x.id===id) ? t("md.costo."+id) : t("md.costo.otro"); }
/* Cargos on-top (portado de stockselect): montos que se le FACTURAN al cliente aparte del
   producto y del envío (flete intl, fee bancario, servicio…). Suman al total de la venta y al
   ingreso neto del P&L; no tienen costo de mercadería. Salen en la factura con su concepto. */
function saleCargosCliente(d){ return round2(((d&&d.cargosCliente)||[]).reduce((a,c)=> a + (+c.monto||0), 0)); }
function saleCostosExtra(d){ return round2(((d&&d.costosExtra)||[]).reduce((a,c)=> a + (+c.monto||0), 0)); }
function saleCommissionRate(d){ return (d && d.commissionRate!=null) ? d.commissionRate : (db.config.commissionRate||0); }
function saleCommission(d){ return round2(saleMargin(d) * saleCommissionRate(d)); }
/* Margen neto de UNA venta = su contribución, con el mismo criterio que el P&L:
   margen de productos + envío cobrado + cargos on-top − comisión − costos de venta. */
function saleEnvioCobrado(d){ return (d && d.envio && d.envio.tipo==="monto") ? round2(+d.envio.monto||0) : 0; }
function saleNetMargin(d){ return round2(saleMargin(d) + saleEnvioCobrado(d) + saleCargosCliente(d) - saleCommission(d) - saleCostosExtra(d)); }
/* ---- Vendedores (perfiles a los que se atribuye la venta) ---- */
function vendedores(){ return (db.config && Array.isArray(db.config.vendedores)) ? db.config.vendedores : []; }
function vendedorById(id){ if(!id) return null; return vendedores().find(v=>v.id===id) || null; }
function vendedorNombre(id){ const v=vendedorById(id); return v ? v.nombre : (id||"—"); }
/* Tasa de comisión propia de un vendedor (cada uno la suya). Si el vendedor no
   existe o no tiene tasa, cae a la global como último recurso. */
function vendedorRate(id){ const v=vendedorById(id); return (v && v.rate!=null) ? v.rate : (db.config.commissionRate||0); }
/* Vendedor de la sesión actual (si el que entró es un seller). El admin no está
   atado a un vendedor: elige a nombre de quién carga la venta. */
function currentVendedorId(){ return (session && session.vendedorId) || null; }
/* Nombre a mostrar en "Sold by" para una venta ya guardada. */
function saleVendedorNombre(d){
  if(d && d.vendedorId) return vendedorNombre(d.vendedorId);
  if(d && d.vendedor)   return d.vendedor;   // snapshot histórico
  return "—";
}
function stockTotalP(p){ return STORE_IDS.reduce((a,s)=> a + stockDe(p,s), 0); }   // sellable only, excludes __inv
function recalcStockMirror(p){ p.stock = stockTotalP(p); }

/* ---- Investment vault helpers (quantity-based, points 2 & 4) ---- */
function invUnits(p){ return stockDe(p, INV_STORE); }                 // units held in the vault
function invLayers(p){ return fifoLayers(p, INV_STORE); }             // FIFO cost layers in the vault
function invValor(p){ return round2(invLayers(p).reduce((a,L)=> a + L.cantidad*L.costoUnit, 0)); }
/* A product "has an investment position" if it holds units in the vault.
   NOTE: this is now a *quantity* condition, not the old product-level flag —
   a product can be partly sellable and partly held. */
function esInversion(p){ return invUnits(p) > 0; }
/* Fully held: something is in the vault AND has no sellable units left.
   These (and only these) are hidden from selling/reorder views. */
function soloEnVault(p){ return invUnits(p) > 0 && stockTotalP(p) === 0; }
function esBloqueado(p){ return p.estado===PRODUCT_STATES.BLOCKED; }
/* products visible for normal SELLING views: hides only the fully-held items,
   and (for sellers) is later intersected with their store's stock. */
function productosVendibles(){ return db.productos.filter(p=> !soloEnVault(p)); }
let db = load();
function persistLocal(){ localStorage.setItem(KEY, JSON.stringify(db)); }

/* ---------- Sesión ---------- */
let session = loadSession();
function loadSession(){ try{ const r=localStorage.getItem(SESKEY); if(r) return JSON.parse(r); }catch(e){} return null; }
function saveSession(){ if(session) localStorage.setItem(SESKEY, JSON.stringify(session)); else localStorage.removeItem(SESKEY); }

/* ---------- Sincronización con el servidor ---------- */
let syncMeta = loadSyncMeta();       // { syncedRev, dirty }
let syncState = session ? "idle" : "off";
let pushTimer = null;
let conflictPayload = null;

function loadSyncMeta(){ try{ const r=localStorage.getItem(SKEY); if(r) return JSON.parse(r); }catch(e){} return { syncedRev:0, dirty:false }; }
function saveSyncMeta(){ localStorage.setItem(SKEY, JSON.stringify(syncMeta)); }

let editSeq = 0;   // v95: cuenta ediciones locales (para no pisar cambios hechos mientras se sincroniza)
function save(){
  editSeq++;
  persistLocal();
  if(session){ syncMeta.dirty=true; saveSyncMeta(); schedulePush(); }
}

function setSyncState(s){ syncState=s; paintSync(); }
function apiBase(){ return API_URL.replace(/\/+$/,""); }
/* Errores del Worker -> texto traducido. El Worker responde en inglés fijo
   ({error, detalle|detail}); acá se mapea por el texto exacto, así no hace falta
   redeployar el backend. Si aparece un error desconocido se muestra tal cual. */
const SRV_ERR = {
  "use POST":"srv.usepost", "invalid JSON":"srv.invalidjson", "wrong user or password":"srv.wronglogin",
  "not authorized":"srv.notauth", "forbidden":"srv.forbidden", "missing user":"srv.missinguser",
  "new user needs a password":"srv.newuserpass", "can't delete the user you're logged in as":"srv.delself",
  "method not supported":"srv.method", "missing 'pdf'":"srv.missingpdf", "gemini error":"srv.gemini",
  "route not found":"srv.route", "missing 'data'":"srv.missingdata", "server exception":"srv.exception"
};
/* v95: el Worker nuevo manda los mensajes ya traducidos ({es, en}). */
function msgLoc(o){ if(!o) return ""; return (typeof lang==="function" && lang()==="es") ? (o.es||o.en||"") : (o.en||o.es||""); }
function mostrarAvisosSrv(j){
  const l = (j && Array.isArray(j.avisos)) ? j.avisos : [];
  if(l.length) toast(l.map(msgLoc).filter(Boolean).join(" · "), "warn");
  if(j && j.avisoTamano && isAdmin() && !window._avisoTamanoOk){
    window._avisoTamanoOk = true;
    toast(msgLoc({ es:`La base está al ${j.avisoTamano}% de su capacidad: conviene planificar la reorganización de los datos.`,
                   en:`The database is at ${j.avisoTamano}% of its capacity: plan a data reorganization.` }), "warn");
  }
}
function srvErrText(j, status){
  if(j && (j.es || j.en)) return msgLoc(j);
  const e = j && j.error ? String(j.error) : "";
  const det = j && (j.detalle || j.detail) ? String(j.detalle || j.detail) : "";
  let msg;
  if(SRV_ERR[e]) msg = t(SRV_ERR[e]);
  else if(/^config:\s*/i.test(e)) msg = t("srv.config",{what:e.replace(/^config:\s*/i,"")});
  else msg = e || (j && j.raw) || ("HTTP "+status);
  return det ? msg+" — "+det : msg;
}
/* v108 · Sesión por COOKIE HttpOnly (el token ya no vive en localStorage).
   Queda en false hasta que la app y el Worker estén en el MISMO dominio
   (p. ej. app.tudominio.com + api.tudominio.com). En false todo sigue como
   siempre (header Bearer). Con true, cada pedido manda la cookie y el token
   ni siquiera llega a JavaScript. Ver README → "Sesión por cookie". */
const API_COOKIE = false;
function apiFetch(url, opts){
  opts = opts || {};
  if(API_COOKIE || (session && session.cookie)) opts = { ...opts, credentials:"include" };
  return fetch(url, opts);
}
function authHeaders(){
  const h = { "Content-Type":"application/json" };
  if(session && session.token) h["Authorization"] = "Bearer "+session.token;   // en modo cookie no hay token
  return h;
}
function stateUrl(){ return apiBase()+"/state?space="+encodeURIComponent(session?session.space:"main"); }

function schedulePush(){ if(!session) return; clearTimeout(pushTimer); pushTimer=setTimeout(()=>pushNow(), 800); }

async function pushNow(force=false){
  if(!session) return;
  setSyncState("saving");
  const seq = editSeq;   // si el usuario edita mientras viaja el pedido, no pisamos esos cambios
  try{
    const res=await apiFetch(stateUrl(),{ method:"PUT", headers:authHeaders(), body:JSON.stringify({ data:db, baseRev:syncMeta.syncedRev, force }) });
    if(res.status===401){ toast(t("core.tt.expired"),"warn"); forceLogout(); return; }
    if(res.status===409){ conflictPayload=await res.json(); setSyncState("conflict"); toast(t("core.tt.newer"),"warn"); if(view==="datos") render(); return; }
    // v95: borrado masivo frenado por el servidor -> se resuelve como un conflicto (Datos)
    if(res.status===422){ const j=await res.json(); conflictPayload=j; setSyncState("conflict"); toast(srvErrText(j,422),"warn"); if(view==="datos") render(); return; }
    if([400,403,413,503].includes(res.status)){ let j={}; try{ j=await res.json(); }catch(_){} toast(srvErrText(j,res.status),"warn"); setSyncState("offline"); return; }
    if(!res.ok) throw new Error("HTTP "+res.status);
    const j=await res.json();
    mostrarAvisosSrv(j);
    if(j.data){
      // v95: el servidor devolvió la versión final (vendedor: su venta ya calculada por el
      // servidor; admin: ventas de vendedores rescatadas). Tomamos ésa como la verdad.
      if(editSeq===seq){
        db=migrate(j.data); persistLocal();
        syncMeta.syncedRev=j.rev; syncMeta.dirty=false; saveSyncMeta();
        setSyncState("idle"); render(); return;
      }
      // Hubo cambios locales durante el viaje: el vendedor reintenta (el servidor combina);
      // el admin no adelanta la versión, así el próximo envío cae en "conflicto" y decide.
      if(isSeller()){ syncMeta.syncedRev=j.rev; saveSyncMeta(); }
      setSyncState("idle"); schedulePush(); return;
    }
    syncMeta.syncedRev=j.rev; if(editSeq===seq) syncMeta.dirty=false; saveSyncMeta();
    setSyncState("idle");
  }catch(e){ console.warn("push fail", e); setSyncState("offline"); }
}

async function pullNow(){
  if(!session) return;
  setSyncState("saving");
  try{
    const res=await apiFetch(stateUrl(),{ method:"GET", headers:authHeaders() });
    if(res.status===401){ toast(t("core.tt.expired"),"warn"); forceLogout(); return; }
    if(!res.ok) throw new Error("HTTP "+res.status);
    const j=await res.json();
    const serverRev=j.rev||0;
    if(!j.data){ if(hasData(db)) await pushNow(true); else { syncMeta.syncedRev=0; saveSyncMeta(); setSyncState("idle"); } return; }
    if(serverRev===syncMeta.syncedRev && !syncMeta.dirty){ setSyncState("idle"); return; }
    if(serverRev!==syncMeta.syncedRev && !syncMeta.dirty){   // v95: "!==" (tras restaurar un backup la versión del servidor puede ser MENOR)
      // migrate(): el estado del servidor puede venir de una versión vieja de la app
      db=migrate(j.data); syncMeta.syncedRev=serverRev; syncMeta.dirty=false; saveSyncMeta(); persistLocal();
      setSyncState("idle"); render(); toast(t("core.tt.updated")); return;
    }
    if(syncMeta.dirty && serverRev!==syncMeta.syncedRev){
      // v95: un vendedor no ve la pantalla de conflictos. Mandamos sus cambios y el
      // servidor los combina con la versión actual (sus ventas se suman, no se pisan).
      if(isSeller()){ await pushNow(); return; }
      conflictPayload=j; setSyncState("conflict"); if(view==="datos") render(); return;
    }
    if(syncMeta.dirty){ await pushNow(); return; }
    setSyncState("idle");
  }catch(e){ console.warn("pull fail", e); setSyncState("offline"); }
}

function hasData(d){ return (d.productos&&d.productos.length)||(d.compras&&d.compras.length)||(d.ventas&&d.ventas.length); }

function resolveConflict(keepLocal){
  if(!conflictPayload) return;
  // v95: NO adelantamos syncedRev: así el servidor sabe qué versión tenías y rescata
  // las ventas que cargaron los vendedores mientras tanto.
  if(keepLocal){ pushNow(true); }
  else{
    db=migrate(conflictPayload.data); syncMeta.syncedRev=conflictPayload.rev; syncMeta.dirty=false; saveSyncMeta(); persistLocal();
    render(); toast(t("core.tt.tookserver"));
  }
  conflictPayload=null; setSyncState("idle");
}

/* v97 · Estado de sincronización con ícono + texto (antes sólo "●" de color: WCAG 1.4.1).
   Estar offline en una app local-first NO es un error: va en ámbar y aclara que se guarda local.
   Los íconos son constantes propias (no datos del usuario), así que innerHTML es seguro;
   el texto va siempre como texto. El color lo pone el CSS según data-state. */
const SYNC_ICO = {
  off:     '<path d="M2 2l20 20"/><path d="M5.8 9.5A6 6 0 0 0 7 21h9.5"/><path d="M20.4 17.4A4.5 4.5 0 0 0 17.5 10h-1.3A7 7 0 0 0 9.2 5.3"/>',
  idle:    '<path d="M17.5 19H7a5 5 0 1 1 1.3-9.8A7 7 0 0 1 21 11.5a4 4 0 0 1-3.5 7.5z"/><path d="M9.5 14l2 2 3.5-3.5"/>',
  saving:  '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  offline: '<path d="M2 2l20 20"/><path d="M5.8 9.5A6 6 0 0 0 7 21h9.5"/><path d="M20.4 17.4A4.5 4.5 0 0 0 17.5 10h-1.3A7 7 0 0 0 9.2 5.3"/>',
  conflict:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
};
function paintSync(){
  const txtOf = {
    off:t("core.sync.off"), idle:t("core.sync.idle"), saving:t("core.sync.saving"),
    offline:t("core.sync.offline"), conflict:t("core.sync.conflict")
  };
  const st = txtOf[syncState] ? syncState : "off";
  const txt = txtOf[st];
  document.querySelectorAll("[data-syncchip]").forEach(el=>{
    el.style.color = "";                       // el color ahora sale del CSS
    el.dataset.state = st;
    el.setAttribute("role","status");          // lector de pantalla anuncia el cambio
    el.innerHTML = `<svg class="sc-ico${st==="saving"?" spin":""}" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYNC_ICO[st]}</svg>`;
    const sp=document.createElement("span"); sp.textContent=txt; el.appendChild(sp);
    // detalle tranquilizador sólo cuando está offline (en mobile se oculta por espacio; queda en el title)
    if(st==="offline"){ const sub=document.createElement("span"); sub.className="sc-sub"; sub.textContent=" · "+t("core.sync.offline.sub"); el.appendChild(sub); }
    el.title = st==="offline" ? txt+" · "+t("core.sync.offline.sub") : txt;
  });
  document.querySelectorAll("[data-syncicon]").forEach(el=>{
    el.dataset.state = st;
    el.style.color = "";
    el.classList.toggle("spin", st==="saving");
    el.title = t("tb.sync")+" · "+txt.toLowerCase();
  });
}

/* ---------- Login / Logout ---------- */
async function doLogin(){
  const user=(document.getElementById("loginUser").value||"").trim();
  const pass=document.getElementById("loginPass").value||"";
  const errEl=document.getElementById("loginErr");
  const btn=document.getElementById("loginBtn");
  errEl.textContent="";
  if(!user||!pass){ errEl.textContent=t("core.login.enter"); return; }
  btn.disabled=true; btn.textContent=t("core.login.signingin");
  try{
    const res=await apiFetch(apiBase()+"/login",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({user,pass}) });
    if(res.status===401){ errEl.textContent=t("core.login.wrong"); return; }
    if(!res.ok){
      let msg=t("core.login.error",{code:res.status});
      try{ const ej=await res.json(); if(ej.error||ej.detalle||ej.detail) msg=srvErrText(ej,res.status); }catch(_){}
      errEl.textContent=msg;
      return;
    }
    let j=await res.json();
    // v108 · 2FA: la contraseña estaba bien, pero falta el código del celular.
    if(j && j.need2fa){
      j = (typeof pedirCodigo2FA==="function") ? await pedirCodigo2FA(j.ticket) : null;
      if(!j){ document.getElementById("loginPass").value=""; return; }
    }
    let prevUser = session ? session.user : "";
    if(!prevUser){ try{ prevUser = localStorage.getItem(LASTUSERKEY) || ""; }catch(e){} }
    // v95: mismo usuario que volvió a entrar = conservar datos locales.
    // v108: salvo que la copia local sea la vista RECORTADA de vendedor y ahora entre como admin.
    const switching = prevUser !== j.user || (!!(db && db._vista) && j.role==="admin");
    try{ localStorage.setItem(LASTUSERKEY, j.user); }catch(e){}
    session={ user:j.user, space:j.space||"main", role:j.role||"admin", vendedorId:j.vendedorId||"", name:j.name||j.user }; 
    if(j.token) session.token=j.token; else if(j.cookie) session.cookie=true;   // v108: en modo cookie no hay token que guardar
    saveSession();
    // El stock es UNO SOLO: todos (admin y vendedores) arrancan en la vista
    // consolidada. Las sociedades son sólo procedencia, no locales de venta.
    activeStore = "all";
    if(view==="inv" && !isAdmin()) view="dash";
    // Si un vendedor entra a una vista admin-only (compras/inversión/análisis/datos), lo mandamos al panel.
    if(!isAdmin() && ADMIN_VIEWS.includes(view)) view="dash";
    if(switching){
      db={ config:{ moneda:(db.config&&db.config.moneda)||"$" }, productos:[], compras:[], ventas:[], movimientos:[], clientes:[], solicitudes:[] };
      persistLocal(); syncMeta={ syncedRev:0, dirty:false }; saveSyncMeta();
    }
    setSyncState("idle");
    hideLogin(); render(); paintSync();
    await pullNow();
    if(typeof finFreezeStockSnaps==="function" && syncState!=="conflict" && finFreezeStockSnaps()) render();
  }catch(e){ console.error("[login] fallo:", e); errEl.textContent=t("core.login.noreach",{msg:(e&&e.message||e)}); }
  finally{ btn.disabled=false; btn.textContent=t("core.login.signin"); }
}
function logout(){
  if(!confirm(t("core.login.logout"))) return;
  forceLogout();
}
/* Cierre forzado (token vencido / 401): sin confirmación, va derecho al login.
   Antes se llamaba a logout() acá y el confirm() aparecía sin que el usuario
   hubiera pedido salir; si cancelaba, quedaba con un token muerto reintentando. */
/* v95: recordamos quién era el último usuario. Si el servidor corta la sesión
   (p. ej. al cambiar el sistema de login) y vuelve a entrar LA MISMA persona,
   no se le borra la copia local: así no pierde ventas que no llegaron a subirse. */
const LASTUSERKEY = "gstock_lastuser";
function forceLogout(){
  try{ if(session && session.user) localStorage.setItem(LASTUSERKEY, session.user); }catch(e){}
  // v108: en modo cookie, el servidor es el único que puede borrarla (HttpOnly).
  if(session && session.cookie){ try{ apiFetch(apiBase()+"/logout",{ method:"POST", headers:{"Content-Type":"application/json"} }).catch(()=>{}); }catch(e){} }
  session=null; saveSession(); setSyncState("off");
  showLogin();
}
function showLogin(){
  const l=document.getElementById("login"); if(l) l.hidden=false;
  const a=document.querySelector(".app"); if(a) a.style.display="none";
  const u=document.getElementById("loginUser"); if(u){ u.value=""; setTimeout(()=>u.focus(),50); }
  const p=document.getElementById("loginPass"); if(p) p.value="";
}
function hideLogin(){
  const l=document.getElementById("login"); if(l) l.hidden=true;
  const a=document.querySelector(".app"); if(a) a.style.display="";
}

/* ---------- Formato ---------- */
/* Formato numérico según el idioma de la app: EN -> 1,234.56 · ES -> 1.234,56.
   Antes era siempre es-AR, mezclado con fechas MM/DD y UI en inglés: un vendedor
   de EE.UU. leía "US$ 1.234,56" como un dólar con veintitrés. parseNum() acepta
   ambos formatos, así que los inputs no se ven afectados. */
const _NF_CACHE = {};
function _nfFor(minD, maxD){
  const loc = (typeof lang==="function" && lang()==="en") ? "en-US" : "es-AR";
  const k = loc+"|"+minD+"|"+maxD;
  return _NF_CACHE[k] || (_NF_CACHE[k] = new Intl.NumberFormat(loc,{minimumFractionDigits:minD,maximumFractionDigits:maxD}));
}
const nf0 = { format: n => _nfFor(0,2).format(n) };
const nf2 = { format: n => _nfFor(2,2).format(n) };
/* Decimales fijos (para porcentajes y compactos: "32,1%" / "32.1%"). */
function nfDec(d){ return { format: n => _nfFor(d,d).format(n) }; }
const money = n => db.config.moneda + "\u00A0" + nf2.format(n||0);
const qty = n => nf0.format(n||0);
/* money() pero con guión cuando el valor es 0 / nulo. Lo usamos en precios de
   venta opcionales: si no hay precio cargado mostramos "—" en vez de "USD 0,00".
   El \u00A0 (espacio duro) ya deja el símbolo separado del número: "USD 92,10". */
const moneyOpt = (n, dash="—") => ((n||0) > 0 ? money(n) : dash);
/* Números GRANDES de las tarjetas KPI: redondeados, sin decimales ("USD 149.890").
   El importe exacto queda en el tooltip (title) para quien necesite los centavos.
   Las tablas y los detalles siguen con 2 decimales, para poder conciliar. */
/* v102 · "2026-09" -> "Septiembre 2026" / "September 2026" (sin el "de" que agrega Intl en español) */
function mesLargo(ym){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||"")); if(!m) return String(ym||"");
  const loc=(typeof lang==="function" && lang()==="en") ? "en-US" : "es-AR";
  const nom=new Date(+m[1], +m[2]-1, 1).toLocaleDateString(loc,{month:"long"});
  return nom.charAt(0).toUpperCase()+nom.slice(1)+" "+m[1];
}
const moneyRound = n => db.config.moneda + "\u00A0" + _nfFor(0,0).format(Math.round(n||0));
function bigMoney(n){ return `<span title="${money(n)}">${moneyRound(n)}</span>`; }

/* ---------- Fechas unificadas — FORMATO AMERICANO ----------
   normISO: cualquier fecha -> "YYYY-MM-DD" (lo único que acepta <input type="date">).
   Regla de la app: las fechas NUMÉRICAS se leen SIEMPRE como estadounidenses,
   MES/DÍA/AÑO. "07/01/2026" = 1 de julio, no 7 de enero. Antes se leían como
   día/mes, y una factura de un proveedor yanqui fechada 07/01 entraba en enero.
   Formatos aceptados:
     2026-07-01 / 2026-07-01T10:00  (ISO, con o sin hora)
     07/01/2026 · 7/1/26 · 07-01-2026 · 07.01.2026   (MM/DD/YYYY)
     Jul 1, 2026 · July 1 2026 · Jul-01-2026           (mes en texto primero)
     01-Jul-2026 · 1 Jul 2026                          (día y mes en texto)
   Si el número no es una fecha real (13/40/2026) devuelve "" en vez de inventar. */
const _MONTHS3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _MON_MAP = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,ene:1,abr:4,ago:8,set:9,dic:12};
function _isoOk(y, mo, d){
  y=+y; mo=+mo; d=+d;
  if(!(mo>=1 && mo<=12 && d>=1)) return "";
  if(d > new Date(y, mo, 0).getDate()) return "";      // 02/30 no existe
  return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function _yy(y){ y=String(y); return y.length===2 ? "20"+y : y; }
function normISO(s){
  if(!s) return "";
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                               // ISO
  if(m) return _isoOk(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);                      // MM/DD/YYYY (americano)
  if(m) return _isoOk(_yy(m[3]), m[1], m[2]);
  m = s.match(/^([A-Za-z]{3,})\.?[\s\-\/]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-\/]+(\d{2,4})$/);   // Jul 1, 2026
  if(m){ const mo=_MON_MAP[m[1].slice(0,3).toLowerCase()]; return mo ? _isoOk(_yy(m[3]), mo, m[2]) : ""; }
  m = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})\.?[\s\-\/,]+(\d{2,4})$/);             // 01-Jul-2026
  if(m){ const mo=_MON_MAP[m[2].slice(0,3).toLowerCase()]; return mo ? _isoOk(_yy(m[3]), mo, m[1]) : ""; }
  return "";
}
/* Formato de display según el idioma de la app:
     ES → DD/MM/YYYY (argentino)   ·   EN → MM/DD/YYYY (americano)
   OJO: esto es sólo para MOSTRAR. Lo guardado es siempre ISO (YYYY-MM-DD) y el
   parser normISO() sigue leyendo fechas numéricas de documentos como americanas
   (las facturas de proveedores de EE.UU. vienen así). */
function fmtDate(s){
  const iso = normISO(s);
  if(!iso) return s || "—";
  const [y,mo,d] = iso.split("-");
  return (typeof lang==="function" && lang()==="es") ? `${d}/${mo}/${y}` : `${mo}/${d}/${y}`;
}
/* Siempre americano, sin importar el idioma: lo usa el PDF de venta/remito,
   que por regla va en inglés. */
function fmtDateUS(s){
  const iso = normISO(s);
  if(!iso) return s || "—";
  const [y,mo,d] = iso.split("-");
  return `${mo}/${d}/${y}`;
}
/* Date → "YYYY-MM-DD" en hora LOCAL (toISOString() usa UTC y a la noche te corre el día). */
function isoLocal(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* Hora 24 h "HH:MM" (igual en los dos idiomas). */
function fmtHora(d){ return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }

/* Parseo tolerante de números en formato AR (1.234,56) o US (1,234.56) */
function parseNum(s){
  if(typeof s === "number") return s;
  if(!s) return 0;
  let t = String(s).trim().replace(/[^\d.,\-]/g,"");
  if(t==="") return 0;
  const lastComma = t.lastIndexOf(","), lastDot = t.lastIndexOf(".");
  if(lastComma > lastDot){            // coma decimal (AR)
    t = t.replace(/\./g,"").replace(",",".");
  } else {                            // punto decimal (US)
    t = t.replace(/,/g,"");
  }
  const v = parseFloat(t);
  return isNaN(v) ? 0 : v;
}

/* ---------- Toast ---------- */
function toast(msg, kind="up"){
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(8px)"; }, 2600);
  setTimeout(()=> el.remove(), 3000);
}

/* ---------- Helpers de stock ---------- */
function prodById(id){ return db.productos.find(p=>p.id===id); }
function clienteById(id){ return db.clientes.find(c=>c.id===id); }
function clienteLinea(c){ return c ? (c.empresa ? `${c.nombre} · ${c.empresa}` : c.nombre) : ""; }
function clienteDireccion(c){
  if(!c) return "";
  return [c.direccion, [c.ciudad, c.estado, c.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}
function findProdBySku(sku){
  if(!sku) return null;
  const s = sku.trim().toLowerCase();
  return db.productos.find(p => (p.sku||"").trim().toLowerCase() === s) || null;
}
/* ¿Ese SKU ya lo usa OTRO producto? Devuelve el producto en conflicto o null.
   - SKU vacío nunca colisiona (muchos productos pueden no tener código).
   - exceptId permite editar un producto sin chocar consigo mismo.
   Evita SKUs repetidos, que romperían findProdBySku al importar facturas
   (engancharía la compra al producto equivocado). */
function skuEnUso(sku, exceptId){
  const s = (sku||"").trim().toLowerCase();
  if(!s) return null;
  return db.productos.find(p => p.id!==exceptId && (p.sku||"").trim().toLowerCase()===s) || null;
}
/* FIFO valuation of the sellable stock in the stores currently in focus.
   Sums the actual cost layers, not stock×lastcost. Excludes the vault. */
function valorFifoEnFoco(p){
  return effectiveStores().reduce((a,s)=> a + fifoLayers(p,s).reduce((x,L)=>x+L.cantidad*L.costoUnit,0), 0);
}
function valorizacion(){
  return productosVendibles().reduce((a,p)=> a + valorFifoEnFoco(p), 0);
}
function unidadesTotales(){ return productosVendibles().reduce((a,p)=> a + stockEnFoco(p), 0); }
/* Reposición sobre el POOL ÚNICO: el stock es uno solo, así que las alertas de
   "sin stock" / "bajo mínimo" miran el total vendible cruzando TODAS las sociedades,
   no el foco de tienda. Un producto agotado en Akira pero con stock en Silver NO
   alerta: se despacha del pool común (FIFO cruza sociedades). */
function bajoStock(p){ const s=stockTotalP(p); return p.puntoRepedido>0 && s>0 && s <= p.puntoRepedido; }
function sinStock(p){ return stockTotalP(p) <= 0; }
function necesitaPedido(p){ return !soloEnVault(p) && (sinStock(p) || bajoStock(p)); }

/* ============================================================
   Numeración CORRELATIVA de facturas de VENTA
   Formato: "FC 0001-0000001". Tomamos el mayor secuencial ya usado
   en db.ventas (parseando el patrón) y devolvemos el siguiente, sin
   huecos. Las compras siguen con N° libre (traen el del proveedor).
   ------------------------------------------------------------
   OJO: si borrás una venta que NO es la última, queda un hueco en la
   serie (comportamiento correcto: en la práctica se anula con nota de
   crédito, no se borra). Si borrás la última, ese número se reutiliza.
   ============================================================ */
/* Formato estadounidense: entero simple, sin punto de venta. Arranca en
   config.facturaInicio (101 por defecto) y toma el mayor ya usado + 1.
   Es SUGERIDO: el campo es editable en el modal de venta. */
function nextFacturaVenta(){
  const inicio = parseInt(db.config.facturaInicio,10) || 101;
  let max = inicio - 1;
  (db.ventas||[]).forEach(v=>{
    const n = parseInt(String(v.numero||"").replace(/[^\d]/g,""),10);
    if(!isNaN(n) && n>max) max=n;
  });
  return String(max+1);
}

/* ============================================================
   Banner de reposición: memoria de descarte por CONJUNTO
   El banner se muestra una sola vez y se queda hasta que lo tocás.
   Guardamos la "firma" (los IDs de todo lo que hay que reponer, ordenados).
   Si el conjunto cambia —entra o sale CUALQUIER producto, aunque la
   cantidad total sea la misma— la firma cambia y el banner vuelve a
   aparecer. Cuando ya no hay nada que reponer, limpiamos la memoria para
   que el próximo alerta (aun con los mismos productos) se muestre fresco.
   Es preferencia LOCAL del dispositivo: no se sincroniza ni ensucia el rev.
   ============================================================ */
const ALERTKEY = "gstock_alert_dismissed";
function firmaReposicion(){
  return productosVendibles().filter(enFocoActual).filter(necesitaPedido).map(p=>p.id).sort().join("|");
}
function alertaDescartada(firma){
  try{ return localStorage.getItem(ALERTKEY) === firma; }catch(e){ return false; }
}
function descartarAlerta(firma){
  try{ localStorage.setItem(ALERTKEY, firma); }catch(e){}
}
function limpiarMemoriaAlerta(){
  try{ localStorage.removeItem(ALERTKEY); }catch(e){}
}

/* Registrar movimiento. opts (opcional): { tipo, obs, fecha } */
/* moverStock: registers a kardex movement AND updates per-store stock.
   `store` is required now; movements carry the store dimension. */
function moverStock(prod, delta, valorUnit, refTipo, refId, ref, opts){
  opts = opts || {};
  const store = opts.store || STORE_IDS[0];
  if(!prod.stockPorTienda) prod.stockPorTienda = {};
  prod.stockPorTienda[store] = +(( (prod.stockPorTienda[store]||0) + delta )).toFixed(4);
  recalcStockMirror(prod);
  db.movimientos.push({
    id: uid(), fecha: opts.fecha || new Date().toISOString(),
    tipo: opts.tipo || (delta>=0 ? "entrada" : "salida"),
    productoId: prod.id, sku:prod.sku, nombre:prod.nombre, store,
    cantidad: Math.abs(delta), delta: delta, valorUnit, refTipo, refId, ref,
    obs: opts.obs || ""
  });
}


/* ---- Acciones de fila (mismo patrón que stockselect, item 8) ----
   iconBtn(): botón SOLO ícono, con title + aria-label (tooltip y accesibilidad).
   rowOverflow(primaryHTML, restHTML): UN botón primario visible y el resto detrás de un "⋯".
   Los botones del menú son LOS MISMOS (con sus data-*), sólo reubicados: el wireo
   post-render los sigue encontrando, así que no se rompe ningún handler. */
function iconBtn(attrs, icon, label, danger){
  return `<button type="button" class="btn ghost sm icon-only${danger?" danger-ghost":""}" ${attrs} title="${label}" aria-label="${label}">${icon}</button>`;
}
function menuBtn(attrs, icon, label, danger){
  return `<button type="button" class="btn ghost sm${danger?" danger-ghost":""}" ${attrs}>${icon}${label}</button>`;
}
function rowOverflow(primaryHTML, restHTML){
  if(!restHTML) return primaryHTML||"";
  primaryHTML = primaryHTML||"";   // "" = sin primario (la fila entera abre el detalle)
  const more = (typeof t==="function") ? t("common.more") : "More";
  return `<div class="rowacts">${primaryHTML}<div class="rowovf">`+
    `<button type="button" class="btn ghost sm ovf-toggle" data-ovf aria-haspopup="true" aria-expanded="false" title="${more}" aria-label="${more}">\u22ef</button>`+
    `<div class="ovf-menu" hidden>${restHTML}</div></div></div>`;
}
