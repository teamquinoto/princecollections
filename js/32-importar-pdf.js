/* ============================================================
   IMPORTAR PDF
   ============================================================ */
let pdfLines = [];   // líneas de texto reconstruidas
/* v121: modal rediseñado. Antes de elegir: texto + zona para soltar el PDF.
   Con la factura cargada: la zona se achica a una barra (archivo · estado · Cambiar),
   arriba los datos de la factura y el cuadre, y "Continuar" pasa al pie del modal. */
function openImport(){
  buildModal(t("imp.title"), `
    <p class="imp-intro">${t("imp.intro")}</p>
    <div class="drop" id="drop" role="button" tabindex="0">
      <div class="di">${ICO.importpdf}</div>
      <p><span class="fn">${t("imp.choosepdf")}</span> ${t("imp.ordrag")}</p>
      <p class="u-fs-xs">${t("imp.hint")}</p>
    </div>
    <input type="file" id="iaInput" accept="application/pdf" hidden>
    <div class="imp-fbar" id="impFile" hidden></div>
    <div id="importOut"></div>
  `,[{label:t("common.close"),cls:"btn",act:closeModal}], true);

  const drop=document.getElementById("drop"), input=document.getElementById("iaInput");
  const elegir=f=>{ if(f) handlePdfIA(f); };
  drop.onclick=()=>input.click();
  drop.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); input.click(); } };
  input.onchange=()=>{ elegir(input.files[0]); input.value=""; };   // value="" → se puede volver a elegir el mismo
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
  drop.addEventListener("drop",e=>{ elegir(e.dataTransfer.files[0]); });
}
/* Barra del archivo elegido. estado: "reading" | "local" | "ai" | "" */
function impArchivo(file, estado){
  const bar=document.getElementById("impFile"), drop=document.getElementById("drop");
  if(!bar) return;
  drop.hidden=true; bar.hidden=false;
  const pill = estado==="local" ? `<span class="imp-pill pos">${t("imp.st.local")}</span>`
             : estado==="ai"    ? `<span class="imp-pill ai">${t("imp.st.ai")}</span>`
             : estado==="reading" ? `<span class="imp-pill">${t("imp.st.reading")}</span>` : "";
  bar.innerHTML=`${ICO.pdf}<span class="imp-fname" title="${esc(file.name)}">${esc(file.name)}</span>${pill}`+
    `<button type="button" class="btn ghost sm" id="impCambiar">${t("imp.change")}</button>`;
  document.getElementById("impCambiar").onclick=()=> document.getElementById("iaInput").click();
}
/* "Continuar" vive en el pie del modal (al lado de Cerrar). */
function impContinuar(onClick){
  const viejo=document.getElementById("toDraft"); if(viejo) viejo.remove();
  if(!onClick) return;
  const foot=document.getElementById("mfoot"); if(!foot) return;
  const der=foot.lastElementChild || foot;
  const b=document.createElement("button");
  b.type="button"; b.className="btn primary"; b.id="toDraft"; b.textContent=t("imp.continue");
  b.onclick=onClick; der.appendChild(b);
}

/* Leer factura con Gemini (vía el Worker). Reusa el mismo editor de revisión que la detección local. */
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(String(r.result).split(",")[1]||"");
    r.onerror=()=>rej(new Error(t("imp.err.readfile")));
    r.readAsDataURL(file);
  });
}
/* v119 · Lectura en 2 pasos (antes: siempre IA, 30-45 s por factura).
   1) LOCAL (~1 s): pdf.js saca el texto y el parser estructurado arma las líneas. Si la
      lectura CUADRA (cada línea: cantidad × precio = importe, y la suma + flete = total de
      la factura), se usa directo, sin IA. Es el mismo control que haría un auditor.
   2) IA sólo si no cuadra o el PDF no tiene texto (escaneado). Si hay texto, se manda el
      TEXTO (mucho más liviano que el PDF); si la IA no saca líneas, se reintenta con el PDF. */
