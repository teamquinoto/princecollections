/* ============================================================
   Catálogo público — solo lectura + armado de pedido
   ------------------------------------------------------------
   · Datos: GET {API}/public/catalog (sin login). El Worker ya
     manda una lista filtrada: sin costos, precios ni SKU.
   · Pedido: vive en localStorage del cliente (nunca viaja al
     servidor). Se comparte como texto: copiar / WhatsApp / mail.
   · Cantidades: cada línea guarda su propia unidad (units/cases),
     así cambiar el toggle global no cambia el significado.
   ============================================================ */
const API_URL = (location.hostname==="localhost"||location.hostname==="127.0.0.1")
  ? "http://localhost:8787"
  : "https://mayor-stock-api.juanbautistacrespialomar.workers.dev";   // misma que js/01-core.js

const LS_CART="gcat_cart_v1", LS_LANG="gcat_lang", LS_VIEW="gcat_view", LS_THEME="gcat_theme", LS_WHO="gcat_who";

/* ---------- textos ---------- */
const TX = {
  en:{
    title:"Available stock", brandFallback:"Stock catalog",
    sub:"Live stock · checked at {t}", subLoading:"Loading…", subErr:"Couldn't load the stock",
    search:"Search products", units:"Units", cases:"Cases", all:"All",
    u1:"unit", un:"units", c1:"case", cn:"cases",
    inStock:"{n} in stock", soon:"Coming soon", soonQty:"+{n} coming soon", onlySoon:"{n} coming soon",
    add:"Add to order", review:"Review order", order:"Your order",
    over:"More than available — your seller will confirm", preorder:"pre-order",
    lang_JP:"JP", lang_ESP:"SP", lang_KOR:"KR", lang_EN:"EN",
    who:"Your name or store (optional)", note:"Note for your seller (optional)",
    cta:"Copy this and send it to your seller.", copy:"Copy order", copied:"Order copied — paste it to your seller",
    email:"Email", clear:"Clear order", cleared:"Order cleared", remove:"Remove",
    emptyCart:"Your order is empty. Add products from the catalog.",
    noMatch:"No products match", noMatchSub:"Try another search or game.",
    noStock:"No stock available right now", noStockSub:"Check back soon.",
    errBody:"Check your connection and reload the page.", retry:"Reload",
    msgHi:"Hi! I'd like to order:", msgFrom:"From", msgNote:"Note", msgLines:"{n} product(s)",
    subject:"Order request", removed:"{n} product(s) in your order are no longer listed and were removed",
    footer:"Stock is shown for reference and may change. Your seller confirms availability.",
    per:"{n} per case",
    unitsShort:"u", maxPer:"Max {n} per customer", maxHit:"Max {n} units per customer for this product",
    lessCase:"less than 1 case",
    msgOrder:"Order #{c}", msgFor:"For", yourSeller:"Your seller: {n}",
    soonLine:"Coming soon — not available to order yet", soonBtn:"Not available yet", maxOf:"max {n}",
    maxStock:"Only {n} {u} available", adjusted:"Stock changed: {n} product(s) in your order were adjusted to what's available"
  },
  es:{
    title:"Stock disponible", brandFallback:"Catálogo de stock",
    sub:"Stock en vivo · consultado a las {t}", subLoading:"Cargando…", subErr:"No se pudo cargar el stock",
    search:"Buscar productos", units:"Unidades", cases:"Cases", all:"Todos",
    u1:"unidad", un:"unidades", c1:"case", cn:"cases",
    inStock:"{n} en stock", soon:"Próximamente", soonQty:"+{n} próximamente", onlySoon:"{n} próximamente",
    add:"Agregar al pedido", review:"Ver pedido", order:"Tu pedido",
    over:"Más de lo disponible — tu vendedor lo confirma", preorder:"preventa",
    lang_JP:"JAP", lang_ESP:"ESP", lang_KOR:"COR", lang_EN:"ING",
    who:"Tu nombre o local (opcional)", note:"Nota para tu vendedor (opcional)",
    cta:"Copiá esto y mandáselo a tu vendedor.", copy:"Copiar pedido", copied:"Pedido copiado — pegáselo a tu vendedor",
    email:"Mail", clear:"Vaciar pedido", cleared:"Pedido vaciado", remove:"Quitar",
    emptyCart:"Tu pedido está vacío. Agregá productos del catálogo.",
    noMatch:"Ningún producto coincide", noMatchSub:"Probá con otra búsqueda o juego.",
    noStock:"Ahora no hay stock disponible", noStockSub:"Volvé a mirar en unos días.",
    errBody:"Revisá la conexión y recargá la página.", retry:"Recargar",
    msgHi:"¡Hola! Quiero pedir:", msgFrom:"De", msgNote:"Nota", msgLines:"{n} producto(s)",
    subject:"Pedido", removed:"{n} producto(s) de tu pedido ya no están publicados y se quitaron",
    footer:"El stock es de referencia y puede cambiar. Tu vendedor confirma la disponibilidad.",
    per:"{n} por case",
    unitsShort:"u", maxPer:"Máx. {n} por cliente", maxHit:"Máximo {n} unidades por cliente en este producto",
    lessCase:"menos de 1 case",
    msgOrder:"Pedido #{c}", msgFor:"Para", yourSeller:"Tu vendedor: {n}",
    soonLine:"Próximamente — todavía no se puede pedir", soonBtn:"Todavía no disponible", maxOf:"máx. {n}",
    maxStock:"Hay {n} {u} disponibles", adjusted:"Cambió el stock: {n} producto(s) de tu pedido se ajustaron a lo disponible"
  }
};
const qs = new URLSearchParams(location.search);
let LANG = (qs.get("lang")||"").toLowerCase();
if(!TX[LANG]){ try{ LANG = localStorage.getItem(LS_LANG)||"en"; }catch(e){ LANG="en"; } }
if(!TX[LANG]) LANG="en";
function t(k, v){ let s=(TX[LANG][k]!=null?TX[LANG][k]:TX.en[k])||k; if(v) for(const x in v) s=s.split("{"+x+"}").join(v[x]); return s; }

