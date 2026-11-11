/* ============================================================
   39 · STOCK DEL GRUPO (Prince + Select) — sólo de consulta · v2 con filtros
   ------------------------------------------------------------
   Una pantalla con el stock de las dos empresas, agrupado por
   producto: se considera el mismo producto si comparten algún código
   (SKU propio o código de proveedor asociado) o, si no tienen códigos
   en común, el mismo nombre. Es únicamente visual: no se puede cargar,
   mover ni editar nada desde acá.
   Los datos los arma el servidor propio (/grupo/consolidado), que le
   pide el stock al servidor de la otra empresa. Sin costos ni precios.
   Módulo idéntico en Prince y Select (salvo el SKU en la fila, que en Select sólo ve el admin).
   v-catálogo: botón "Descargar catálogo" (PDF por juego, sin nombres de empresa).
   v-cajas: "Ver como: Unidades / Cajas" (mismo interruptor que Panel y Productos). En cajas,
   cada producto se divide por sus unidades por caja; la tabla, los totales, el orden y el
   catálogo PDF siguen la vista elegida.
   ============================================================ */
(function(){
  const EN = {
    "nav.grupo":"Group stock", "gr.title":"Group stock",
    "gr.sub":"Stock of both companies in one place, grouped by product. View only: nothing can be loaded, moved or edited here.",
    "gr.badge":"View only", "gr.loading":"Loading the stock of both companies…",
    "gr.err":"Couldn't load the group stock", "gr.retry":"Retry", "gr.refresh":"Refresh",
    "gr.peer.off":"{app}: not connected yet — only this company's stock is shown.",
    "gr.peer.err":"Couldn't read the other company's stock ({e}). Showing this company only.",
    "gr.ph.search":"Search by name or code…", "gr.allgames":"All games",
    "gr.th.product":"Product", "gr.th.game":"Game", "gr.th.transit":"In transit", "gr.th.total":"Available",
    "gr.updated":"Updated {t}", "gr.refreshing":"updating…", "gr.stale":"Couldn't update right now ({e}). Showing the stock as of {t}.", "gr.empty":"No products with stock match the filter.",
    "gr.count":"{n} products", "gr.local":"Sign in to see the group stock (it needs the server).",
    "gr.match.tip":"Grouped by code: {c}",
    "gr.f.emp":"Company", "gr.f.emp.all":"All companies", "gr.f.emp.both":"In both", "gr.f.emp.only":"Only {app}",
    "gr.f.dep":"Stock in", "gr.f.dep.all":"Any location", "gr.f.dep.tr":"In transit",
    "gr.f.lang":"Language", "gr.f.lang.all":"All languages",
    "gr.sort.tip":"Click to sort · again to reverse · a third time to clear",
    "gr.f.clear":"Clear filters",
    "gr.cat.btn":"Download catalog", "gr.cat.tip":"PDF with product and available quantity, by game (what you see with the current filters). No company names, codes or prices.",
    "gr.cat.title":"CATALOG", "gr.cat.sub":"Available stock · {d}", "gr.cat.sum":"{n} products · {u} units",
    "gr.cat.product":"PRODUCT", "gr.cat.units":"AVAILABLE", "gr.cat.other":"Other",
    "gr.cat.note":"Quantities available when this catalog was downloaded. Subject to confirmation at the time of the order.",
    "gr.cat.page":"Page {p} of {n}", "gr.cat.empty":"No products with available stock to put in the catalog", "gr.cat.done":"Catalog downloaded ({n} products)",
    "gr.cat.err":"Couldn't generate the PDF (no internet?)", "gr.cat.file":"catalog", "gr.cat.cont":"(cont.)",
    "gr.view.tip":"Cases: each product is divided by its units per case (the one set on the product).",
    "gr.cell.tip":"= {u} units ({n} per case)", "gr.th.incases":"cases",
    "gr.cat.sum.c":"{n} products · {u} cases", "gr.cat.units.c":"AVAILABLE (CASES)"
  };
  const ES = {
    "nav.grupo":"Stock del grupo", "gr.title":"Stock del grupo",
    "gr.sub":"El stock de las dos empresas en un solo lugar, agrupado por producto. Solo de consulta: desde acá no se carga, mueve ni edita nada.",
    "gr.badge":"Solo consulta", "gr.loading":"Cargando el stock de las dos empresas…",
    "gr.err":"No se pudo cargar el stock del grupo", "gr.retry":"Reintentar", "gr.refresh":"Actualizar",
    "gr.peer.off":"{app}: todavía no está conectada — se muestra solo el stock de esta empresa.",
    "gr.peer.err":"No se pudo leer el stock de la otra empresa ({e}). Se muestra solo esta.",
    "gr.ph.search":"Buscar por nombre o código…", "gr.allgames":"Todos los juegos",
    "gr.th.product":"Producto", "gr.th.game":"Juego", "gr.th.transit":"En tránsito", "gr.th.total":"Disponible",
    "gr.updated":"Actualizado {t}", "gr.refreshing":"actualizando…", "gr.stale":"No se pudo actualizar ahora ({e}). Se muestra el stock de las {t}.", "gr.empty":"No hay productos con stock que coincidan con el filtro.",
    "gr.count":"{n} productos", "gr.local":"Iniciá sesión para ver el stock del grupo (necesita el servidor).",
    "gr.match.tip":"Agrupado por código: {c}",
    "gr.f.emp":"Empresa", "gr.f.emp.all":"Todas las empresas", "gr.f.emp.both":"En las dos", "gr.f.emp.only":"Solo {app}",
    "gr.f.dep":"Con stock en", "gr.f.dep.all":"Cualquier ubicación", "gr.f.dep.tr":"En tránsito",
    "gr.f.lang":"Idioma", "gr.f.lang.all":"Todos los idiomas",
    "gr.sort.tip":"Tocá para ordenar · otra vez invierte · una tercera saca el orden",
    "gr.f.clear":"Limpiar filtros",
    "gr.cat.btn":"Descargar catálogo", "gr.cat.tip":"PDF con producto y cantidad disponible, por juego (lo que ves con los filtros puestos). Sin nombres de empresa, códigos ni precios.",
    "gr.cat.title":"CATÁLOGO", "gr.cat.sub":"Stock disponible · {d}", "gr.cat.sum":"{n} productos · {u} unidades",
    "gr.cat.product":"PRODUCTO", "gr.cat.units":"DISPONIBLE", "gr.cat.other":"Otros",
    "gr.cat.note":"Cantidades disponibles al momento de descargar el catálogo. Sujetas a confirmación al hacer el pedido.",
    "gr.cat.page":"Página {p} de {n}", "gr.cat.empty":"No hay productos con stock disponible para el catálogo", "gr.cat.done":"Catálogo descargado ({n} productos)",
    "gr.cat.err":"No se pudo generar el PDF (¿sin internet?)", "gr.cat.file":"catalogo", "gr.cat.cont":"(cont.)",
    "gr.view.tip":"Cajas: cada producto se divide por sus unidades por caja (las cargadas en el producto).",
    "gr.cell.tip":"= {u} unidades ({n} por caja)", "gr.th.incases":"cajas",
    "gr.cat.sum.c":"{n} productos · {u} cajas", "gr.cat.units.c":"DISPONIBLE (CAJAS)"
  };
  try{ Object.assign(I18N.en, EN); Object.assign(I18N.es, ES); }catch(e){ console.warn("grupo i18n", e); }
})();