async function extraerLineasPdf(file){
  await libCargar("pdfjs");
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let lines=[];
  for(let pn=1; pn<=pdf.numPages; pn++){
    const page=await pdf.getPage(pn);
    const tc=await page.getTextContent();
    lines = lines.concat(reconstructLines(tc.items));
  }
  return lines.filter(l=>l.trim().length);
}
/* Importes que aparecen después de la palabra "total" (Sales Total, Total (USD), Subtotal…) */
function totalesDelTexto(blob){
  const out=[], re=/total\b[^\d\n]{0,25}?(\d[\d.,]*)/gi; let m;
  while((m=re.exec(blob))){ const n=parseNum(m[1]); if(n>0) out.push(n); }
  return out;
}
/* v120: devuelve { ok, suma, total }. suma = líneas + flete + handling (cargos). */
function cuadreLectura(parsed, lines){
  const r={ ok:false, suma:0, total:0 };
  if(!parsed || !parsed.items.length) return r;
  const m=parsed.meta||{};
  const lineas = parsed.items.reduce((a,it)=>a+(it.ext||0),0);
  r.suma = Math.round((lineas + (m.flete||0) + (m.handling||0))*100)/100;
  const tots = totalesDelTexto((lines||[]).join("\n"));
  r.total = tots.length ? Math.max(...tots) : 0;
  const lineasOk = parsed.items.every(it=> it.cantidad>0 &&
    Math.abs(it.cantidad*it.costo - it.ext) <= Math.max(0.02, Math.abs(it.ext)*0.001));
  r.ok = lineasOk && tots.some(T=> Math.abs(T-r.suma)<=0.02 || Math.abs(T-lineas)<=0.02);
  return r;
}
function lecturaLocalCuadra(parsed, lines){
  return !!parsed && parsed.mode==="estructurado" && cuadreLectura(parsed, lines).ok;
}
/* Cuadre de la lectura: verde si cierra contra el total; ámbar con la diferencia si no. */
function htmlCuadre(c, conBotonIA){
  if(!c) return "";
  if(c.ok) return `<div class="banner pos">${ICO.check}<span>${t("imp.cuadra",{total:money(c.total||c.suma)})}</span></div>`;
  const dif = Math.round(((c.total||0)-(c.suma||0))*100)/100;
  const txt = c.total ? t("imp.nocuadra",{sum:money(c.suma), total:money(c.total), diff:money(dif)}) : t("imp.nocuadra.sintotal");
  return `<div class="banner warn imp-nocuadra">${ICO.warn}<span>${txt}</span>`+
    (conBotonIA ? `<button type="button" class="btn sm" id="impLeerIA">${ICO.sparkle}${t("imp.btn.ai")}</button>` : "")+`</div>`;
}
function textoParaIA(lines){
  const txt=(lines||[]).join("\n");
  return txt.replace(/\s/g,"").length>=150 ? txt.slice(0,60000) : "";
}
async function pedirIA(cuerpo){
  const res=await apiFetch(apiBase()+"/parse-invoice",{ method:"POST", headers:authHeaders(), body:JSON.stringify(cuerpo) });
  let j=null; try{ j=await res.json(); }catch(_){}
  return { res, j: j||{} };
}
async function handlePdfIA(file, forzarIA){
  const out=document.getElementById("importOut");
  impContinuar(null);
  if(!session){ out.innerHTML=`<div class="banner warn">${t("imp.needlogin")}</div>`; return; }

  // ---- 1) Lectura local ----
  impArchivo(file, "reading");
  out.innerHTML=`<p class="ai-reading">${ICO.sparkle}<span>${t("imp.reading.local",{file:esc(file.name)})}</span></p>`;
  let lines=null;
  try{
    lines = await extraerLineasPdf(file);
    const parsed = parseInvoice(lines);
    if(!forzarIA && parsed.mode==="estructurado" && parsed.items.length){
      // v120: formato reconocido. Si cuadra, listo; si no, se muestra igual AL INSTANTE con la
      // diferencia a la vista y la opción de leerla con IA (antes: 30 s de espera sin explicación).
      pdfLines = lines;
      parsed.cuadre = cuadreLectura(parsed, lines);
      parsed.leerConIA = ()=> handlePdfIA(file, true);
      impArchivo(file, "local");
      showImportEditor(file.name, parsed);
      return;
    }
  }catch(e){ console.warn("lectura local:", e); lines=null; }

  // ---- 2) IA (con contador de segundos para que se vea que avanza) ----
  const t0=Date.now();
  out.innerHTML=`<p class="ai-reading">${ICO.sparkle}<span>${t("imp.reading.ai",{file:esc(file.name)})}</span><span class="u-muted" id="iaSecs"></span></p>`;
  const reloj=setInterval(()=>{
    const el=document.getElementById("iaSecs");
    if(el) el.textContent=" · "+Math.round((Date.now()-t0)/1000)+" s"; else clearInterval(reloj);
  },1000);
  try{
    let r=null;
    const texto=textoParaIA(lines);
    if(texto){
      r=await pedirIA({ texto });
      const sinLineas = r.res.ok && r.j.ok && !(r.j.data && Array.isArray(r.j.data.lineas) && r.j.data.lineas.length);
      const workerViejo = r.res.status===400 && /missing 'pdf'/.test(String(r.j.error||""));
      if(sinLineas || workerViejo) r=null;          // se reintenta con el PDF
    }
    if(!r){
      const b64=await fileToBase64(file);
      r=await pedirIA({ pdf:b64, mime:file.type||"application/pdf" });
    }
    const { res, j }=r;
    if(!res.ok || !j.ok){
      const det = esc(srvErrText(j,res.status));
      impArchivo(file,"");
      out.innerHTML=`<div class="banner warn">${t("imp.err.ai",{det})}</div>`;
      return;
    }
    const d=j.data||{};
    const lineas=Array.isArray(d.lineas)?d.lineas:[];
    if(!lineas.length){
      impArchivo(file,"");
      out.innerHTML=`<div class="banner warn">${t("imp.err.nolines")}</div>`;
      return;
    }
    // adaptar a la estructura que consume showImportEditor
    const parsed={
      meta:{ numero:d.numero||"", fecha:normFechaIA(d.fecha), proveedor:d.proveedor||"", flete:parseNum(d.flete)||0,
             handling:parseNum(d.cargos)||0, moneda:d.moneda||"" },
      items:lineas.map(l=>({
        sku:(l.sku||"").toString().trim(),
        desc:(l.nombre||"").toString().trim(),
        cantidad:parseNum(l.cantidad),
        costo:parseNum(l.precio),
        msrp:parseNum(l.msrp)||0,
        ext:parseNum(l.cantidad)*parseNum(l.precio),
        raw:""
      })).filter(it=>it.desc),
      mode:"ia"
    };
    pdfLines = (lines && lines.length) ? lines : [t("imp.rawai")];
    if(j.cuadra===true || j.cuadra===false) parsed.cuadre = { ok:j.cuadra, suma:j.suma||0, total:j.total||0 };
    impArchivo(file, "ai");
    showImportEditor(file.name, parsed);
  }catch(e){
    console.error(e);
    impArchivo(file,"");
    out.innerHTML=`<div class="banner warn">${t("imp.err.aifail",{err:esc(e.message||"error")})}</div>`;
  }finally{
    clearInterval(reloj);
  }
}
/* Normaliza fecha devuelta por la IA a YYYY-MM-DD si viene en otro formato reconocible */
/* La IA devuelve YYYY-MM-DD; si igual manda otro formato, se lee como americano (MM/DD/YYYY). */
function normFechaIA(f){
  if(!f) return "";
  return normISO(f) || String(f).trim();
}