/* ---------- estado ---------- */
let DATA = { items:[], brand:"", updated_at:null };
let STATUS = "loading";          // loading | ok | error
let GAME = "";                    // filtro de juego ("" = todos)
let Q = "";
let VIEW = "units";
try{ VIEW = localStorage.getItem(LS_VIEW)==="cases" ? "cases" : "units"; }catch(e){}
let CART = {};                    // { id: {qty, unit:"u"|"c"} }
try{ CART = JSON.parse(localStorage.getItem(LS_CART)||"{}")||{}; }catch(e){ CART={}; }
/* v89: el código corto identifica el pedido cuando se carga la venta.
   v91: un solo link para todos (se sacó la firma por vendedor ?v=). */
function newOrderCode(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
let ORDER = "";
try{ ORDER = localStorage.getItem("gcat_order")||""; }catch(e){}
if(!/^[A-Z2-9]{4}$/.test(ORDER)){ ORDER = newOrderCode(); try{ localStorage.setItem("gcat_order", ORDER); }catch(e){} }
let WHO = { name:"", note:"" };
try{ WHO = Object.assign(WHO, JSON.parse(localStorage.getItem(LS_WHO)||"{}")); }catch(e){}

const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nf = n => new Intl.NumberFormat(LANG==="es"?"es-AR":"en-US",{maximumFractionDigits:2}).format(n);
function saveCart(){ try{ localStorage.setItem(LS_CART, JSON.stringify(CART)); }catch(e){} }
function saveWho(){ try{ localStorage.setItem(LS_WHO, JSON.stringify(WHO)); }catch(e){} }
function byId(id){ return DATA.items.find(p=>p.id===id); }

/* ---------- unidades / cases ---------- */
/* v88: en Cases se muestran cases ENTEROS + las unidades sueltas ("4 cases + 4 u"),
   nunca "4,67 cases". Si el servidor topeó el número (stockPlus), va con "+". */
function stockTxt(p, units, plus){
  const pl = plus ? "+" : "";
  if(VIEW!=="cases" || (p.upc||1)<=1) return `<b class="num">${nf(units)}${pl}</b> ${esc(unitWord("u", units))}`;
  const upc = p.upc||1, c = Math.floor(units/upc), r = Math.round((units - c*upc)*100)/100;
  if(plus) return c>0 ? `<b class="num">${nf(c)}+</b> ${esc(unitWord("c", c))}` : `<b class="num">${nf(units)}+</b> ${esc(unitWord("u", units))}`;
  if(c===0) return `<b class="num">${nf(r)}</b> ${esc(unitWord("u", r))} <small>(${esc(t("lessCase"))})</small>`;
  return `<b class="num">${nf(c)}</b> ${esc(unitWord("c", c))}${r>0?` + <b class="num">${nf(r)}</b> ${esc(t("unitsShort"))}`:""}`;
}
/* v92: el máximo que se puede pedir es lo que HAY (y el límite por cliente, si es menor).
   Nada de "tu vendedor confirma": no se puede cargar más de lo existente. */
function maxUnits(p){ if(!p || p.soon) return 0; const s = Math.floor(p.stock||0); return p.limit>0 ? Math.min(s, p.limit) : s; }
function maxQty(p, unit){ return Math.floor(maxUnits(p) / (unit==="c" ? (p.upc||1) : 1)); }
function hintTxt(p, line){
  return unitWord(line.unit, line.qty) + (line.unit==="c" ? " · " + t("per",{n:p.upc}) : "") + " · " + t("maxOf",{n:maxQty(p, line.unit)});
}
/* Stock viaja en UNIDADES; un case = upc unidades (misma regla que la app: boxesPorCase). */
function inView(p, units){ return VIEW==="cases" ? units/(p.upc||1) : units; }
function unitWord(unit, n){ return unit==="c" ? (n===1?t("c1"):t("cn")) : (n===1?t("u1"):t("un")); }
function qtyUnits(p, line){ return line.unit==="c" ? line.qty*(p.upc||1) : line.qty; }

/* ---------- colores de placeholder por juego ---------- */
const GAME_COLORS = {
  "Pokémon TCG":["#ffcb05","#1d3f8f"], "One Piece TCG":["#c8102e","#fff4e0"], "Magic":["#2c2420","#e8a33d"],
  "Dragon Ball":["#f47b20","#2a1204"], "Disney Lorcana":["#2e2257","#d8b86a"], "Yu-Gi-Oh!":["#5a2e17","#f2d27a"],
  "Digimon":["#1e6fd1","#fff"], "Flesh and Blood":["#6e1a1a","#e7c58a"], "Gundam Card Game":["#1f3a68","#ff5a47"],
  "Riftbound TCG":["#0f4c5c","#9ee6e0"]
};
function gameColors(g){
  if(GAME_COLORS[g]) return GAME_COLORS[g];
  let h=0; for(const ch of String(g)) h=(h*31+ch.charCodeAt(0))%360;
  return ["hsl("+h+" 45% 32%)","hsl("+h+" 70% 88%)"];
}
/* Etiqueta del placeholder: el código de set del nombre ("(B02)", "[GD05]", "OP-09");
   si no hay, las iniciales del juego. El juego ya está en el título del grupo. */
function codigoSet(p){
  const n = String(p.name||"");
  const m = n.match(/[\[(]([A-Z]{1,5}-?\d{1,3}[A-Z]?)[\])]/g);
  if(m && m.length) return m[m.length-1].slice(1,-1);
  const m2 = n.match(/\b([A-Z]{2,4}-?\d{2,3})\b/);
  if(m2) return m2[1];
  return String(p.game||"").split(/[\s-]+/).filter(w=>/^[A-Za-zÀ-ÿ]/.test(w)).slice(0,2).map(w=>w[0].toUpperCase()).join("") || "·";
}
function placeholder(p){
  const [bg,fg] = gameColors(p.game);
  return `<div class="ph" style="--ph-bg:${bg};--ph-fg:${fg}">
    <svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5"><rect x="30" y="8" width="52" height="72" rx="6" transform="rotate(12 56 44)"/><rect x="18" y="14" width="52" height="72" rx="6"/></g></svg>
    <span>${esc(codigoSet(p))}</span></div>`;
}
function media(p){
  if(!p.img) return placeholder(p);
  // Si la imagen falla, cae al placeholder del juego
  return `<img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="1">`;
}

/* ---------- pintado ---------- */
function paintStatic(){
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-lang]").forEach(b=> b.setAttribute("aria-pressed", String(b.dataset.lang===LANG)));
  document.querySelectorAll("[data-view]").forEach(b=>{ b.setAttribute("aria-pressed", String(b.dataset.view===VIEW)); b.textContent=t(b.dataset.view); });
  $("q").placeholder = t("search");
  $("heroTitle").textContent = t("title");
  const brand = DATA.brand || t("brandFallback");
  $("tbName").textContent = brand;
  document.title = brand + " — " + t("title");
  $("shTitle").textContent = t("order");
  $("ctaHint").textContent = t("cta");
  $("copyTxt").textContent = t("copy");
  $("mailTxt").textContent = t("email");
  $("clearBtn").textContent = t("clear");
  $("cartBtnTxt").textContent = t("review");
  $("foot").textContent = t("footer");
  if(STATUS==="loading") $("heroSub").textContent = t("subLoading");
  else if(STATUS==="error") $("heroSub").textContent = t("subErr");
  else {
    /* v102: mostramos cuándo SE CONSULTÓ el stock (el servidor lo calcula en el momento, con
       hasta 1 min de caché). Antes mostraba updated_at = la última vez que se guardó CUALQUIER
       cambio en la base (un cliente, un gasto…), que no es "la hora del stock". */
    const d = lastLoad ? new Date(lastLoad) : null;
    const when = d ? d.toLocaleTimeString(LANG==="es"?"es-AR":"en-US",{hour:"2-digit",minute:"2-digit",hour12:LANG!=="es"}) : "—";
    $("heroSub").textContent = t("sub",{t:when});
  }
}