let _gr = { estado:"", data:null, error:"", q:"", juego:"", emp:"", dep:"", idioma:"", sk:"", sd:"", hora:null };   // sk/sd: columna y sentido del orden (encabezados)

/* Última tabla recordada en este navegador (v90): al entrar se ve al instante lo último que se
   trajo y se actualiza sola en segundo plano. Una por usuario; si el navegador no deja guardar,
   funciona igual que antes (espera la carga). */
function _grCacheKey(){ return "gstock_grupo_v1:" + String((typeof session!=="undefined" && session && (session.user||session.name)) || ""); }
function _grCacheLeer(){
  if(_gr.data) return;
  try{
    const c = JSON.parse(localStorage.getItem(_grCacheKey())||"null");
    if(c && c.data && Array.isArray(c.data.apps)){ _gr.data = c.data; _gr.hora = c.hora ? new Date(c.hora) : null; _gr.estado = "ok"; }
  }catch(e){}
}
function _grCacheGuardar(){
  try{ localStorage.setItem(_grCacheKey(), JSON.stringify({ data:_gr.data, hora:_gr.hora ? _gr.hora.toISOString() : null })); }catch(e){}
}
function _grHora(d){
  if(!d) return "";
  const hoy = new Date(), mismoDia = d.toDateString()===hoy.toDateString();
  const h = d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  return mismoDia ? h : (fmtDate(isoLocalGr(d)) + " " + h);
}
function isoLocalGr(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

function _grNorm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }

/* ---- Ver como: Unidades / Cajas (v-cajas) ----
   Usa el mismo interruptor global que Panel y Productos (stockView), así la vista elegida
   se mantiene al cambiar de pantalla. El stock viaja siempre en UNIDADES; para pasarlo a
   cajas se divide por las "unidades por caja" del producto, que salen (en este orden) de:
     1) lo que mande el servidor en el producto (campo upc), si algún día lo manda;
     2) el producto de ESTA app con el mismo código o el mismo nombre (su ficha);
     3) otro producto del mismo grupo que sí lo tenga (es el mismo producto);
     4) el valor por defecto del juego (Pokémon 6, One Piece 12, ...). */