async function handlePdf(file){
  const out=document.getElementById("importOut");
  try{ await libCargar("pdfjs"); }   // v114: el lector de PDF se baja recién acá
  catch(e){ out.innerHTML=`<div class="banner warn">${t("imp.err.noreader")}</div>`; return; }
  out.innerHTML=`<p style="color:var(--muted);padding:14px 0">${t("imp.reading.local",{file:esc(file.name)})}</p>`;
  try{
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let lines=[];
    for(let pn=1; pn<=pdf.numPages; pn++){
      const page=await pdf.getPage(pn);
      const tc=await page.getTextContent();
      lines = lines.concat(reconstructLines(tc.items));
    }
    pdfLines = lines.filter(l=>l.trim().length);
    const parsed = parseInvoice(pdfLines);
    showImportEditor(file.name, parsed);
  }catch(e){
    console.error(e);
    out.innerHTML=`<div class="banner warn">${t("imp.err.localfail",{err:esc(e.message||"error")})}</div>`;
  }
}

/* Reconstruir líneas por coordenada Y */
function reconstructLines(items){
  const rows=new Map();
  for(const it of items){
    if(!it.str || !it.str.trim()) continue;
    const y=Math.round(it.transform[5]);
    let bucket=null;
    for(const k of rows.keys()){ if(Math.abs(k-y)<=3){ bucket=k; break; } }
    const key = bucket===null ? y : bucket;
    if(!rows.has(key)) rows.set(key,[]);
    rows.get(key).push({x:it.transform[4], s:it.str});
  }
  return [...rows.entries()]
    .sort((a,b)=> b[0]-a[0])
    .map(([,arr])=> arr.sort((a,b)=>a.x-b.x).map(o=>o.s).join(" ").replace(/\s+/g," ").trim());
}