function filtered(){
  const q = Q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return DATA.items.filter(p=>{
    if(GAME && p.game!==GAME) return false;
    if(q){
      const hay = (p.name+" "+p.game).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      if(!q.split(/\s+/).every(w=> hay.includes(w))) return false;
    }
    return true;
  });
}

function paintChips(){
  const counts = {};
  DATA.items.forEach(p=> counts[p.game]=(counts[p.game]||0)+1);
  const games = Object.keys(counts).sort((a,b)=>a.localeCompare(b));
  if(GAME && !counts[GAME]) GAME="";
  $("chips").innerHTML = [`<button class="chip" type="button" data-game="" aria-pressed="${!GAME}">${t("all")} <small>${DATA.items.length}</small></button>`]
    .concat(games.map(g=>`<button class="chip" type="button" data-game="${esc(g)}" aria-pressed="${GAME===g}"><span class="dot" style="background:${gameColors(g)[0]}"></span>${esc(g)} <small>${counts[g]}</small></button>`)).join("");
  $("chips").querySelectorAll("[data-game]").forEach(b=> b.onclick=()=>{ GAME=b.dataset.game; paintChips(); paintList(); });
}

function tileHTML(p){
  const line = CART[p.id];
  /* v92: con stock → sólo su stock (nada del tránsito). En tránsito → "Próximamente",
     foto apagada con franja cruzada y SIN poder elegir cantidades. */
  let stockHTML;
  if(p.soon) stockHTML = `<span class="tr">${esc(t("soonLine"))}</span>`;
  else {
    stockHTML = `<span>${stockTxt(p, p.stock, false)}</span>`;
    if(p.limit>0) stockHTML += `<span class="lim">${esc(t("maxPer",{n:p.limit}))}</span>`;
  }
  const badges = p.lang ? `<span class="badge">${esc(t("lang_"+p.lang))}</span>` : "";
  let ctrl;
  if(p.soon) ctrl = `<button class="add" type="button" disabled aria-disabled="true">${esc(t("soonBtn"))}</button>`;
  else if(!line) ctrl = `<button class="add" type="button" data-add="${esc(p.id)}">${esc(t("add"))}</button>`;
  else {
    const mx = maxQty(p, line.unit), atMax = line.qty >= mx;
    ctrl = `<div class="stepper">
        <button type="button" data-dec="${esc(p.id)}" aria-label="−">−</button>
        <input class="num" inputmode="numeric" value="${line.qty}" data-qty="${esc(p.id)}" aria-label="${esc(t("order"))}">
        <button type="button" data-inc="${esc(p.id)}" aria-label="+" ${atMax?"disabled":""}>+</button>
      </div>
      <div class="unit-hint">${esc(hintTxt(p, line))}</div>`;
  }
  return `<article class="tile${line?" in-cart":""}${p.soon?" soon":""}">
    <div class="media${p.soon?" is-soon":""}" data-ph="${esc(placeholder(p))}">${media(p)}<div class="badges">${badges}</div>${p.soon?`<div class="ribbon" aria-hidden="true">${esc(t("soon"))}</div>`:""}</div>
    <div class="body">
      <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="stock">${stockHTML}</div>
      ${ctrl}
    </div>
  </article>`;
}