function _grEnCajas(){ try{ return typeof stockView!=="undefined" && stockView==="cases"; }catch(e){ return false; } }
function _grFmt(n){   // cantidad en la vista activa: cajas con hasta 2 decimales, unidades como siempre
  if(!_grEnCajas()) return qty(n);
  const v = Math.round((+n||0)*100)/100;
  try{ return nf0.format(v); }catch(e){ return String(v); }
}
function _grUpcLocal(){   // código / nombre -> unidades por caja, según los productos de esta app
  const m = { c:new Map(), n:new Map() };
  try{
    ((typeof db!=="undefined" && db && db.productos) || []).forEach(p=>{
      if(!p) return;
      const u = (typeof unitsPerCase==="function") ? unitsPerCase(p) : (+p.boxesPorCase||0);
      if(!(u>0)) return;
      const asoc = Array.isArray(p.skusAsoc) ? p.skusAsoc.map(x=> x && x.sku) : [];
      [p.sku, ...asoc].forEach(c=>{ c = String(c||"").trim().toLowerCase(); if(c && !m.c.has(c)) m.c.set(c, u); });
      const nn = _grNorm(p.nombre); if(nn && !m.n.has(nn)) m.n.set(nn, u);
    });
  }catch(e){}
  return m;
}
function _grUpcDefault(juego){ try{ const u = (typeof boxesCaseDefault==="function") ? boxesCaseDefault(juego) : 6; return u>0 ? u : 1; }catch(e){ return 6; } }

/* Junta los productos de todas las apps: mismo código (SKU o asociado) o mismo nombre. */
/* Agrupa los productos de las dos empresas (v91).
   Dos productos son "el mismo" si comparten algún código (SKU o código de proveedor) o tienen
   el mismo nombre normalizado. Se arma con unión de conjuntos sobre TODOS los productos a la vez,
   así el resultado no depende de qué empresa se procese primero: antes, cada app agrupaba
   arrancando por la suya y en algunos casos quedaban cantidades distintas (230 vs 229).
   Juego = la misma "línea" que se usa en Productos (sale del nombre), no la categoría. */
function grupoFilas(apps){
  const items = [];
  apps.forEach((a, ai)=> (a.productos||[]).forEach(p=> items.push({ ai, p,
    cods: [...new Set((p.codigos||[]).map(c=>String(c).trim().toLowerCase()).filter(Boolean))],
    n: _grNorm(p.nombre) })));
  // unidades por caja conocidas de cada producto (0 = todavía no se sabe; se resuelve por grupo)
  const upcLocal = _grUpcLocal();
  items.forEach(it=>{
    let u = +it.p.upc > 0 ? +it.p.upc : 0;
    if(!u){ const c = it.cods.find(c=> upcLocal.c.has(c)); if(c) u = upcLocal.c.get(c); }
    if(!u && it.n && upcLocal.n.has(it.n)) u = upcLocal.n.get(it.n);
    it.upc = u;
  });
  // unión de conjuntos (con compresión de caminos)
  const padre = items.map((_,i)=>i);
  const raiz = i=>{ while(padre[i]!==i){ padre[i]=padre[padre[i]]; i=padre[i]; } return i; };
  const unir = (a,b)=>{ a=raiz(a); b=raiz(b); if(a!==b) padre[Math.max(a,b)] = Math.min(a,b); };
  const primero = new Map();
  items.forEach((it,i)=>{
    const claves = it.cods.map(c=>"c:"+c); if(it.n) claves.push("n:"+it.n);
    claves.forEach(k=>{ if(primero.has(k)) unir(i, primero.get(k)); else primero.set(k, i); });
  });
  const grupos = new Map();
  items.forEach((it,i)=>{ const r=raiz(i); if(!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(it); });
  const lineaDe = nombre=>{ try{ if(typeof sagaDe==="function"){ const l=sagaDe({nombre}); if(l && l!=="—") return l; } }catch(e){} return ""; };
  const filas = [];
  grupos.forEach(lista=>{
    // nombre a mostrar: el de la propia empresa si está; si no, el primero
    const ref = lista.find(it=> it.ai===0) || lista[0];
    const f = { nombre:ref.p.nombre, sku:ref.p.sku, juego:"", idioma:ref.p.idioma, codigos:new Set(), idiomas:new Set(), stock:{}, transito:0, apps:new Set(),
                cajas:{}, transitoC:0, totalC:0, upc:0 };   // lo mismo, en cajas
    // unidades por caja del grupo: la de la propia empresa si se conoce; si no, la de cualquiera del grupo
    const upcG = (lista.find(it=> it.ai===0 && it.upc>0) || lista.find(it=> it.upc>0) || {}).upc || 0;
    lista.forEach(({ai,p,cods,upc})=>{
      const u = upc || upcG || _grUpcDefault(p.juego);
      if(!f.upc || ai===0) f.upc = u;                  // para el tooltip: la de la propia empresa si está
      cods.forEach(c=> f.codigos.add(c));
      Object.keys(p.stock||{}).forEach(d=>{ const k=ai+":"+d, n=(+p.stock[d]||0); f.stock[k]=(f.stock[k]||0)+n; f.cajas[k]=(f.cajas[k]||0)+n/u; });
      if(p.idioma) f.idiomas.add(String(p.idioma));
      f.transito += (+p.transito||0); f.transitoC += (+p.transito||0)/u;
      f.apps.add(ai);
    });
    f.juego = lineaDe(f.nombre) || lista.map(it=>lineaDe(it.p.nombre)).find(Boolean) || lista.map(it=>it.p.juego).find(Boolean) || "";
    f.total = Object.values(f.stock).reduce((a,b)=>a+b,0);
    f.totalC = Object.values(f.cajas).reduce((a,b)=>a+b,0);
    filas.push(f);
  });
  return filas.sort((a,b)=> String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{numeric:true}));
}

