/* ============================================================
   VIEW: Investments vault (point 5) — admin only
   Products held as an executive decision NOT to sell. They leave the
   sellable inventory and are booked as investment at purchase cost.
   Future: will connect to the company-wide portfolio.
   ============================================================ */
function viewInversiones(){
  const items = db.productos.filter(esInversion);
  const totalCosto = items.reduce((a,p)=> a + invValor(p), 0);
  const totalUn = items.reduce((a,p)=> a + invUnits(p), 0);
  const rows = items.map(p=>{
    const un = invUnits(p), cost = invValor(p);
    return `<tr class="u-pointer" data-ficha="${p.id}">
      <td><span class="sku">${esc(p.sku||"—")}</span></td>
      <td>${esc(p.nombre)} <span class="pill vault">${ICO.vault}${t("inv.pill")}</span></td>
      <td class="c">${esc(langLabel(p.idioma))}</td>
      <td class="r num">${qty(un)}</td>
      <td class="r num">${money(un>0?cost/un:0)}</td>
      <td class="r num">${money(cost)}</td>
      <td class="r"><button class="btn ghost sm" data-invret="${p.id}">${ICO.vault}${t("inv.ret")}</button></td>
    </tr>`;
  }).join("");
  return `
  <div class="head">
    <div class="title"><h2>${t("inv.title")}</h2><p>${t("inv.sub")}</p></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="lbl">${t("inv.kpi.items")}</div><div class="val">${items.length}</div><div class="sub">${t("inv.kpi.itemssub")}</div></div>
    <div class="kpi"><div class="lbl">${t("inv.kpi.units")}</div><div class="val">${qty(totalUn)}</div><div class="sub">${t("inv.kpi.unitssub")}</div></div>
    <div class="kpi"><div class="lbl">${t("inv.kpi.invested")}</div><div class="val">${bigMoney(totalCosto)}</div><div class="sub">${t("inv.kpi.investedsub")}</div></div>
    <div class="kpi"><div class="lbl">${t("inv.kpi.portfolio")}</div><div class="val">—</div><div class="sub">${t("inv.kpi.portfoliosub")}</div></div>
  </div>
  <div class="panel">
    <div class="phead"><h3>${t("inv.held")}</h3><span class="hint">${t("inv.hint")}</span></div>
    ${items.length ? `<div class="table-scroll"><table>
      <thead><tr><th>SKU</th><th>${t("common.product")}</th><th class="c">${t("inv.th.lang")}</th><th class="r">${t("common.units")}</th><th class="r">${t("inv.th.avgcost")}</th><th class="r">${t("inv.th.invested")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : emptyState(t("inv.empty.title"),t("inv.empty.sub"))}
  </div>`;
}