function paintList(){
  const el = $("list");
  if(STATUS==="loading"){ el.innerHTML = `<div class="group"><div class="grid">${"<div class='skel'></div>".repeat(8)}</div></div>`; return; }
  if(STATUS==="error"){ el.innerHTML = `<div class="empty"><strong>${esc(t("subErr"))}</strong>${esc(t("errBody"))}<p><button class="btn" style="margin:14px auto 0;padding:0 18px" data-retry>${esc(t("retry"))}</button></p></div>`; return; }
  if(!DATA.items.length){ el.innerHTML = `<div class="empty"><strong>${esc(t("noStock"))}</strong>${esc(t("noStockSub"))}</div>`; return; }
  const list = filtered();
  if(!list.length){ el.innerHTML = `<div class="empty"><strong>${esc(t("noMatch"))}</strong>${esc(t("noMatchSub"))}</div>`; return; }
  const groups = {};
  list.forEach(p=> (groups[p.game]=groups[p.game]||[]).push(p));
  Object.values(groups).forEach(g=> g.sort((a,b)=> (a.soon?1:0)-(b.soon?1:0)));   // v92: los "Próximamente" al final
  el.innerHTML = Object.keys(groups).sort((a,b)=>a.localeCompare(b)).map(g=>
    `<section class="group"><h2>${esc(g)} <small>${groups[g].length}</small></h2><div class="grid">${groups[g].map(tileHTML).join("")}</div></section>`
  ).join("");
}

