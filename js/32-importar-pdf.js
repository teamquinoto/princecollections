/* ============================================================
   IMPORTAR PDF
   ============================================================ */
let pdfLines = [];   // líneas de texto reconstruidas
function openImport(){
  buildModal(t("imp.title"), `
    <div class="banner">
      ${t("imp.intro")}
    </div>
    <div class="drop" id="drop">
      <div class="di">${ICO.sparkle}</div>
      <p><span class="fn">${t("imp.choosepdf")}</span> ${t("imp.ordrag")}</p>
      <p class="u-fs-xs">${t("imp.serverhint")}</p>
      <input type="file" id="iaInput" accept="application/pdf" hidden>
    </div>
    <div id="importOut"></div>
  `,[{label:t("common.close"),cls:"btn",act:closeModal}], true);

  const drop=document.getElementById("drop"), input=document.getElementById("iaInput");
  drop.onclick=()=>input.click();
  input.onchange=()=>{ if(input.files[0]) handlePdfIA(input.files[0]); };
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
  drop.addEventListener("drop",e=>{ const f=e.dataTransfer.files[0]; if(f) handlePdfIA(f); });
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
async function handlePdfIA(file){
  const out=document.getElementById("importOut");
  if(!session){ out.innerHTML=`<div class="banner warn">${t("imp.needlogin")}</div>`; return; }
  out.innerHTML=`<p class="ai-reading">${ICO.sparkle}<span>${t("imp.reading.ai",{file:esc(file.name)})}</span></p>`;
  try{
    const b64=await fileToBase64(file);
    const res=await apiFetch(apiBase()+"/parse-invoice",{
      method:"POST", headers:authHeaders(),
      body:JSON.stringify({ pdf:b64, mime:file.type||"application/pdf" })
    });
    const j=await res.json();
    if(!res.ok || !j.ok){
      const det = esc(srvErrText(j,res.status));
      out.innerHTML=`<div class="banner warn">${t("imp.err.ai",{det})}</div>`;
      return;
    }
    const d=j.data||{};
    const lineas=Array.isArray(d.lineas)?d.lineas:[];
    if(!lineas.length){
      out.innerHTML=`<div class="banner warn">${t("imp.err.nolines")}</div>`;
      return;
    }
    // adaptar a la estructura que consume showImportEditor
    const parsed={
      meta:{ numero:d.numero||"", fecha:normFechaIA(d.fecha), proveedor:d.proveedor||"", flete:parseNum(d.flete)||0, moneda:d.moneda||"" },
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
    pdfLines=[t("imp.rawai")];
    showImportEditor(file.name, parsed);
  }catch(e){
    console.error(e);
    out.innerHTML=`<div class="banner warn">${t("imp.err.aifail",{err:esc(e.message||"error")})}</div>`;
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
  if(!window.pdfjsLib){ out.innerHTML=`<div class="banner warn">${t("imp.err.noreader")}</div>`; return; }
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
  return { meta, items, mode };
}

/* SKU: desc ... QTY UOM MSRP NET EXT  (UOM = EACH/EA/CASE/BOX/PACK/UNIT/PCS) */
function parseStructured(blob){
  const re = /(?=[A-Z0-9\-]*\d)([A-Z0-9][A-Z0-9\-]{3,}):\s*([\s\S]+?)\s+(\d+(?:[.,]\d+)?)\s+(EACH|EA|CASE|BOX|PACK|UNIT|PCS?|UN)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)(?=\s|$)/gi;
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

  const metaBits = [
    meta.numero ? t("imp.meta.num",{v:esc(meta.numero)}) : "",
    meta.fecha ? t("imp.meta.date",{v:esc(meta.fecha)}) : "",
    meta.proveedor ? t("imp.meta.supplier",{v:esc(meta.proveedor)}) : ""
  ].filter(Boolean).join(" · ");

  out.innerHTML=`
    <div class="banner ok">
      ${t("imp.detected",{n:items.length, file:esc(fname), meta:metaBits?` \u00B7 <span class="u-fw400">${metaBits}</span>`:""})}
    </div>
    ${meta.flete? `<div class="banner" style="white-space:normal">${t("imp.freight",{amount:money(meta.flete)})}</div>`:""}
    <p class="u-fs-xs u-muted u-m0 u-mb2">
      ${t("imp.costhint")}
    </p>
    <div class="table-scroll"><table class="line-tbl${SHOW_TARGET_PRODUCT_COL?'':' hide-target'}">
      <thead><tr><th class="c">✓</th><th class="c">SKU</th><th>${t("imp.th.desc")}</th><th class="r">${t("imp.th.qty")}</th><th class="r">${t("imp.th.cost")}</th><th class="r">${t("imp.th.listprice")}</th><th class="col-target">${t("imp.th.target")}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <details><summary>${t("imp.viewraw")}</summary><div class="rawbox">${esc(pdfLines.join("\n"))}</div></details>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button class="btn primary" id="toDraft">${t("imp.continue")}</button>
    </div>`;

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
  document.getElementById("toDraft").onclick=()=>{
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
    openDoc("compra", { tipo:"compra", contraparte:meta.proveedor||"", fecha:meta.fecha||isoLocal(new Date()), numero:meta.numero||"", handling:0, flete:meta.flete||0, lineas });
  };
}