async function grupoCargar(){
  if(!session){ _gr.estado="local"; _grPintar(); return; }
  _gr.estado="cargando"; _gr.error=""; _grPintar();
  try{
    const f = (typeof apiFetch==="function") ? apiFetch : fetch;
    const r = await f(apiBase()+"/grupo/consolidado", { headers: authHeaders() });
    const j = await r.json().catch(()=>({}));
    if(!r.ok || !j.ok) throw new Error(j.error || ("HTTP "+r.status));
    _gr.data = j; _gr.estado="ok"; _gr.hora = new Date(); _grCacheGuardar();
  }catch(e){ _gr.estado="error"; _gr.error = String(e && e.message || e); }
  _grPintar();
}

function viewGrupo(){
  _grCacheLeer();                                  // muestra ya lo último y refresca atrás
  setTimeout(()=>{ if(_gr.estado!=="cargando") grupoCargar(); }, 0);
  return `<div class="head"><div class="title"><h2>${t("gr.title")} <span class="gr-badge">${(typeof ICO!=="undefined"&&ICO.view)||""}${t("gr.badge")}</span></h2>
    <p>${t("gr.sub")}</p></div>
    <div class="gr-acts"><button class="btn gr-ref" id="gr_refresh" title="${t("gr.refresh")}">${(typeof ICO!=="undefined"&&ICO.sync)||""}<span>${t("gr.refresh")}</span></button><button class="btn primary gr-cat" id="gr_cat" title="${t("gr.cat.tip")}">${(typeof ICO!=="undefined"&&ICO.pdf)||""}${t("gr.cat.btn")}</button></div></div>
    <div id="grupoHost"></div>`;
}