/* ---------- Parser de factura ----------
   1) Intento estructurado: renglones "SKU: descripción ... QTY UOM MSRP NET EXT"
      (formato tipo Coqui Hobby). Costo = NET PRICE, precio venta sugerido = MSRP.
   2) Si no encuentra nada, cae a la heurística genérica línea por línea.        */
function parseInvoice(lines){
  const blob = lines.join("\n");
  const meta = extractMeta(lines, blob);
  let items = parseStructured(blob);
  let mode = "estructurado";
  if(!items.length){
    items = lines.map(parseCandidate).filter(Boolean).map(c=>({
      sku:"", desc:c.desc, cantidad:c.cantidad, costo:c.costo, msrp:0, ext:c.cantidad*c.costo, raw:c.raw
    }));
    mode = "heuristico";
  }
  // detectar flete/handling para avisar (no se agrega como stock)
  const fre = blob.match(/(freight[^\n]*?|flete[^\n]*?)\s([\d.,]+)\s*$/im) || blob.match(/freight[^\d]*([\d.,]+)/i);
  meta.flete = fre ? parseNum(fre[fre.length-1]) : 0;
  meta.handling = Math.round(((items && items.cargos) || 0)*100)/100;   // v120: fees/cargos sin producto
  return { meta, items, mode };
}

/* SKU: desc ... QTY UOM MSRP NET EXT  (UOM = EACH/EA/CASE/BOX/PACK/UNIT/PCS)
   v119: primero renglón por renglón, sumando a la descripción los renglones de abajo cuando
   el nombre del producto ocupa 2 o 3 líneas (antes quedaba cortado: "Riftbound TCG: Set 1-").
   Si así no encuentra nada, cae al método anterior sobre el texto corrido. */