/* ---------- pedido ---------- */
function setQty(id, qty, unit){
  qty = Math.max(0, Math.floor(Number(qty)||0));
  unit = unit || (CART[id] && CART[id].unit) || (VIEW==="cases"?"c":"u");
  const p = byId(id);
  if(!p || p.soon){ delete CART[id]; saveCart(); refreshAll(); return; }
  // v92: tope = stock existente (y límite por cliente). Si ni un case entra, pasa a unidades.
  if(qty>0){
    if(unit==="c" && maxQty(p,"c") < 1) unit = "u";
    const mx = maxQty(p, unit);
    if(qty > mx){ qty = mx; toast(p.limit>0 && p.limit < Math.floor(p.stock) ? t("maxHit",{n:p.limit}) : t("maxStock",{n:mx, u:unitWord(unit, mx)})); }
  }
  if(!qty){ delete CART[id]; }
  else CART[id] = { qty, unit };
  saveCart(); refreshAll();
}
function cartLines(){ return Object.keys(CART).map(id=>({ p:byId(id), line:CART[id] })).filter(x=> x.p); }

function paintCartBtn(){
  const n = cartLines().length;
  $("cartBtn").hidden = n===0;
  $("cartCount").textContent = n;
}

function buildMessage(){
  const lines = cartLines();
  const out = [t("msgOrder",{c:ORDER}), "", t("msgHi"), ""];
  lines.forEach(({p,line})=>{
    let q = line.qty+" "+unitWord(line.unit, line.qty);
    if(line.unit==="c") q += " ("+nf(line.qty*(p.upc||1))+" "+unitWord("u",line.qty*(p.upc||1))+")";
    const lang = p.lang ? " ["+t("lang_"+p.lang)+"]" : "";
    out.push("• "+q+" — "+p.name+lang);
  });
  out.push("");
  out.push(t("msgLines",{n:lines.length}));
  if(WHO.name.trim()) out.push(t("msgFrom")+": "+WHO.name.trim());
  if(WHO.note.trim()) out.push(t("msgNote")+": "+WHO.note.trim());
  return out.join("\n");
}

