/* ============================================================
   Datos: export
   v116 · Se quitaron importJSON() y resetAll(): importar un JSON reemplazaba toda la
   base y "Borrar todo" la vaciaba. Con la base en producción, un error ahí no tenía
   vuelta atrás completa (sin R2 no hay historial de versiones). Queda sólo el export.
   ============================================================ */
function exportJSON(){
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`mayor-stock-${isoLocal(new Date())}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast(t("io.tt.backup"));
}