const RE_UOM = "(EACH|EA|CASE|BOX|PACK|UNIT|PCS?|UN)";
function parseStructured(blob){
  const porRenglon = parseStructuredLineas(blob.split("\n"));
  return porRenglon.length ? porRenglon : parseStructuredBlob(blob);
}
function parseStructuredLineas(lines){
  const re = new RegExp("(?=[A-Z0-9\\-]*\\d)([A-Z0-9][A-Z0-9\\-]{3,}):\\s*(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+"+RE_UOM+"\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)(?=\\s|$)","i");
  const otroItem = new RegExp("\\d\\s+"+RE_UOM+"\\s+[\\d.,]","i");
  const corte = /^(note|nota|a late charge|sales total|tax total|sub\s*total|total|page|p[aá]gina|continued|contin[uú]a|invoice|reference|date|bill to|ship to|no\.\s*item|customer|so type)\b/i;
  // v122: pie de página en el medio del renglón ("Continued... Page: 1 of 2"): corta la continuación.
  const pie = /\b(page|p[aá]gina)\s*:?\s*\d+\s*(of|de)\s*\d+/i;
  /* v120: renglón de CARGO con el mismo formato pero código sin números (ZZZFEES: Handling Fees).
     No es mercadería: su importe se suma como handling de la compra (se prorratea en el costo). */
  const reCargo = new RegExp("^(?:\\d+\\s+)?([A-Z][A-Z\\-]{2,}):\\s*(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+"+RE_UOM+"\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)\\s*$","i");
  const out=[]; let ultimo=null, extra=0;
  out.cargos=0;
  for(const raw of lines){
    const l=raw.trim();
    const mc=l.match(reCargo);
    if(mc && !/\d/.test(mc[1])){ out.cargos += parseNum(mc[7]); ultimo=null; continue; }
    const m=l.match(re);
    if(m){
      const cantidad=parseNum(m[3]);
      ultimo=null; extra=0;
      if(cantidad<=0) continue;
      ultimo={ sku:m[1].trim(), desc:m[2].replace(/\s+/g," ").trim(), cantidad,
               costo:parseNum(m[6]), msrp:parseNum(m[5]), ext:parseNum(m[7]),
               raw:(m[1]+": "+m[2]+" | "+m[3]+" "+m[4]+" "+m[5]+" "+m[6]+" "+m[7]) };
      out.push(ultimo);
      continue;
    }
    // Renglón de continuación del nombre: sólo texto, hasta 3 renglones, sin cabeceras ni totales.
    if(ultimo && l && extra<3 && /[A-Za-z]/.test(l) && !corte.test(l) && !pie.test(l) && !otroItem.test(l) && !/^\d+\s+\S+:/.test(l)){
      ultimo.desc += " "+l; extra++;
      continue;
    }
    ultimo=null;
  }
  return out;
}
function parseStructuredBlob(blob){
  const re = new RegExp("(?=[A-Z0-9\\-]*\\d)([A-Z0-9][A-Z0-9\\-]{3,}):\\s*([\\s\\S]+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+"+RE_UOM+"\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)(?=\\s|$)","gi");
  const out=[]; let m;
  while((m=re.exec(blob))){
    const sku = m[1].trim();
    const desc = m[2].replace(/\s+/g," ").trim();
    const cantidad = parseNum(m[3]);
    const msrp = parseNum(m[5]);   // precio sugerido
    const net  = parseNum(m[6]);   // costo real (lo que pagás)
    const ext  = parseNum(m[7]);   // total línea
    if(cantidad<=0) continue;
    out.push({ sku, desc, cantidad, costo:net, msrp, ext, raw:(sku+": "+desc+" | "+m[3]+" "+m[4]+" "+m[5]+" "+m[6]+" "+m[7]) });
  }
  return out;
}

