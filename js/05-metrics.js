/* ============================================================
   gestordestock — 05-metrics.js
   CAPA SEMÁNTICA FINANCIERA (fuente única de números)
   ------------------------------------------------------------
   Antes, Análisis (ventasFiltradas) y P&L (pnlAggregate) repetían la
   misma lógica de prorrateo por separado y cada pestaña tenía su propio
   juego de filtros. Resultado: el mismo número podía dar distinto según
   dónde lo miraras. Acá vive TODO lo que alimenta Finanzas:

     finFiltros ........ estado de filtros COMPARTIDO por Análisis y P&L
     finRange() ........ rango del período (MTD/QTD/YTD/12M/All/Custom)
     finPriorRange() ... mismo período del año anterior (comparación YoY)
     finSaleLines() .... ventas a nivel línea, con envío/cargos/costos/
                         comisión ya prorrateados (la "tabla de hechos")
     finAggregate() .... rollup tipo estado de resultados sobre esas líneas
     finPurchases() .... compras del período (facturadas y en tránsito)
     finStock() ........ foto actual del stock de la selección
     finMonths() ....... serie mensual continua (ventas, compras, margen)

   Regla de oro: los porcentajes se calculan SIEMPRE como razón de sumas
   (margen / ingreso), nunca como promedio de porcentajes.
   Se carga después de 02-engine.js y antes de las vistas.
   ============================================================ */

/* ---------- Estado de filtros compartido ---------- */
let finFiltros = { periodo:"mtd", desde:"", hasta:"", linea:"", idioma:"", pais:"", vend:"" };
const FIN_PERIODS = ["mtd","qtd","ytd","12m","all"];
function finResetFiltros(){ finFiltros = { periodo:"mtd", desde:"", hasta:"", linea:"", idioma:"", pais:"", vend:"" }; }