function _grPintar(){
  const host = document.getElementById("grupoHost"); if(!host) return;
  const rb = document.getElementById("gr_refresh"); if(rb){ rb.onclick = grupoCargar; rb.classList.toggle("is-loading", _gr.estado==="cargando"); }   // el ícono gira mientras actualiza
  const cb = document.getElementById("gr_cat"); if(cb){ cb.onclick = grupoCatalogoPDF; cb.disabled = !_gr.data; }
  if(_gr.estado==="local"){ host.innerHTML = `<div class="panel"><p class="hint" style="padding:18px;margin:0">${t("gr.local")}</p></div>`; return; }
  if(_gr.estado==="cargando" && !_gr.data){ host.innerHTML = `<div class="panel"><p class="hint" style="padding:18px;margin:0">${t("gr.loading")}</p></div>`; return; }
  if(_gr.estado==="error" && !_gr.data){
    host.innerHTML = `<div class="panel" style="padding:18px"><b>${t("gr.err")}</b><p class="hint">${esc(_gr.error)}</p><button class="btn" id="gr_retry">${t("gr.retry")}</button></div>`;
    document.getElementById("gr_retry").onclick = grupoCargar; return;
  }
  const apps = (_gr.data.apps||[]);
  const ok = apps.filter(a=> a && !a.error);
  const avisos = apps.filter(a=> a && a.error).map(a=> a.error==="no-config"
      ? `<div class="banner" style="white-space:normal">${t("gr.peer.off",{app:esc(a.app||"—")})}</div>`
      : `<div class="banner warn" style="white-space:normal">${t("gr.peer.err",{e:esc(a.error)})}</div>`).join("");
  // columnas: un depósito por app
  const cols = [];
  apps.forEach((a,ai)=>{ if(a && !a.error) (a.depositos||[]).forEach(d=> cols.push({ k:ai+":"+d.id, nombre: (a.depositos.length>1 ? d.nombre : (a.app||d.nombre)) })); });
  let filas = grupoFilas(apps.map(a=> (a && !a.error) ? a : { productos:[] }));
  const juegos = [...new Set(filas.map(f=>f.juego).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  const idiomas = [...new Set(filas.flatMap(f=>[...f.idiomas]))].sort();
  const appsOk = apps.map((a,ai)=>({ai, nombre:(a&&a.app)||"—"})).filter(x=> apps[x.ai] && !apps[x.ai].error);
  const hayTr0 = filas.some(f=>f.transito>0);
  const lblIdi = v => (typeof langLabel==="function") ? langLabel(v) : v;
  /* Vista activa (unidades / cajas): de acá salen las cantidades que se muestran, ordenan y suman.
     Los filtros ("Con stock en…") miran siempre las unidades: hay stock o no hay. */
  const enCajas = _grEnCajas();
  const vS  = (f,k)=> enCajas ? (f.cajas[k]||0) : (f.stock[k]||0);
  const vTr = f=> enCajas ? (f.transitoC||0) : (f.transito||0);
  const vTo = f=> enCajas ? (f.totalC||0) : (f.total||0);
  const tip = (f,u)=> enCajas ? ` title="${esc(t("gr.cell.tip",{u:qty(u), n:qty(f.upc||1)}))}"` : "";
  const q = _grNorm(_gr.q);
  filas = filas.filter(f=>{
    if(_gr.juego && f.juego!==_gr.juego) return false;
    if(_gr.emp==="ambas" && f.apps.size<2) return false;
    if(_gr.emp && _gr.emp!=="ambas"){ const ai=+_gr.emp; if(!(f.apps.size===1 && f.apps.has(ai))) return false; }
    if(_gr.dep==="__tr" && !(f.transito>0)) return false;
    if(_gr.dep && _gr.dep!=="__tr" && !(f.stock[_gr.dep]>0)) return false;
    if(_gr.idioma && !f.idiomas.has(_gr.idioma)) return false;
    if(q){ const h=_grNorm(f.nombre+" "+[...f.codigos].join(" ")); if(!q.split(" ").every(w=>h.includes(w))) return false; }
    return true;
  });
  /* Orden por columna (como el resto de las tablas): ↓ mayor primero / Z–A, ↑ menor primero / A–Z.
     Sin orden elegido, queda alfabético por nombre. */
  if(_gr.sk && _gr.sd){
    const dir = _gr.sd==="asc" ? 1 : -1;
    const val = f => _gr.sk==="nombre" ? String(f.nombre||"")
                  : _gr.sk==="juego"  ? String(f.juego||"")
                  : _gr.sk==="__tr"   ? vTr(f)
                  : _gr.sk==="total"  ? vTo(f)
                  : vS(f,_gr.sk);
    filas.sort((a,b)=>{ const va=val(a), vb=val(b);
      const c = typeof va==="number" ? va-vb : va.localeCompare(vb,"es",{numeric:true,sensitivity:"base"});
      return dir*c || String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{numeric:true}); });
  }
  const hayFiltro = !!(_gr.q||_gr.juego||_gr.emp||_gr.dep||_gr.idioma||_gr.sk);
  const th = (k, label, r)=>{
    const on = _gr.sk===k && _gr.sd;
    const arr = on ? (_gr.sd==="asc" ? "↑" : "↓") : "↕";
    return `<th class="sortable${r?" r":""}${on?(_gr.sd==="asc"?" sort-asc":" sort-desc"):""}" data-grsort="${esc(k)}" title="${esc(t("gr.sort.tip"))}" tabindex="0">${esc(label)}<span class="sarr">${arr}</span></th>`;
  };
  const opt = (v,l,cur)=>`<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(l)}</option>`;
  const tot = k => filas.reduce((a,f)=> a+vS(f,k), 0);
  const hayTr = filas.some(f=>f.transito>0);
  _gr.vistas = filas;   // lo que se ve (con filtros y orden): es lo que va al catálogo
  const cbt = document.getElementById("gr_cat"); if(cbt) cbt.disabled = false;
  const rows = filas.map(f=>{
    const cods=[...f.codigos];
    return `<tr>
      <td><b>${esc(f.nombre||"—")}</b>${cods.length?`<div class="hint" style="font-size:12px" title="${esc(t("gr.match.tip",{c:cods.join(", ")}))}">${cods.slice(0,3).map(c=>`<span class="sku">${esc(c.toUpperCase())}</span>`).join(" ")}${cods.length>3?" …":""}</div>`:""}</td>
      <td>${esc(f.juego||"—")}</td>
      ${cols.map(c=>`<td class="r num"${f.stock[c.k]?tip(f,f.stock[c.k]):""}>${f.stock[c.k]?_grFmt(vS(f,c.k)):'<span style="color:var(--muted)">—</span>'}</td>`).join("")}
      ${hayTr?`<td class="r num"${f.transito?tip(f,f.transito):""}>${f.transito?_grFmt(vTr(f)):'<span style="color:var(--muted)">—</span>'}</td>`:""}
      <td class="r num"${tip(f,f.total)}><b>${_grFmt(vTo(f))}</b></td>
    </tr>`;
  }).join("");
  const avisoViejo = (_gr.estado==="error" && _gr.error) ? `<div class="banner warn" style="white-space:normal">${t("gr.stale",{e:esc(_gr.error),t:_grHora(_gr.hora)})}</div>` : "";
  host.innerHTML = `${avisoViejo}${avisos}
    <div class="panel">
      <div class="phead" style="flex-wrap:wrap;row-gap:10px">
        <h3 style="white-space:nowrap">${t("gr.count",{n:filas.length})}</h3>
        <span class="hint" style="flex:1 1 auto;min-width:0">${_gr.hora?t("gr.updated",{t:_grHora(_gr.hora)}):""}${_gr.estado==="cargando"?`${_gr.hora?" · ":""}<span style="color:var(--accent-ink,var(--accent))">${t("gr.refreshing")}</span>`:""}</span>
        <div class="sb-viewas gr-viewas" role="group" aria-label="${esc(t("bar.viewas"))}" title="${esc(t("gr.view.tip"))}" style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap;margin-left:auto">
          <span class="sb-label" style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-right:4px;white-space:nowrap">${t("bar.viewas")}</span>
          <button type="button" class="chip-btn ${enCajas?"":"on"}" data-grview="units" aria-pressed="${!enCajas}">${t("bar.units")}</button>
          <button type="button" class="chip-btn ${enCajas?"on":""}" data-grview="cases" aria-pressed="${enCajas}">${t("bar.cases")}</button>
        </div>
      </div>
      <div class="filtros" style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;align-items:center">
        <input class="inp" id="gr_q" placeholder="${t("gr.ph.search")}" value="${esc(_gr.q)}" style="flex:2 1 240px;min-width:0">
        <select class="inp" id="gr_juego" style="flex:1 1 150px;min-width:0" title="${t("gr.th.game")}"><option value="">${t("gr.allgames")}</option>${juegos.map(j=>`<option ${j===_gr.juego?"selected":""}>${esc(j)}</option>`).join("")}</select>
        <select class="inp" id="gr_emp" style="flex:1 1 150px;min-width:0" title="${t("gr.f.emp")}">${opt("",t("gr.f.emp.all"),_gr.emp)}${appsOk.length>1?opt("ambas",t("gr.f.emp.both"),_gr.emp)+appsOk.map(x=>opt(String(x.ai),t("gr.f.emp.only",{app:x.nombre}),_gr.emp)).join(""):""}</select>
        <select class="inp" id="gr_dep" style="flex:1 1 150px;min-width:0" title="${t("gr.f.dep")}">${opt("",t("gr.f.dep.all"),_gr.dep)}${cols.map(c=>opt(c.k,c.nombre,_gr.dep)).join("")}${hayTr0?opt("__tr",t("gr.f.dep.tr"),_gr.dep):""}</select>
        ${idiomas.length?`<select class="inp" id="gr_idioma" style="flex:1 1 150px;min-width:0" title="${t("gr.f.lang")}">${opt("",t("gr.f.lang.all"),_gr.idioma)}${idiomas.map(i=>opt(i,lblIdi(i),_gr.idioma)).join("")}</select>`:""}
        ${hayFiltro?`<button class="btn" id="gr_clear" type="button">${t("gr.f.clear")}</button>`:""}
      </div>
      <div class="table-scroll"><table>
        <thead><tr>${th("nombre",t("gr.th.product"))}${th("juego",t("gr.th.game"))}${cols.map(c=>th(c.k,c.nombre,true)).join("")}${hayTr?th("__tr",t("gr.th.transit"),true):""}${th("total",t("gr.th.total")+(enCajas?" ("+t("gr.th.incases")+")":""),true)}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length+3+(hayTr?1:0)}" style="text-align:center;color:var(--muted);padding:18px">${t("gr.empty")}</td></tr>`}</tbody>
        ${filas.length?`<tfoot><tr><td colspan="2"><b>Total</b></td>${cols.map(c=>`<td class="r num"><b>${_grFmt(tot(c.k))}</b></td>`).join("")}${hayTr?`<td class="r num"><b>${_grFmt(filas.reduce((a,f)=>a+vTr(f),0))}</b></td>`:""}<td class="r num"><b>${_grFmt(filas.reduce((a,f)=>a+vTo(f),0))}</b></td></tr></tfoot>`:""}
      </table></div>
    </div>`;
  const qi=document.getElementById("gr_q");
  if(qi){ qi.oninput=()=>{ _gr.q=qi.value; const pos=qi.selectionStart; _grPintar(); const n=document.getElementById("gr_q"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } }; }
  [["gr_juego","juego"],["gr_emp","emp"],["gr_dep","dep"],["gr_idioma","idioma"]].forEach(([id,k])=>{
    const el=document.getElementById(id); if(el) el.onchange=()=>{ _gr[k]=el.value; _grPintar(); };
  });
  /* Ver como: cambia la vista global (la misma de Panel y Productos) y repinta sin volver a pedir datos */
  host.querySelectorAll("[data-grview]").forEach(b=> b.onclick = ()=>{
    const v = b.dataset.grview==="cases" ? "cases" : "units";
    try{ if(stockView===v) return; stockView = v; }catch(e){ return; }
    _grPintar();
  });
  const cl=document.getElementById("gr_clear"); if(cl) cl.onclick=()=>{ Object.assign(_gr,{q:"",juego:"",emp:"",dep:"",idioma:"",sk:"",sd:""}); _grPintar(); };
  /* Encabezados: 1er toque ordena, 2do invierte, 3ro saca el orden */
  host.querySelectorAll("th[data-grsort]").forEach(h=>{
    const go = ()=>{ const k=h.dataset.grsort;
      const first = (k==="nombre"||k==="juego") ? "asc" : "desc";   // texto arranca A–Z; cantidades, mayor primero
      if(_gr.sk!==k){ _gr.sk=k; _gr.sd=first; } else if(_gr.sd===first){ _gr.sd = first==="asc"?"desc":"asc"; } else { _gr.sk=""; _gr.sd=""; }
      _grPintar(); };
    h.onclick = go;
    h.onkeydown = e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } };
  });
}


/* ============================================================
   CATÁLOGO PDF del stock del grupo
   Producto + cantidad disponible (suma de depósitos, sin tránsito), dividido
   por juego. Toma lo que se ve con los filtros puestos y la vista elegida
   (unidades o cajas). NO lleva nombres de
   empresa ni de depósito, códigos, costos ni precios: es para mandar a clientes.
   Mismo diseño que el catálogo de productos (banda de color, filas alternadas,
   pie con página), con el color de la app.
   ============================================================ */
function _grColorApp(){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    let m = v.match(/^#([0-9a-f]{6})$/i);
    if(m) return [0,2,4].map(i=> parseInt(m[1].slice(i,i+2),16));
    m = v.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
    if(m) return [+m[1],+m[2],+m[3]];
  }catch(e){}
  return [37,99,235];
}
function _grTxt(v){   // la Helvetica del PDF sólo tiene Latin-1: lo demás se cambia o se saca
  let s = String(v==null?"":v).replace(/[→⟶➔➜]/g,">").replace(/[   ]/g," ").replace(/[‐-‒−]/g,"-");
  const extra = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  return s.split("").filter(ch=>{ const c=ch.charCodeAt(0); return (c>=32&&c<=126)||(c>=160&&c<=255)||extra.indexOf(ch)>=0; }).join("").replace(/\s+/g," ").trim();
}
function _grHoyIso(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function grupoCatalogoPDF(){
  if(typeof libFalta==="function" && libFalta("jspdf", ()=> grupoCatalogoPDF(), ()=> toast(t("gr.cat.err"),"warn"))) return;
  if(!(window.jspdf && window.jspdf.jsPDF)){ toast(t("gr.cat.err"),"warn"); return; }
  const filas = (_gr.vistas || []).filter(f=> (f.total||0) > 0);
  if(!filas.length){ toast(t("gr.cat.empty"),"warn"); return; }
  const otros = t("gr.cat.other");
  const grupos = {};
  filas.forEach(f=>{ const j = (f.juego && f.juego!=="—") ? f.juego : otros; (grupos[j] = grupos[j] || []).push(f); });
  const juegos = Object.keys(grupos).sort((a,b)=> a===otros ? 1 : b===otros ? -1 : a.localeCompare(b,"es",{sensitivity:"base"}));
  juegos.forEach(j=> grupos[j].sort((a,b)=> _grTxt(a.nombre).localeCompare(_grTxt(b.nombre),"es",{numeric:true,sensitivity:"base"})));
  const enCajas = _grEnCajas();                       // el catálogo sale en la vista que se está mirando
  const cant = f=> enCajas ? (f.totalC||0) : (f.total||0);
  const totU = filas.reduce((a,f)=> a+cant(f), 0);
  const nfmt = n=> _grFmt(n);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const ACC = _grColorApp(), INK=[26,26,26], MUT=[120,120,120], LINE=[228,225,220], ZEBRA=[248,247,245];
  const tint = ACC.map(c=> Math.round(c + (255-c)*0.88));
  const ink = c=> doc.setTextColor(c[0],c[1],c[2]);
  const hoy = (typeof fmtDate==="function") ? fmtDate(_grHoyIso()) : new Date().toLocaleDateString();

  /* Encabezado (sólo en la primera hoja) */
  doc.setFillColor(ACC[0],ACC[1],ACC[2]); doc.rect(0,0,W,84,"F");
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(20);
  doc.text(_grTxt(t("gr.cat.title")), M, 40);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
  doc.text(_grTxt(t("gr.cat.sub",{d:hoy})), M, 58);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(_grTxt(t(enCajas?"gr.cat.sum.c":"gr.cat.sum",{n:filas.length, u:nfmt(totU)})), W-M, 40, {align:"right"});

  let y = 108;
  ink(MUT); doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  const nota = doc.splitTextToSize(_grTxt(t("gr.cat.note")), W-2*M); doc.text(nota, M, y); y += nota.length*11 + 12;

  const xQ = W-M-8, wName = W-2*M-110, LIM = H-54;
  const cabecera = (yy)=>{   // títulos de columna
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); ink(MUT);
    doc.text(_grTxt(t("gr.cat.product")), M+8, yy); doc.text(_grTxt(t(enCajas?"gr.cat.units.c":"gr.cat.units")), xQ, yy, {align:"right"});
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.line(M, yy+5, W-M, yy+5);
    return yy + 18;
  };
  const tituloJuego = (j, sub, cont)=>{
    doc.setFillColor(tint[0],tint[1],tint[2]); doc.rect(M, y-13, W-2*M, 22, "F");
    doc.setFillColor(ACC[0],ACC[1],ACC[2]); doc.rect(M, y-13, 3, 22, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(10.5); ink(INK);
    doc.text(_grTxt(j + (cont?(" "+t("gr.cat.cont")):"")), M+10, y+2);
    doc.setFontSize(9); ink(MUT); doc.text(_grTxt(nfmt(sub)), xQ, y+2, {align:"right"});
    y += 22;
  };
  y = cabecera(y);
  juegos.forEach(j=>{
    const lista = grupos[j], sub = lista.reduce((a,f)=> a+cant(f), 0);
    if(y + 22 + 20 > LIM){ doc.addPage(); y = 52; y = cabecera(y); }
    tituloJuego(j, sub, false);
    let zebra = false;
    lista.forEach(f=>{
      doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
      const ls = doc.splitTextToSize(_grTxt(f.nombre||"—"), wName);
      const rowH = Math.max(18, ls.length*11.5 + 6);
      if(y - 12 + rowH > LIM){ doc.addPage(); y = 52; y = cabecera(y); tituloJuego(j, sub, true); zebra = false; }
      if(zebra){ doc.setFillColor(ZEBRA[0],ZEBRA[1],ZEBRA[2]); doc.rect(M, y-12, W-2*M, rowH, "F"); }
      zebra = !zebra;
      ink(INK); doc.text(ls, M+10, y+1);
      doc.setFont("helvetica","bold"); doc.text(_grTxt(nfmt(cant(f))), xQ, y+1, {align:"right"});
      y += rowH;
    });
    y += 8;
  });

  /* Pie en cada hoja */
  const n = doc.internal.getNumberOfPages();
  for(let i=1; i<=n; i++){
    doc.setPage(i);
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.line(M, H-36, W-M, H-36);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); ink(MUT);
    doc.text(_grTxt(t("gr.cat.title")+" · "+hoy), M, H-24);
    doc.text(_grTxt(t("gr.cat.page",{p:i, n})), W-M, H-24, {align:"right"});
  }
  const iso = _grHoyIso();
  doc.save(t("gr.cat.file")+"-"+iso+".pdf");
  toast(t("gr.cat.done",{n:filas.length}));
}
