/* ============================================================
   PUENTE USD-only (para el Análisis/P&L traído de Select)
   Select maneja 2 monedas (USD/ARS). Esta app es SOLO USD,
   así que "convertir" es no hacer nada y la moneda de reporte
   es siempre USD. Cuando algún día quieras multi-moneda, esto
   se reemplaza por la versión real de Select.
   ============================================================ */
function reportCcy(){ return "USD"; }
function storeCcy(){ return "USD"; }
function convertCcyAt(monto, from, to, fecha){ return monto; }        // identidad
function monedaSym(ccy){ return (typeof db!=="undefined" && db.config && db.config.moneda) || "US$"; }