/* ---------- Fechas ---------- */
function finIso(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
/* Ancla del período: hoy, o la venta más reciente si está fechada a futuro. */
function finAnchor(){
  let a = new Date(); a.setHours(12,0,0,0);
  (db.ventas||[]).forEach(v=>{ const f=new Date((normISO(v.fecha)||v.fecha)+"T12:00:00"); if(!isNaN(f) && f>a) a=f; });
  return a;
}
/* Rango de un preset. QTD = trimestre CALENDARIO (antes eran 3 meses móviles). */
function finRangeFor(preset, f){
  if(preset==="custom") return { from:(f&&f.desde)||"", to:(f&&f.hasta)||"" };
  if(preset==="all") return { from:"", to:"" };
  const a = finAnchor(), y=a.getFullYear(), m=a.getMonth();
  if(preset==="mtd") return { from:finIso(new Date(y,m,1)), to:finIso(a) };
  if(preset==="qtd") return { from:finIso(new Date(y,Math.floor(m/3)*3,1)), to:finIso(a) };
  if(preset==="12m") return { from:finIso(new Date(y,m-11,1)), to:finIso(a) };
  return { from:finIso(new Date(y,0,1)), to:finIso(a) };   // ytd (default)
}
function finRange(f){ f=f||finFiltros; return finRangeFor(f.periodo, f); }
/* Mismo período del año anterior. Con estacionalidad, comparar YTD contra la
   ventana "inmediatamente anterior" (abr–dic del año pasado) no dice nada. */
function finShiftYear(iso, dy){
  const [y,m,d] = iso.split("-").map(Number);
  const last = new Date(y+dy, m, 0).getDate();          // 29/02 -> 28/02 si no es bisiesto
  return `${y+dy}-${String(m).padStart(2,"0")}-${String(Math.min(d,last)).padStart(2,"0")}`;
}
function finPriorRange(r){
  if(!r || !r.from || !r.to) return null;
  return { from:finShiftYear(r.from,-1), to:finShiftYear(r.to,-1) };
}
function finInRange(fechaIso, r){
  if(!fechaIso) return false;
  if(r.from && fechaIso < r.from) return false;
  if(r.to && fechaIso > r.to) return false;
  return true;
}
function finMonthLabel(mk){ const [y,m]=mk.split("-"); return `${t("cal.mon."+((+m)-1)).slice(0,3)} ${y.slice(2)}`; }

/* ---------- Dimensiones (línea, idioma, país, vendedor) ---------- */
function finDims(f){ f=f||finFiltros; return { linea:f.linea||"", idioma:f.idioma||"", pais:f.pais||"", vend:f.vend||"" }; }
function finDimsActive(f){ const d=finDims(f); return !!(d.linea||d.idioma||d.pais||d.vend); }
function finDimsLabel(f){
  const d=finDims(f), parts=[];
  if(d.linea) parts.push(d.linea);
  if(d.idioma) parts.push(langLabel(d.idioma));
  if(d.pais) parts.push(paisLabel(d.pais));
  if(d.vend) parts.push(vendedorNombre(d.vend));
  return parts.join(" · ");
}
/* ¿El producto entra en la selección de línea/idioma? (país y vendedor son de la venta) */
function finProdMatch(p, d){
  if(d.linea && (p ? sagaDe(p) : "") !== d.linea) return false;
  if(d.idioma && (p ? (p.idioma||"") : "") !== d.idioma) return false;
  return true;
}

/* ---------- Procedencia por sociedad ----------
   La venta sale del pool único; el consumo FIFO (l.consumed) guarda de qué sociedad
   salió cada unidad. socFocoActual() = sociedad elegida en la barra (o null = consolidado). */
function socFocoActual(){ return (activeStore!=="all" && STORE_IDS.includes(activeStore)) ? activeStore : null; }
/* Parte de una línea de venta que corresponde a `soc` (null = la línea entera).
   Venta: a prorrata de unidades (mismo precio unitario). COGS: el l.cogs de la línea
   repartido según el costo FIFO de cada sociedad, así Akira + Silver siempre cierra
   contra el consolidado. Devuelve null si esa sociedad no aportó. */
function lineaDeSoc(l, v, soc){
  const fb = l.store || v.store || null;
  let consumed = (Array.isArray(l.consumed) && l.consumed.length) ? l.consumed : null;
  if(consumed && fb) consumed = consumed.map(c=> c.sociedad ? c : Object.assign({}, c, {sociedad:fb}));
  const precioTot = round2((l.precio||0)*l.cantidad);
  const cogs = round2(l.cogs!=null ? l.cogs : (l.costo||0)*l.cantidad);
  if(!soc) return { cantidad:l.cantidad, precioTot, cogs, consumed };
  if(!consumed) return fb===soc ? { cantidad:l.cantidad, precioTot, cogs, consumed:null } : null;
  const mine = consumed.filter(c=> c.sociedad===soc);
  const u = mine.reduce((a,c)=>a+(c.cantidad||0),0);
  if(!(u>0)) return null;
  const uTot = consumed.reduce((a,c)=>a+(c.cantidad||0),0) || l.cantidad;
  const cMine = mine.reduce((a,c)=>a+(c.costoUnit||0)*(c.cantidad||0),0);
  const cTot  = consumed.reduce((a,c)=>a+(c.costoUnit||0)*(c.cantidad||0),0);
  return { cantidad:u, precioTot:round2(precioTot*(u/uTot)),
           cogs: round2(cTot>0 ? cogs*(cMine/cTot) : cogs*(u/uTot)), consumed:mine };
}

/* ============================================================
   VENTAS A NIVEL LÍNEA (tabla de hechos)
   ------------------------------------------------------------
   q = { from, to, soc, linea, idioma, pais, vend }
   Los conceptos de la VENTA (envío cobrado, cargos on-top, costos de venta)
   se reparten entre sus líneas a prorrata de la venta de productos; la
   comisión es exacta por línea (margen × tasa congelada de la venta).
   Así cualquier corte (línea, idioma, país, vendedor, sociedad) suma
   exactamente lo mismo que el consolidado.
   ============================================================ */
function finSaleLines(q){
  q = q || {};
  const r = { from:q.from||"", to:q.to||"" };
  const d = { linea:q.linea||"", idioma:q.idioma||"", pais:q.pais||"", vend:q.vend||"" };
  const soc = q.soc || null;
  const rep = reportCcy();
  const rows = [];
  (db.ventas||[]).forEach(v=>{
    const fecha = normISO(v.fecha) || v.fecha;
    if(!finInRange(fecha, r)) return;
    if(d.vend && (v.vendedorId||"") !== d.vend) return;
    const pais = (v.cliente && v.cliente.pais) || "";
    if(d.pais && pais !== d.pais) return;
    const sCcy = storeCcy(v.storeVenta||v.store||STORE_IDS[0]);
    const conv = x => convertCcyAt(x, sCcy, rep, fecha);
    const lineas = v.lineas || [];
    const saleRev = lineas.reduce((a,l)=>a+round2((l.precio||0)*l.cantidad),0);
    const saleU   = lineas.reduce((a,l)=>a+(l.cantidad||0),0);
    const rate = saleCommissionRate(v);
    const sShip = saleEnvioCobrado(v), sCarg = saleCargosCliente(v);
    const sCostTipo = { envio:0, labor:0, comision:0, otro:0 };
    (v.costosExtra||[]).forEach(c=>{ const k=(c.tipo in sCostTipo)?c.tipo:"otro"; sCostTipo[k]+= (+c.monto||0); });
    const vendNombre = saleVendedorNombre(v);
    lineas.forEach(l=>{
      const p = prodById(l.productoId);
      if(!finProdMatch(p, d)) return;
      const part = lineaDeSoc(l, v, soc); if(!part) return;
      const share = saleRev>0 ? part.precioTot/saleRev : (saleU>0 ? part.cantidad/saleU : 0);
      const revenue = conv(part.precioTot), cogs = conv(part.cogs);
      const ship = conv(sShip*share), cargos = conv(sCarg*share);
      const costosTipo = { envio:conv(sCostTipo.envio*share), labor:conv(sCostTipo.labor*share), comision:conv(sCostTipo.comision*share), otro:conv(sCostTipo.otro*share) };
      const costos = costosTipo.envio+costosTipo.labor+costosTipo.comision+costosTipo.otro;
      const comm = conv((part.precioTot - part.cogs)*rate);
      rows.push({
        ventaId:v.id, numero:v.numero||"", cliente:nombreVis((v.cliente&&v.cliente.nombre)||v.contraparte||""),   // mayúsculas sólo al mostrar
        fecha, mes:fecha.slice(0,7), vendedor:vendNombre, vendedorId:v.vendedorId||"",
        productoId:l.productoId, nombre:l.nombre, sku:l.sku, cantidad:part.cantidad,
        revenue, cogs, ship, cargos, comm, costos, costosTipo, rate,
        net: revenue+ship+cargos,                            // ingreso neto (como el P&L)
        contrib: revenue+ship+cargos-cogs-comm-costos,       // margen de contribución
        ccy:sCcy, consumed:part.consumed, store:l.store||v.store||null,
        pais, saga:p?sagaDe(p):"", idioma:p?(p.idioma||""):""
      });
    });
  });
  return rows;
}

/* ============================================================
   ROLLUP tipo estado de resultados. Misma forma que devolvía el viejo
   pnlAggregate (el export a Excel lo consume tal cual).
   ============================================================ */
function finAggregate(rows){
  const A = { rep:reportCcy(), sales:0, shipping:0, cargos:0, cogs:0, commission:0,
              costos:{envio:0,labor:0,comision:0,otro:0}, units:0,
              detail:{}, perVend:{}, byMonth:{}, bySaga:{} };
  (rows||[]).forEach(r=>{
    A.sales+=r.revenue; A.shipping+=r.ship; A.cargos+=r.cargos; A.cogs+=r.cogs; A.commission+=r.comm; A.units+=r.cantidad;
    Object.keys(A.costos).forEach(k=> A.costos[k]+= (r.costosTipo ? r.costosTipo[k] : 0));
    const pk = r.productoId||r.sku||r.nombre;
    const e = A.detail[pk] = A.detail[pk] || { productoId:r.productoId, sku:r.sku||"", nombre:r.nombre||"", saga:r.saga, units:0, revenue:0, cogs:0, contrib:0 };
    e.units+=r.cantidad; e.revenue+=r.revenue; e.cogs+=r.cogs; e.contrib+=r.contrib;
    const vk = r.vendedorId||"";
    const pv = A.perVend[vk] = A.perVend[vk] || { nombre: vk ? (r.vendedor||"—") : t("fin.house"), units:0, sales:0, cogs:0, commission:0, cargos:0, shipping:0, costos:0 };
    pv.units+=r.cantidad; pv.sales+=r.revenue; pv.cogs+=r.cogs; pv.commission+=r.comm; pv.cargos+=r.cargos; pv.shipping+=r.ship; pv.costos+=r.costos;
    const mm = A.byMonth[r.mes] = A.byMonth[r.mes] || { net:0, gp:0, contrib:0, sales:0, cogs:0, units:0 };
    mm.sales+=r.revenue; mm.cogs+=r.cogs; mm.units+=r.cantidad;
    mm.net+=r.net; mm.gp+=r.net-r.cogs; mm.contrib+=r.contrib;
    if(r.saga){
      const sg = A.bySaga[r.saga] = A.bySaga[r.saga] || { units:0, net:0, revenue:0, cogs:0, contrib:0 };
      sg.units+=r.cantidad; sg.net+=r.net; sg.revenue+=r.revenue; sg.cogs+=r.cogs; sg.contrib+=r.contrib;
    }
  });
  ["sales","shipping","cargos","cogs","commission"].forEach(k=> A[k]=round2(A[k]));
  Object.keys(A.costos).forEach(k=> A.costos[k]=round2(A.costos[k]));
  A.sellingTotal = round2(A.commission + A.costos.envio + A.costos.labor + A.costos.comision + A.costos.otro);
  A.net     = round2(A.sales + A.shipping + A.cargos);
  A.gp      = round2(A.net - A.cogs);
  A.contrib = round2(A.gp - A.sellingTotal);
  A.gpPct       = A.net>0 ? A.gp/A.net : 0;
  A.contribPct  = A.net>0 ? A.contrib/A.net : 0;
  return A;
}

/* ============================================================
   COMPRAS del período. Se cuentan por FECHA DE FACTURA y se incluyen
   las que están en tránsito (ya son un compromiso de caja), separando
   cuánto de eso todavía no llegó. Valor = costo landed (neto+handling+flete).
   País y vendedor no aplican a una compra: se ignoran.
   q = { from, to, soc, linea, idioma }
   ============================================================ */
function finPurchases(q){
  q = q || {};
  const r = { from:q.from||"", to:q.to||"" };
  const d = { linea:q.linea||"", idioma:q.idioma||"" };
  const out = { total:0, units:0, transit:0, transitUnits:0, docs:0, byMonth:{}, bySaga:{} };
  (db.compras||[]).forEach(c=>{
    const fecha = normISO(c.fecha) || c.fecha;
    if(!finInRange(fecha, r)) return;
    if(q.soc && (c.store||STORE_IDS[0]) !== q.soc) return;
    let docVal = 0, docU = 0;
    (c.lineas||[]).forEach(l=>{
      if(!finProdMatch(prodById(l.productoId), d)) return;
      const landed = (l.costoTotal!=null) ? l.costoTotal : (l.precio||0);
      docVal += (l.cantidad||0)*landed; docU += (l.cantidad||0);
      const pr = prodById(l.productoId), sg = pr ? sagaDe(pr) : "";
      if(sg){ const e = out.bySaga[sg] = out.bySaga[sg] || { value:0, units:0 }; e.value += (l.cantidad||0)*landed; e.units += (l.cantidad||0); }
    });
    if(docU<=0) return;
    out.docs++; out.total+=docVal; out.units+=docU;
    if(c.status===INVOICE_STATUS.IN_TRANSIT){ out.transit+=docVal; out.transitUnits+=docU; }
    const mk = fecha.slice(0,7);
    const mm = out.byMonth[mk] = out.byMonth[mk] || { value:0, units:0 };
    mm.value+=docVal; mm.units+=docU;
  });
  out.total=round2(out.total); out.transit=round2(out.transit);
  return out;
}

/* ============================================================
   STOCK actual de la selección (línea / idioma). Es una FOTO de hoy:
   no depende del período. Excluye la bóveda de inversión.
   ============================================================ */
function finStock(q){
  const d = { linea:(q&&q.linea)||"", idioma:(q&&q.idioma)||"" };
  const soc = (q && q.soc) || null;
  const stores = soc ? [soc] : STORE_IDS;
  const out = { skus:0, units:0, valuation:0, transitUnits:0, transitValue:0, alerts:0, bySaga:{} };
  productosVendibles().forEach(p=>{
    if(!finProdMatch(p, d)) return;
    out.skus++;
    const sg = sagaDe(p), bs = out.bySaga[sg] = out.bySaga[sg] || { units:0, valuation:0, skus:0 };
    bs.skus++;
    stores.forEach(s=>{
      const v = fifoLayers(p,s).reduce((a,L)=>a+L.cantidad*L.costoUnit,0);
      bs.units += stockDe(p,s); bs.valuation += v;
      out.units += stockDe(p,s);
      out.valuation += v;
      out.transitUnits += transitoDe(p,s);
      out.transitValue += transitoValorDe(p,s);
    });
    if(necesitaPedido(p)) out.alerts++;
  });
  out.units=round4(out.units); out.valuation=round2(out.valuation); out.transitValue=round2(out.transitValue);
  return out;
}

/* ============================================================
   Serie mensual CONTINUA (meses sin movimiento = 0) entre from y to.
   Sin rango (All): del primer al último mes con datos.
   ============================================================ */
function finMonthKeys(r, A, P){
  let from = r.from ? r.from.slice(0,7) : "", to = r.to ? r.to.slice(0,7) : "";
  if(!from || !to){
    const ks = Object.keys(A.byMonth).concat(Object.keys(P.byMonth)).sort();
    if(!ks.length) return [];
    if(!from) from = ks[0];
    if(!to) to = ks[ks.length-1];
  }
  const out = [];
  let [y,m] = from.split("-").map(Number);
  const [ty,tm] = to.split("-").map(Number);
  while((y<ty || (y===ty && m<=tm)) && out.length<60){
    out.push(`${y}-${String(m).padStart(2,"0")}`);
    m++; if(m>12){ m=1; y++; }
  }
  return out;
}
function finMonths(r, A, P){
  return finMonthKeys(r, A, P).map(mk=>{
    const s = A.byMonth[mk] || { net:0, gp:0, contrib:0, sales:0, cogs:0, units:0 };
    const pu = P.byMonth[mk] || { value:0, units:0 };
    return { mk, label:finMonthLabel(mk), net:round2(s.net), gp:round2(s.gp), contrib:round2(s.contrib), cogs:round2(s.cogs||0),
             units:s.units, purch:round2(pu.value), purchUnits:pu.units,
             gpPct: s.net>0 ? s.gp/s.net : null };
  });
}

/* v88: saca los meses VACÍOS DEL PRINCIPIO de una serie (ej. Ene–Jul sin ventas ni
   compras en un negocio que arrancó en junio). Los huecos del medio se mantienen:
   un mes sin ventas entre dos con ventas es información, no ruido. */
function finTrimMeses(list, hasData){
  const i = (list||[]).findIndex(hasData);
  return i < 0 ? [] : list.slice(i);
}

/* ---------- Consulta estándar con los filtros compartidos ---------- */
function finQuery(f, extra){
  f = f || finFiltros;
  return Object.assign({}, finRange(f), { soc:socFocoActual() }, finDims(f), extra||{});
}

/* ============================================================
   FORMATO Y SEMÁNTICA DE COLOR
   ============================================================ */
/* Porcentaje a partir de una razón (0.321 -> "32,1%") en el formato del idioma. */
function fmtPct(ratio, dec){ if(ratio==null || !isFinite(ratio)) return "—"; return nfDec(dec==null?1:dec).format(ratio*100)+"%"; }
/* Compacto para ejes/etiquetas: usa el MISMO separador decimal que money(). */
function finCompact(n){
  const a=Math.abs(n||0), s=(n||0)<0?"-":"", sym=monedaSym(reportCcy());
  if(a>=1e6) return s+sym+"\u00A0"+nfDec(1).format(a/1e6)+"M";
  if(a>=1e3) return s+sym+"\u00A0"+nfDec(1).format(a/1e3)+"k";
  return s+sym+"\u00A0"+nfDec(0).format(a);
}
/* Compacto para EJES: sin decimales cuando no hacen falta ("USD 100k", "USD 7,5k"). */
function finCompactAxis(n){
  const a=Math.abs(n||0), s=(n||0)<0?"-":"", sym=monedaSym(reportCcy());
  const f=(v)=> nfDec(Number.isInteger(Math.round(v*10)/10) && Math.round(v*10)%10===0 ? 0 : 1).format(v);
  if(a>=1e6) return s+sym+"\u00A0"+f(a/1e6)+"M";
  if(a>=1e3) return s+sym+"\u00A0"+f(a/1e3)+"k";
  return s+sym+"\u00A0"+nfDec(0).format(a);
}
/* Margen izquierdo del gráfico según la etiqueta más larga del eje (antes era fijo y
   "USD 100,0k" se cortaba). ~6,9 unidades por carácter a 11px en fuente mono. */
function finAxisPad(labels, min){ return Math.max(min||48, Math.ceil(Math.max(...labels.map(l=>String(l).length))*6.9)+16); }
/* Chip de variación con POLARIDAD: en compras, costos o días de inventario,
   subir no es bueno. polarity: "up" (más es mejor) | "down" (menos es mejor) | "neutral".
   kind: "pct" (variación relativa) | "pp" (diferencia en puntos porcentuales de dos razones). */
function finDelta(cur, prev, opts){
  opts = opts || {};
  const vs = opts.vs || t("fin.vs.yoy");
  if(prev==null || (opts.kind!=="pp" && !prev)) return `<div class="kdelta muted">${t("fin.delta.noprior")}</div>`;
  let d, txt;
  if(opts.kind==="pp"){ d = (cur-prev)*100; txt = (d>0?"+":d<0?"−":"")+nfDec(1).format(Math.abs(d))+" pp"; }
  else { d = (cur-prev)/Math.abs(prev); txt = (d>0?"+":d<0?"−":"")+nfDec(1).format(Math.abs(d)*100)+"%"; }
  const pol = opts.polarity || "up";
  const good = pol==="neutral" ? null : (pol==="up" ? d>0 : d<0);
  const cls = Math.abs(d)<0.0005 ? "flat" : (good===null ? "neutral" : (good ? "pos" : "neg"));
  const arrow = d>0 ? "▲" : d<0 ? "▼" : "=";
  return `<div class="kdelta ${cls}">${arrow} ${txt} <span class="kdelta-vs">${esc(vs)}</span></div>`;
}

/* ============================================================
   FOTOS MENSUALES DE STOCK (v57)
   ------------------------------------------------------------
   Hasta ahora sólo existía el stock de HOY. Para comparar "stock vs
   objetivo" mes a mes o ver cómo evolucionó la cobertura hace falta
   saber cuánto había al cierre de cada mes.

   1) RECONSTRUCCIÓN desde el kardex: cada movimiento guarda cantidad y
      costo unitario (entradas a costo landed, salidas a costo FIFO real),
      así que el saldo acumulado a fin de mes ES la valuación FIFO de ese
      momento. Las ventas se ubican por la fecha de la VENTA (no por el
      momento en que se cargó); compras, ajustes y movimientos de bóveda
      por su fecha de movimiento. La bóveda de inversión queda afuera.
      Saldos que nunca pasaron por el kardex (p. ej. stock inicial de una
      migración) se toman como existentes desde el principio: así el mes
      actual siempre cierra exacto contra el stock real.
   2) FOTO CONGELADA: al abrir la app en un mes nuevo, el admin congela
      los meses ya cerrados en db.stockSnaps (sincroniza como el resto).
      Un mes congelado no cambia aunque después se edite una compra vieja,
      igual que un cierre contable. Se puede recalcular a mano.
   Se guarda por segmento línea|idioma, así los filtros de Finanzas
   también aplican a la historia de stock.
   ============================================================ */
let _stkCache = null;        // reconstrucción; router.render() la limpia
function finStockSeg(p){ return (sagaDe(p)||"—")+"|"+((p&&p.idioma)||""); }
function finSegMatch(seg, d){
  if(!d || (!d.linea && !d.idioma)) return true;
  const i = seg.lastIndexOf("|"), sg = seg.slice(0,i), id = seg.slice(i+1);
  if(d.linea && sg!==d.linea) return false;
  if(d.idioma && id!==d.idioma) return false;
  return true;
}
function finCurMonth(){ return finIso(new Date()).slice(0,7); }
function finStockReconstruct(){
  if(_stkCache) return _stkCache;
  const ventaF = {}; (db.ventas||[]).forEach(v=>{ ventaF[v.id] = normISO(v.fecha)||""; });
  /* v90: las compras también van por la fecha del DOCUMENTO (factura), igual que las ventas.
     Antes usaban la fecha del movimiento, que es cuando se cargó/recibió en la app: compras
     de junio y julio cargadas el 20/08 dejaban "Stock al cierre" vacío en esos meses, aunque
     el gráfico de compras (que va por fecha de factura) sí las mostraba. */
  const compraF = {}; (db.compras||[]).forEach(c=>{ compraF[c.id] = normISO(c.fecha)||""; });
  const perProd = {}; let minMk = null;
  (db.movimientos||[]).forEach(m=>{
    if(!isStore(m.store)) return;                                   // sólo stock vendible
    const f = (m.refTipo==="venta" && ventaF[m.refId]) ? ventaF[m.refId]
            : (m.refTipo==="compra" && compraF[m.refId]) ? compraF[m.refId]
            : (normISO(m.fecha)||"");
    if(!f) return;
    const mk = f.slice(0,7), du = (+m.delta||0), dv = du*(+m.valorUnit||0);
    const e = perProd[m.productoId] = perProd[m.productoId] || { u:0, v:0, byMonth:{} };
    e.u+=du; e.v+=dv;
    const b = e.byMonth[mk] = e.byMonth[mk] || { u:0, v:0 }; b.u+=du; b.v+=dv;
    if(!minMk || mk<minMk) minMk = mk;
  });
  const segs = {};
  (db.productos||[]).forEach(p=>{
    const curU = stockTotalP(p);
    const curV = STORE_IDS.reduce((a,s)=> a + fifoLayers(p,s).reduce((x,L)=>x+L.cantidad*L.costoUnit,0), 0);
    const e = perProd[p.id] || { u:0, v:0, byMonth:{} };
    const sg = segs[finStockSeg(p)] = segs[finStockSeg(p)] || { offU:0, offV:0, byMonth:{} };
    sg.offU += curU - e.u; sg.offV += curV - e.v;                  // saldo inicial no registrado
    Object.keys(e.byMonth).forEach(mk=>{ const b=sg.byMonth[mk]=sg.byMonth[mk]||{u:0,v:0}; b.u+=e.byMonth[mk].u; b.v+=e.byMonth[mk].v; });
  });
  _stkCache = { segs, minMk };
  return _stkCache;
}
/* Saldo reconstruido al cierre de `mk`, por segmento. */
function finStockSegsAt(mk){
  const R = finStockReconstruct(), out = {};
  Object.keys(R.segs).forEach(seg=>{
    const s = R.segs[seg]; let u = s.offU, v = s.offV;
    Object.keys(s.byMonth).forEach(m=>{ if(m<=mk){ u+=s.byMonth[m].u; v+=s.byMonth[m].v; } });
    if(Math.abs(u)>0.0001 || Math.abs(v)>0.005) out[seg] = { u:round4(u), v:round2(v) };
  });
  return out;
}
/* Stock al cierre de un mes, con los filtros de línea/idioma.
   source: "live" (mes en curso = stock real de hoy) · "snap" (mes congelado) · "calc" (reconstruido).
   null si el mes es anterior al primer movimiento registrado. */
function finStockAt(mk, d){
  d = d || {};
  if(mk >= finCurMonth()){ const S = finStock({ linea:d.linea, idioma:d.idioma }); return { units:S.units, value:S.valuation, source:"live" }; }
  const snap = db.stockSnaps && db.stockSnaps[mk];
  let segs, source;
  if(snap && snap.seg){ segs = snap.seg; source = "snap"; }
  else {
    const R = finStockReconstruct();
    if(!R.minMk || mk < R.minMk) return null;
    segs = finStockSegsAt(mk); source = "calc";
  }
  let u=0, v=0;
  Object.keys(segs).forEach(seg=>{ if(finSegMatch(seg, d)){ u+=segs[seg].u||0; v+=segs[seg].v||0; } });
  return { units:round4(u), value:round2(v), source };
}
/* Congela los meses cerrados que falten (máx. 36 hacia atrás). Sólo admin. */
function finFreezeStockSnaps(force){
  if(typeof isAdmin==="function" && !isAdmin()) return 0;
  if(!db.stockSnaps || typeof db.stockSnaps!=="object") db.stockSnaps = {};
  _stkCache = null;
  const R = finStockReconstruct(); if(!R.minMk) return 0;
  const cur = finCurMonth();
  let [y,m] = R.minMk.split("-").map(Number);
  const [cy,cm] = cur.split("-").map(Number);
  const lim = new Date(cy, cm-1-36, 1), limMk = finIso(lim).slice(0,7);
  let n = 0;
  while(y<cy || (y===cy && m<cm)){
    const mk = `${y}-${String(m).padStart(2,"0")}`;
    if(mk>=limMk && (force || !db.stockSnaps[mk])){ db.stockSnaps[mk] = { at:new Date().toISOString(), seg:finStockSegsAt(mk) }; n++; }
    m++; if(m>12){ m=1; y++; }
  }
  if(n) save();
  return n;
}

/* ============================================================
   PROYECCIÓN DE CIERRE DEL MES EN CURSO (v57)
   ------------------------------------------------------------
   Proyectado = lo vendido en el mes + días que faltan × ritmo diario de
   los ÚLTIMOS 30 DÍAS. Se usa el ritmo de 30 días (y no "lo del mes / días
   transcurridos") porque los primeros días del mes una sola venta grande
   dispara la proyección lineal. La lineal se informa igual, como referencia.
   Siempre es el mes calendario en curso, sin importar el período elegido.
   ============================================================ */
function finMonthProjection(d){
  d = d || {};
  const today = new Date(); today.setHours(12,0,0,0);
  const y = today.getFullYear(), mo = today.getMonth();
  const dim = new Date(y, mo+1, 0).getDate(), day = today.getDate(), rem = dim - day;
  const mk = finIso(today).slice(0,7), from = finIso(new Date(y,mo,1)), to = finIso(today);
  const q = { linea:d.linea||"", idioma:d.idioma||"", pais:d.pais||"", vend:d.vend||"", soc:d.soc||null };   // v93: soc
  const M = finAggregate(finSaleLines(Object.assign({ from, to }, q)));
  const p30 = new Date(today); p30.setDate(p30.getDate()-29);
  const L30 = finAggregate(finSaleLines(Object.assign({ from:finIso(p30), to }, q)));
  const dailyNet = L30.net/30;
  /* v87: MISMA regla que el semáforo del Plan (fpaPlanMes): por juego, lo que falta
     vender del mes = mín(ritmo 30 días × días restantes, stock + tránsito a precio de
     venta). No se proyecta vender lo que no hay. Antes el Resumen proyectaba sin tope
     y daba "llega" mientras el Plan decía "no llegás". */
  let extra = 0, topeStock = false, projNet;
  const stk = (typeof pmStockPorJuego==="function") ? pmStockPorJuego({ linea:q.linea, idioma:q.idioma, soc:q.soc }) : null;
  if(stk){
    // Mismo redondeo que fpaPlanMes (cierre por juego redondeado y después sumado), al centavo.
    const keys = new Set(Object.keys(M.bySaga).concat(Object.keys(L30.bySaga)));
    let sumCierre = 0, sumReal = 0;
    keys.forEach(k=>{
      const real = round2((M.bySaga[k]||{}).net||0);
      const cap = (((L30.bySaga[k]||{}).net||0)/30) * rem;
      const s = stk[k]; const disp = s ? s.v + s.tv : 0;
      if(cap > disp + 0.005) topeStock = true;
      extra += Math.min(cap, disp);
      sumCierre += round2(real + Math.min(cap, disp)); sumReal += real;
    });
    projNet = round2(sumCierre + (M.net - sumReal));
  } else { extra = dailyNet*rem; projNet = round2(M.net + extra); }
  const gpRate = L30.net>0 ? L30.gp/L30.net : 0;
  const projGp = round2(M.gp + extra*gpRate);
  const linear = day>0 ? round2(M.net/day*dim) : 0;
  let plan = null;
  if(typeof fpaVigente==="function" && !q.pais && !q.vend && !q.soc){   // el plan es de la empresa entera
    const ver = fpaVigente();
    if(ver){
      const PA = fpaAggregate(fpaRowsFor(ver, { from, to:finIso(new Date(y,mo,dim)) }, { linea:q.linea, idioma:q.idioma }));
      if(PA.ventas>0) plan = { ventas:PA.ventas, margenPct:PA.margenPct, ver:ver.nombre };
    }
  }
  return {
    mk, day, dim, rem, mtdNet:M.net, mtdGp:M.gp, dailyNet:round2(dailyNet), projNet, projGp, topeStock,
    projGpPct: projNet>0 ? projGp/projNet : null, linear, plan,
    needDaily: (plan && rem>0) ? round2(Math.max(0, (plan.ventas - M.net)/rem)) : null
  };
}