function paintSheet(){
  const lines = cartLines();
  const body = $("shBody");
  $("shFoot").style.display = lines.length ? "" : "none";
  if(!lines.length){ body.innerHTML = `<div class="empty" style="padding:40px 0">${esc(t("emptyCart"))}</div>`; return; }
  body.innerHTML = lines.map(({p,line})=>{
    const atMax = line.qty >= maxQty(p, line.unit);
    return `<div class="line">
      <div><div class="ln">${esc(p.name)}</div><div class="lg">${esc(p.game)}${p.lang?" · "+esc(t("lang_"+p.lang)):""}</div><div class="lg">${esc(t("maxOf",{n:maxQty(p, line.unit)}))} ${esc(unitWord(line.unit, maxQty(p, line.unit)))}</div></div>
      <div></div>
      <div class="ctrl">
        <div class="mini-step">
          <button type="button" data-dec="${esc(p.id)}" aria-label="−">−</button>
          <input class="num" inputmode="numeric" value="${line.qty}" data-qty="${esc(p.id)}" aria-label="${esc(p.name)}">
          <button type="button" data-inc="${esc(p.id)}" aria-label="+" ${atMax?"disabled":""}>+</button>
        </div>
        <div class="seg sm" role="group">
          <button type="button" data-unit="u" data-uid="${esc(p.id)}" aria-pressed="${line.unit==="u"}">${esc(t("units"))}</button>
          <button type="button" data-unit="c" data-uid="${esc(p.id)}" aria-pressed="${line.unit==="c"}">${esc(t("cases"))}</button>
        </div>
        <button class="rm" type="button" data-rm="${esc(p.id)}">${esc(t("remove"))}</button>
      </div>
    </div>`;
  }).join("") + `
    <div class="field"><label for="who">${esc(t("who"))}</label><input id="who" value="${esc(WHO.name)}" autocomplete="organization"></div>
    <div class="field"><label for="note">${esc(t("note"))}</label><textarea id="note">${esc(WHO.note)}</textarea></div>
    <div class="preview" id="preview">${esc(buildMessage())}</div>`;
  $("who").oninput = e=>{ WHO.name=e.target.value; saveWho(); $("preview").textContent=buildMessage(); };
  $("note").oninput = e=>{ WHO.note=e.target.value; saveWho(); $("preview").textContent=buildMessage(); };
}

function refreshAll(){
  paintStatic(); paintList(); paintCartBtn();
  if($("sheet").classList.contains("open")) paintSheet();
}

