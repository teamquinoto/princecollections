/* ============================================================
   REGLA: todo lo que va DENTRO de los PDF (factura de venta y lista de precios) sale
   SIEMPRE en inglés -> tEn(). Sólo los toasts de la app siguen el idioma elegido.
   PUNTO 8 y 10 — Generación de PDF (invoice de venta + lista de precios)
   Usa jsPDF (UMD por CDN, cacheado por el SW para uso offline).
   ============================================================ */
function pdfReady(){ return !!(window.jspdf && window.jspdf.jsPDF); }
// Números del PDF en formato de EE.UU. (1,234.56), aunque la app use 1.234,56: el documento es para el cliente.
const _pdfNf2 = new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const _pdfNf0 = new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
function pdfMoney(n){ return db.config.moneda + " " + _pdfNf2.format(n||0); }
function pdfQty(n){ return _pdfNf0.format(n||0); }

function generarInvoicePDF(id){
  if(!pdfReady()){ toast(t("pdf.err.gen"),"warn"); return; }
  const d = db.ventas.find(v=>v.id===id); if(!d){ toast(t("pdf.err.saleNotFound"),"warn"); return; }
  const cli = d.cliente || (d.clienteId?clienteById(d.clienteId):null);
  // EIN: sale del snapshot de la venta; si es una venta vieja sin el campo, lo trae del cliente vivo.
  const cliEIN = (cli && cli.ein) || (d.clienteId && clienteById(d.clienteId) && clienteById(d.clienteId).ein) || "";
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const em = db.config.emisor||{};
  // Paleta (mismo azul del tema)
  const INK=[26,26,26], MUT=[120,120,120], LINE=[228,225,220], ACC=[37,99,235], ZEBRA=[248,247,245];
  const setInk=(c)=>doc.setTextColor(c[0],c[1],c[2]);

  /* ---------- Header band ---------- */
  doc.setFillColor(ACC[0],ACC[1],ACC[2]); doc.rect(0,0,W,96,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(19);
  doc.text(em.nombre || tEn("pdf.inv.title"), M, 42);
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  let hy=60;
  [em.direccion, [em.email, em.tel].filter(Boolean).join("  ·  ")].filter(Boolean).forEach(s=>{ doc.text(String(s), M, hy); hy+=12; });
  // right side: INVOICE + number + date
  doc.setFont("helvetica","bold"); doc.setFontSize(22);
  doc.text(tEn("pdf.inv.title"), W-M, 40, {align:"right"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
  doc.text(tEn("pdf.inv.no",{n:d.numero||"—"}), W-M, 58, {align:"right"});
  doc.text(fmtDateUS(d.fecha), W-M, 72, {align:"right"});   // PDF: siempre fecha americana

  /* ---------- Bill To ---------- */
  let y=134;
  doc.setFont("helvetica","bold"); doc.setFontSize(8.5); setInk(MUT);
  doc.text(tEn("pdf.inv.billto"), M, y);
  doc.text(tEn("pdf.store"), W-M-150, y);
  y+=17;
  const leftLines=[];
  if(cli){
    leftLines.push(["bold", cli.nombre||""]);
    // empresa / contacto: sin repetir el nombre (antes salía "Ismael Lozano" dos veces)
    const l2=[cli.empresa, cli.contacto].filter(x=> x && String(x).trim().toLowerCase()!==String(cli.nombre||"").trim().toLowerCase()).join(" · ");
    if(l2) leftLines.push(["normal", l2]);
    if(cliEIN) leftLines.push(["normal", tEn("md.cli.ein")+": "+cliEIN]);
    if(cli.direccion) leftLines.push(["normal", cli.direccion]);
    const cz=[cli.ciudad, cli.estado, cli.zip].filter(Boolean).join(", "); if(cz) leftLines.push(["normal", cz]);
    if(cli.pais) leftLines.push(["normal", cli.pais]);
    const ce=[cli.email, cli.telefono].filter(Boolean).join("  ·  "); if(ce) leftLines.push(["muted", ce]);
  } else leftLines.push(["normal","—"]);
  let ly=y;
  leftLines.forEach(([style,txt],i)=>{
    doc.setFont("helvetica", style==="bold"?"bold":"normal"); setInk(style==="muted"?MUT:INK);
    doc.setFontSize(style==="bold"?11:9.5);
    if(style==="muted" && i>0) ly+=3;                 // un respiro antes del contacto
    doc.splitTextToSize(txt, 280).forEach(s=>{ doc.text(s, M, ly); ly+= style==="bold"?16:13.5; });
  });
  // store box (right)
  doc.setFont("helvetica","normal"); doc.setFontSize(10); setInk(INK);
  doc.text(storeName(d.store||STORE_IDS[0]), W-M-150, y);

  /* ---------- Table ----------
     Geometría: la tabla ocupa de M a W-M y TODO el texto tiene un margen
     interno (PAD), así los importes ya no tocan el borde. Columnas numéricas
     con ancho fijo y la de ítem con el resto. Cada fila se mide según las
     líneas del nombre y el texto queda centrado dentro de su franja. */
  y = Math.max(ly, y+14) + 22;
  const PAD=10, LEAD=12.5, HEAD_H=26, BOTTOM=H-120;
  const amtR = W-M-PAD,  amtW = 98;
  const unitR = amtR-amtW, unitW = 86;
  const qtyR = unitR-unitW, qtyW = 46;
  const itemX = M+PAD, itemW = (qtyR-qtyW) - itemX - 12;
  const drawHead=(yy)=>{
    doc.setFillColor(ACC[0],ACC[1],ACC[2]); doc.rect(M, yy, W-2*M, HEAD_H, "F");
    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
    const by = yy + HEAD_H/2 + 3;
    doc.text(tEn("pdf.th.item"), itemX, by);
    doc.text(tEn("pdf.th.qty"), qtyR, by, {align:"right"});
    doc.text(tEn("pdf.th.unitprice"), unitR, by, {align:"right"});
    doc.text(tEn("pdf.th.amount"), amtR, by, {align:"right"});
    return yy + HEAD_H;
  };
  y = drawHead(y);
  let zebra=false;
  d.lineas.forEach(l=>{
    const nom=(l.nombre||"");   // SKU oculto en la factura (a pedido): sólo el nombre del producto
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
    const wrapped=doc.splitTextToSize(nom, itemW);
    const rowH=Math.max(28, wrapped.length*LEAD + 16);
    if(y+rowH>BOTTOM){ doc.addPage(); y=drawHead(56); zebra=false; }   // página nueva (antes se encimaba en la misma)
    if(zebra){ doc.setFillColor(ZEBRA[0],ZEBRA[1],ZEBRA[2]); doc.rect(M, y, W-2*M, rowH, "F"); }
    zebra=!zebra;
    const firstBase = y + (rowH - (wrapped.length-1)*LEAD)/2 + 3.3;   // centrado vertical del bloque de texto
    setInk(INK); doc.setFont("helvetica","normal"); doc.setFontSize(9.5);
    wrapped.forEach((ln,k)=> doc.text(ln, itemX, firstBase + k*LEAD));
    const numBase = y + rowH/2 + 3.3;                                   // números centrados en la fila
    doc.text(pdfQty(l.cantidad), qtyR, numBase, {align:"right"});
    doc.text(pdfMoney(l.precio), unitR, numBase, {align:"right"});
    doc.setFont("helvetica","bold"); doc.text(pdfMoney(l.cantidad*l.precio), amtR, numBase, {align:"right"});
    y += rowH;
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.8); doc.line(M, y, W-M, y);
  });

  /* ---------- Totals box ---------- */
  const sub=(d.subtotal!=null)?d.subtotal:totalLineas(d.lineas);
  const envio = d.envio && d.envio.tipo==="monto" ? (d.envio.monto||0) : 0;
  const nTot = 3 + (d.cargosCliente||[]).length;
  if(y + 26 + nTot*18 + 40 > BOTTOM){ doc.addPage(); y=56; }          // los totales no se parten ni pisan el pie
  y+=26;
  const boxX=W-M-250;
  const line=(label,val,opts={})=>{
    doc.setFont("helvetica",opts.bold?"bold":"normal");
    doc.setFontSize(opts.big?12.5:10);
    setInk(opts.bold?INK:MUT); doc.text(label, boxX+PAD, y);
    setInk(INK); doc.text(val, amtR, y, {align:"right"});
    y+= opts.big?24:18;
  };
  line(tEn("pdf.subtotal"), pdfMoney(sub));
  line(tEn("pdf.shipping"), d.envio && d.envio.tipo==="free" ? tEn("pdf.free") : pdfMoney(envio));
  (d.cargosCliente||[]).forEach(c=> line(capFirst(c.nota)||tEn("pdf.charge"), pdfMoney(c.monto||0)));   // cargos on-top (primera letra en mayúscula; ventas viejas también)
  y+=2;
  doc.setDrawColor(ACC[0],ACC[1],ACC[2]); doc.setLineWidth(1.4); doc.line(boxX, y-8, W-M, y-8); doc.setLineWidth(1);
  y+=10;
  const total=(d.total!=null)?d.total:round2(sub+envio+saleCargosCliente(d));
  line(tEn("pdf.total"), pdfMoney(total), {bold:true, big:true});

  /* ---------- Payment method + referencia (abajo izquierda, sobre el footer) ----------
     Método a la izquierda; la referencia de pago (ID de transferencia / Zelle) al lado.
     Cada bloque sale sólo si está cargado. */
  const payCols = [];
  if(d.medioPago) payCols.push([tEn("pdf.inv.paymethod"), String(d.medioPago)]);   // se guarda en inglés (PAYMENT_METHODS): va tal cual
  if(d.refPago)   payCols.push([tEn("pdf.inv.payref"), String(d.refPago)]);
  payCols.forEach(([lbl, val], i)=>{
    const x = M + i*200;
    setInk(MUT); doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text(lbl, x, H-90);
    setInk(INK); doc.setFont("helvetica","normal"); doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(val, 190)[0], x, H-76);   // una línea; si es muy larga se corta
  });

  /* ---------- Footer ---------- */
  setInk(MUT); doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  doc.text(tEn("pdf.inv.thanks"), M, H-46);
  doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.line(M, H-58, W-M, H-58);

  // Si la factura ocupó más de una hoja: "Page 1 of 3" abajo a la derecha en cada una.
  const nPages = doc.getNumberOfPages();
  if(nPages>1){
    for(let i=1;i<=nPages;i++){
      doc.setPage(i); setInk(MUT); doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
      doc.text(tEn("pdf.inv.page",{n:i,t:nPages}), W-M, H-46, {align:"right"});
    }
    doc.setPage(nPages);
  }
  doc.save(`invoice-${(d.numero||"sale")}.pdf`);
  toast(t("pdf.inv.downloaded"));
}

/* Lista de precios para clientes (punto 10). Recibe la lista ya filtrada. */
function exportListaPrecios(prods){
  if(!pdfReady()){ toast(t("pdf.err.gen"),"warn"); return; }
  // Point 9: a customer price list must never leak blocked or investment items.
  const clean = prods.filter(p=> !soloEnVault(p) && !esBloqueado(p) && (p.precioVenta||0)>0);
  const dropped = prods.length - clean.length;
  if(!clean.length){ toast(t("pdf.pl.noprod"),"warn"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"letter" });
  const M=48, W=doc.internal.pageSize.getWidth(); let y=56;
  const em=db.config.emisor||{};
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(20);
  doc.text(em.nombre?tEn("pdf.pl.titleName",{name:em.nombre}):tEn("pdf.pl.title"), M, y); y+=18;
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString("en-US"), M, y); y+=20;

  const cSKU=M, cName=M+90, cPrice=W-M;
  doc.setFillColor(245); doc.rect(M, y-12, W-2*M, 22, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(40);
  doc.text(tEn("pdf.pl.sku"), cSKU, y+3); doc.text(tEn("pdf.pl.product"), cName, y+3); doc.text(tEn("pdf.pl.price"), cPrice, y+3, {align:"right"});
  y+=22; doc.setFont("helvetica","normal"); doc.setTextColor(55);
  clean.slice().sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"en")).forEach(p=>{
    if(y>740){ doc.addPage(); y=60; }
    doc.setTextColor(120); doc.setFontSize(8.5); doc.text(p.sku||"—", cSKU, y);
    doc.setTextColor(55); doc.setFontSize(10);
    const wrapped=doc.splitTextToSize(p.nombre||"", cPrice-cName-70);
    doc.text(wrapped, cName, y);
    doc.text(pdfMoney(p.precioVenta), cPrice, y, {align:"right"});
    y += Math.max(15, wrapped.length*12);
    doc.setDrawColor(240); doc.line(M, y-5, W-M, y-5);
  });
  doc.save(`price-list-${isoLocal(new Date())}.pdf`);
  toast(t("pdf.pl.exported",{n:clean.length, extra:dropped>0?t("pdf.pl.excluded",{d:dropped}):""}));
}