/* Metadata: N° de comprobante, fecha, proveedor */
function extractMeta(lines, blob){
  const meta = { numero:"", fecha:"", proveedor:"", flete:0 };
  const ref = blob.match(/Reference\s*No\.?:?\s*([A-Z0-9\-]+)/i)
           || blob.match(/(?:Invoice|Factura|Comprobante)\s*(?:No\.?|#|N[°º])?:?\s*([A-Z0-9\-]{3,})/i);
  if(ref) meta.numero = ref[1].trim();
  // Fecha de la factura: "Date: 01-Jul-2026", "Invoice Date: 07/01/2026" (MM/DD/YYYY)
  // o "Date: Jul 1, 2026". Los números se leen siempre como fecha americana.
  const date = blob.match(/\bDate:?\s*([0-3]?\d[-\/][A-Za-z]{3,}[-\/]\d{2,4})/i)
            || blob.match(/\b(?:Invoice\s+)?Date:?\s*([0-1]?\d[-\/.][0-3]?\d[-\/.]\d{2,4})/i)
            || blob.match(/\b(?:Invoice\s+)?Date:?\s*([A-Za-z]{3,}\.?\s+[0-3]?\d,?\s+\d{4})/i)
            || blob.match(/\bFecha:?\s*([0-3]?\d[-\/.][0-3]?\d[-\/.]\d{2,4})/i);
  if(date) meta.fecha = normDate(date[1]);
  const skip = /^(invoice|factura|reference|date|fecha|customer|currency|salesperson|bill to|ship to|terms|contact|due date|no\.|item)\b/i;
  for(const l of lines){
    const t=l.trim();
    if(t.length>2 && /[A-Za-z]/.test(t) && !skip.test(t)){ meta.proveedor=t.replace(/\s+/g," "); break; }
  }
  return meta;
}
/* Fecha encontrada en el texto de la factura: mismo criterio que toda la app (americano). */
function normDate(s){ return normISO(s); }

/* Heurística: intentar detectar cantidad / costo en una línea */
function parseCandidate(line){
  const nums=[...line.matchAll(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g)].map(m=>m[0]);
  if(nums.length<2) return null;                 // necesita al menos cantidad y un importe
  if(line.length<4) return null;
  // descartar líneas que son claramente totales/cabeceras
  if(/^(total|subtotal|iva|neto|importe total|cuit|factura|fecha|p[aá]gina)\b/i.test(line.trim())) return null;
  const desc = line.replace(/-?\d[\d.,]*/g,"").replace(/\s+/g," ").trim();
  if(desc.length<2) return null;
  const parsed = nums.map(parseNum);
  // heurística: cantidad = primer número "chico" entero; costo unit = número intermedio; total = último
  let cantidad = parsed.find(n=> n>0 && n<10000 && Number.isInteger(n)) ?? parsed[0];
  let costo = parsed.length>=2 ? parsed[parsed.length-2] : parsed[0];
  if(cantidad>0 && costo===0 && parsed.length){ costo=parsed[parsed.length-1]; }
  return { desc, cantidad: cantidad||1, costo: costo||0, raw:line };
}

function showImportEditor(fname, parsed){
  const out=document.getElementById("importOut");
  const { meta, items, mode } = parsed;
  if(!items.length){
    out.innerHTML=`<div class="banner warn">${t("imp.err.nolineslocal")}</div>
      <details open><summary>${t("imp.extractedtext")}</summary><div class="rawbox">${esc(pdfLines.join("\n"))}</div></details>`;
    return;
  }
  // mapear cada ítem a un producto existente por SKU (o por nombre)
  items.forEach(c=>{
    const bySku = c.sku ? findProdBySku(c.sku) : null;
    const byName = bySku ? null : db.productos.find(p=> p.nombre && c.desc.toLowerCase().includes(p.nombre.toLowerCase()));
    const match = bySku || byName;
    c.productoId = match ? match.id : "";
    c.crear = !match;
    c.nombre = match ? match.nombre : c.desc;
    c.sel = true;
  });
  window._cands = items;

  const rows=items.map((c,i)=>`<tr>
    <td class="c"><input type="checkbox" data-sel="${i}" ${c.sel?"checked":""}></td>
    <td class="c">${c.sku?`<span class="sku">${esc(c.sku)}</span>`:'<span class="u-muted">—</span>'}</td>
    <td class="imp-desc">${esc(c.desc)}</td>
    <td style="width:74px"><input class="inp num" data-imp="cantidad" data-i="${i}" value="${c.cantidad}"></td>
    <td style="width:104px"><input class="inp num" data-imp="costo" data-i="${i}" value="${c.costo}"></td>
    <td style="width:104px"><input class="inp num" data-imp="msrp" data-i="${i}" value="${c.msrp||0}"></td>
    <td class="col-target" style="min-width:170px"><select class="inp" data-imp="prod" data-i="${i}">${prodOptions(c.productoId)}</select></td>
  </tr>`).join("");

  const dato=(k,v)=>`<div><p class="k">${t(k)}</p><p class="v">${v?esc(v):'<span class="u-muted">—</span>'}</p></div>`;
  const extra=(meta.flete||0)+(meta.handling||0);

  out.innerHTML=`
    <div class="imp-meta">
      ${dato("imp.m.supplier", meta.proveedor)}${dato("imp.m.num", meta.numero)}
      ${dato("imp.m.date", meta.fecha ? fmtDate(meta.fecha) : "")}${dato("imp.m.lines", String(items.length))}
    </div>
    ${htmlCuadre(parsed.cuadre, !!parsed.leerConIA)}
    ${extra ? `<div class="banner info">${ICO.truck}<span>${t("imp.freight",{amount:money(extra)})}</span></div>` : ""}
    <p class="u-fs-xs u-muted u-m0 u-mb2">
      ${t("imp.costhint")}
    </p>
    <div class="table-scroll"><table class="line-tbl${SHOW_TARGET_PRODUCT_COL?'':' hide-target'}">
      <thead><tr><th class="c">✓</th><th class="c">SKU</th><th>${t("imp.th.desc")}</th><th class="r">${t("imp.th.qty")}</th><th class="r">${t("imp.th.cost")}</th><th class="r">${t("imp.th.listprice")}</th><th class="col-target">${t("imp.th.target")}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <details><summary>${t("imp.viewraw")}</summary><div class="rawbox">${esc(pdfLines.join("\n"))}</div></details>`;
  const bIA=document.getElementById("impLeerIA"); if(bIA && parsed.leerConIA) bIA.onclick=parsed.leerConIA;

  out.querySelectorAll("[data-sel]").forEach(cb=> cb.onchange=()=> items[+cb.dataset.sel].sel=cb.checked);
  out.querySelectorAll("[data-imp]").forEach(inp=>{
    const i=+inp.dataset.i, k=inp.dataset.imp;
    inp.oninput=()=>{
      const c=items[i];
      if(k==="cantidad") c.cantidad=parseNum(inp.value);
      else if(k==="costo") c.costo=parseNum(inp.value);
      else if(k==="msrp") c.msrp=parseNum(inp.value);
      else if(k==="prod"){
        if(inp.value==="__new"){ c.crear=true; c.productoId=""; }
        else { c.crear=false; c.productoId=inp.value; const p=prodById(inp.value); if(p) c.nombre=p.nombre; }
      }
    };
  });
  impContinuar(()=>{
    const chosen=items.filter(c=>c.sel && c.cantidad>0);
    if(!chosen.length){ toast(t("imp.tt.tickone"),"warn"); return; }
    const lineas=chosen.map(c=>({
      key:uid(),
      productoId: c.crear?"":c.productoId,
      crear: c.crear,
      sku: c.crear?(c.sku||""):"",
      nombre: c.crear?c.nombre:"",
      precioVentaSugerido: c.msrp||0,
      cantidad:c.cantidad, precio:c.costo
    }));
    openDoc("compra", { tipo:"compra", contraparte:meta.proveedor||"", fecha:meta.fecha||isoLocal(new Date()), numero:meta.numero||"", handling:meta.handling||0, flete:meta.flete||0, lineas });
  });
}