/* Delegación de eventos: tiles y panel comparten los mismos data-attrs */
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-add],[data-inc],[data-dec],[data-rm],[data-unit]");
  if(!b) return;
  if(b.dataset.add){ const p = byId(b.dataset.add); const u = (VIEW==="cases" && maxQty(p,"c")>=1) ? "c" : "u"; setQty(b.dataset.add, 1, u); return; }
  if(b.dataset.inc){ setQty(b.dataset.inc, (CART[b.dataset.inc]?.qty||0)+1); return; }
  if(b.dataset.dec){ setQty(b.dataset.dec, (CART[b.dataset.dec]?.qty||0)-1); return; }
  if(b.dataset.rm){ setQty(b.dataset.rm, 0); return; }
  if(b.dataset.unit){ const id=b.dataset.uid; if(CART[id]){ setQty(id, CART[id].qty, b.dataset.unit); } }
});
/* v91: la cantidad escrita a mano se toma MIENTRAS se escribe (antes había que apretar
   Enter o salir del campo). No se repinta la grilla mientras tipeás para no perder el foco:
   se actualizan en el lugar el pedido, el texto de unidad y el contador. Al salir del campo
   se repinta todo (y ahí también se aplica el límite por cliente con su aviso). */
function setQtyLive(inp){
  const id = inp.dataset.qty, p = byId(id), line = CART[id]; if(!p || !line) return;
  const raw = String(inp.value).trim(); if(raw==="") return;          // campo vacío mientras se borra: esperar
  let qty = Math.max(0, Math.floor(Number(raw.replace(",", "."))||0)); if(!qty) return;
  const mx = maxQty(p, line.unit);
  if(qty>mx){ qty = mx; inp.value = mx; }   // no deja pasar lo existente ni mientras se escribe
  line.qty = qty; saveCart();
  document.querySelectorAll(`[data-qty="${CSS.escape(id)}"]`).forEach(x=>{
    if(x!==inp) x.value = qty;
    const hint = x.closest(".body") && x.closest(".body").querySelector(".unit-hint");
    if(hint) hint.textContent = hintTxt(p, line);
    const inc = x.parentNode && x.parentNode.querySelector("[data-inc]"); if(inc) inc.disabled = qty >= mx;
  });
  paintCartBtn();
  const pv = $("preview"); if(pv) pv.textContent = buildMessage();
}
document.addEventListener("input", e=>{ const i = e.target.closest("[data-qty]"); if(i) setQtyLive(i); });
document.addEventListener("change", e=>{
  const i = e.target.closest("[data-qty]");
  if(i) setQty(i.dataset.qty, i.value === "" ? (CART[i.dataset.qty]||{}).qty : i.value);
});
// Al entrar al campo se selecciona el número: escribir "20" reemplaza el "1" (antes quedaba "120")
// (al soltar el clic el navegador deselecciona: el primer mouseup después de enfocar se ignora)
document.addEventListener("focusin", e=>{ const i = e.target.closest("[data-qty]"); if(i){ i._sel = true; i.select(); } });
document.addEventListener("mouseup", e=>{ const i = e.target.closest && e.target.closest("[data-qty]"); if(i && i._sel){ e.preventDefault(); i._sel = false; i.select(); } });
document.addEventListener("focusout", e=>{ const i = e.target.closest && e.target.closest("[data-qty]"); if(i) i._sel = false; });
document.addEventListener("keydown", e=>{ const i = e.target.closest && e.target.closest("[data-qty]"); if(i && e.key==="Enter") i.blur(); });

function openSheet(){ paintSheet(); $("sheet").classList.add("open"); $("scrim").classList.add("open"); $("sheet").setAttribute("aria-hidden","false"); setTimeout(()=>$("shClose").focus(),50); }
function closeSheet(){ $("sheet").classList.remove("open"); $("scrim").classList.remove("open"); $("sheet").setAttribute("aria-hidden","true"); $("cartBtn").focus(); }
$("cartBtn").onclick = openSheet;
$("shClose").onclick = closeSheet;
$("scrim").onclick = closeSheet;
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && $("sheet").classList.contains("open")) closeSheet(); });

let toastT;
function toast(msg){ const el=$("toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove("show"), 2600); }

async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch(e){
    // Fallback para navegadores sin API de portapapeles
    const ta=document.createElement("textarea"); ta.value=txt; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand("copy"); }catch(_){}
    ta.remove(); return ok;
  }
}
$("copyBtn").onclick = async ()=>{ if(await copyText(buildMessage())) toast(t("copied")); };
$("waBtn").onclick = ()=>{ window.open("https://wa.me/?text="+encodeURIComponent(buildMessage()), "_blank", "noopener"); };
$("mailBtn").onclick = ()=>{ location.href = "mailto:?subject="+encodeURIComponent(t("subject")+" #"+ORDER+(WHO.name.trim()?" — "+WHO.name.trim():""))+"&body="+encodeURIComponent(buildMessage()); };
$("clearBtn").onclick = ()=>{ CART={}; saveCart(); ORDER = newOrderCode(); try{ localStorage.setItem("gcat_order", ORDER); }catch(e){} refreshAll(); closeSheet(); toast(t("cleared")); };

/* ---------- controles globales ---------- */
document.querySelectorAll("[data-lang]").forEach(b=> b.onclick=()=>{ LANG=b.dataset.lang; try{localStorage.setItem(LS_LANG,LANG);}catch(e){} paintChips(); refreshAll(); });
document.querySelectorAll("[data-view]").forEach(b=> b.onclick=()=>{ VIEW=b.dataset.view; try{localStorage.setItem(LS_VIEW,VIEW);}catch(e){} refreshAll(); });
let qT; $("q").oninput = e=>{ clearTimeout(qT); qT=setTimeout(()=>{ Q=e.target.value; paintList(); }, 120); };
$("themeBtn").onclick = ()=>{
  const dark = document.documentElement.getAttribute("data-theme")==="dark";
  document.documentElement.setAttribute("data-theme", dark?"light":"dark");
  try{ localStorage.setItem(LS_THEME, dark?"light":"dark"); }catch(e){}
};

/* ---------- carga ---------- */
let lastLoad = 0;
async function load(){
  if(!DATA.items.length){ STATUS="loading"; refreshAll(); }
  try{
    const r = await fetch(API_URL.replace(/\/+$/,"")+"/public/catalog", { cache:"no-store" });
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j = await r.json();
    DATA = { items:Array.isArray(j.items)?j.items:[], brand:j.brand||"", updated_at:j.updated_at||null };
    STATUS = "ok"; lastLoad = Date.now();
    // Quitar del pedido lo que ya no está publicado
    const gone = Object.keys(CART).filter(id=> !byId(id) || byId(id).soon);
    if(gone.length){ gone.forEach(id=> delete CART[id]); saveCart(); toast(t("removed",{n:gone.length})); }
    // v92: si el stock bajó desde que armaste el pedido, se ajusta a lo que hay ahora
    let ajust = 0;
    Object.keys(CART).forEach(id=>{ const p = byId(id), L = CART[id];
      if(L.unit==="c" && maxQty(p,"c")<1){ L.unit="u"; }
      const mx = maxQty(p, L.unit); if(L.qty > mx){ ajust++; if(mx>0) L.qty = mx; else delete CART[id]; } });
    if(ajust){ saveCart(); toast(t("adjusted",{n:ajust})); }
  }catch(e){
    console.warn("catalog load fail", e);
    if(!DATA.items.length) STATUS = "error";
  }
  paintChips(); refreshAll();
}
// Si el cliente vuelve a la pestaña después de un rato, refrescamos el stock
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && Date.now()-lastLoad > 3*60*1000) load(); });
// v102: con la página abierta y a la vista, se refresca sola cada 2 minutos
setInterval(()=>{ if(!document.hidden) load(); }, 2*60*1000);

paintStatic();
load();

/* v96 · Blindaje (CSP): nada de código escrito dentro del HTML (onclick/onerror).
   Los mismos comportamientos, con listeners. */
document.addEventListener("error", e=>{
  const img = e.target;
  if(img && img.tagName==="IMG" && img.dataset.fallback && img.parentNode && img.parentNode.dataset.ph!=null){
    img.outerHTML = img.parentNode.dataset.ph;
  }
}, true);
document.addEventListener("click", e=>{
  const b = e.target.closest && e.target.closest("[data-retry]");
  if(b){ e.preventDefault(); load(); }
});
