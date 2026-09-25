# Gestor de Stock

Gestor de inventario en **vanilla HTML/CSS/JS**, sin frameworks ni build. Todo vive en un único `index.html`. Las **compras suman** stock (por sociedad) y fijan el **último costo**; las **ventas restan** desde un **pool unificado** con costeo **FIFO global por fecha**; los **ajustes** corrigen a mano. Cada movimiento queda trazado en un **kardex**. Importa facturas en **PDF** (OCR con Gemini vía el Worker) y sincroniza entre dispositivos contra un backend en **Cloudflare Worker + D1**. Es una **PWA** instalable y usable offline.

---

## Cómo funciona

| Acción | Efecto en el stock |
|---|---|
| **Compra** | Suma unidades y actualiza el **último costo** del producto. Puede importarse desde PDF. |
| **Venta** | Resta unidades (valida que haya existencias) y registra el margen contra el costo del momento. |
| **Ajuste** | Corrección manual (mermas, recuentos, cargas iniciales). Reversible desde el kardex. |

- **Kardex:** cada entrada/salida/ajuste queda con fecha, cantidad, valor unitario, saldo y documento de origen. La ficha de cada producto muestra su kardex individual y una evolución del stock.
- **Sagas:** el sistema deriva la "línea/juego" desde el nombre del producto y la normaliza (unifica alias tipo *One Piece TCG* == *One Piece Card Game*) para filtrar sin duplicados.
- **Alertas:** un producto entra en la lista de reposición si está en **cero/negativo** o por debajo de su **punto de repedido**.

---

## Sociedades, stock unificado y FIFO global

El proveedor pone un **tope de compra por sociedad**, así que se compra con **varias sociedades** (Akira, Silver, y las que se sumen). Pero **el stock es uno solo para la venta**:

- Cada **compra** elige la **sociedad** que la hizo → eso define la **procedencia** de cada lote (podés ver cuánto vino por Akira y cuánto por Silver).
- La **venta NO elige sociedad**: sale del **pool unificado**. El costo se toma **FIFO global por fecha de entrada**, cruzando sociedades. Ejemplo: 10u compradas por Akira el día 1 + 40u por Silver el día 5; vendés 20 → toma 10 de Akira y 10 de Silver (COGS FIFO real). Akira queda en 0, Silver en 30.
- El **desglose por sociedad** (columnas en Dashboard/Productos) es sólo informativo y **admin-only**. El vendedor ve únicamente el stock total vendible.
- Escala solo a **más sociedades**: las columnas y el motor iteran la lista de sociedades, no están hardcodeadas.

## Perfiles y permisos

Dos roles, más el **modo Local** (sin login = acceso total):

| Capacidad | Admin | Vendedor (Teo, Tonio…) |
|---|---|---|
| Vender desde el pool unificado | ✓ | ✓ |
| Que la venta quede a su nombre (comisión) | ✓ (elige a quién) | ✓ (fijado a sí mismo) |
| Cargar compras / importar facturas | ✓ | — |
| Enviar/traer de Inversión | ✓ | — |
| Ajustes de inventario / ABM de productos | ✓ | — |
| Ver Análisis, P&L, Datos y comisiones de todos | ✓ | — |
| Ver sus propias ventas | ✓ (ve todas) | ✓ (sólo las suyas) |

- Los **vendedores son personas** (Teo, Tonio), **no sociedades** — se gestionan en **Data → Sellers**.
- En el listado de ventas (admin) la columna **"Sold by"** muestra quién vendió cada factura (punto 6).
- El control de permisos es **a nivel UI**: todos comparten el mismo token e inventario (`space: "main"`). Es suficiente para un equipo chico de confianza; no es un control criptográfico por usuario.

## Fechas

Todo el display de fechas usa **formato americano MM/DD/YYYY** (incluido el calendario y el kardex), y **toda fecha numérica se LEE como americana**: `07/01/2026` es 1 de julio, en facturas PDF, OCR, imports y datos viejos. También acepta `Jul 1, 2026`, `01-Jul-2026` e ISO. Una fecha imposible (`13/40/2026`) queda vacía en vez de inventarse.

---

## Finanzas (v55–v56)

Cinco pestañas admin-only que comparten **un único juego de filtros** (período MTD/QTD/YTD/12M/Todo o fechas libres, línea, idioma, país, vendedor): filtrás en una y las demás ya están filtradas igual.

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | 6 KPIs con tendencia de 12 meses (contra plan FP&A o, si no hay, contra el mismo período del año anterior), desvío por línea, riesgos calculados y decisiones pendientes con acción directa. |
| **Análisis** (Ventas y margen) | Ventas vs compras por mes con margen %, tabla mes a mes, rankings, mix y margen por línea, vendedores, país/idioma y procedencia por sociedad. |
| **P&L** | Estado de resultados con % s/ ingreso neto y año anterior, waterfall, contribución por mes, vendedores con drill-down y real vs presupuesto. |
| **Plan de ventas** | Semáforo del mes en curso (también en el Panel) + histórico plan vs real por juego y por mes, con controles de conciliación. |
| **Gastos de estructura** | Alquiler, sueldos, servicios, software, honorarios, marketing… Fijos mensuales (se cargan una vez y se devengan solos) y puntuales (a un mes). Bajan al P&L y dan el resultado operativo. |

**Fuente única de números:** `js/05-metrics.js`. Análisis, P&L, Resumen, Plan vs Real y el Excel del P&L salen del mismo cálculo; los porcentajes son siempre razón de sumas.

**Plan de ventas (v82)** (`js/06-fpa.js`): la plantilla tiene **solo 3 columnas** — `Mes | Juego | Ventas plan`. Se descarga desde la pestaña, se completa y se importa (.xlsx/.xls/.csv) con vista previa de errores; cada importación queda como versión. El parser sigue aceptando las columnas viejas (margen, compras, stock objetivo, idioma) para no romper planes ya cargados, pero no se piden más.

**Semáforo "Plan del mes" (v82):** tarjeta admin-only arriba del Panel (y completa en la pestaña Plan de ventas). Por juego cruza plan, vendido en el mes y stock + tránsito **valuado a precio de venta** (precio de lista → promedio real 90 días → costo × markup del juego). Cierre estimado = vendido + mín(ritmo 30 días × días restantes, stock disponible): no se puede vender lo que no hay. Diagnóstico: *Cumplido*, *Llega*, *Falta stock* (dice cuánto comprar), *Venta lenta* (hay stock, falta ritmo: dice cuánto por día hace falta), *No llegó* y *Sin plan*.

**Drill-down (v57):** tocar un mes (gráfico o fila), una barra de producto/país/idioma o una fila de vendedor/sociedad abre las líneas de venta que la componen (y, si es un mes, sus compras), con totales, acceso a cada venta y exportación a Excel. Respeta los filtros activos.

**Proyección de cierre (v57):** en Resumen y Plan vs Real. Proyectado = vendido en el mes + días restantes × ritmo diario de los últimos 30 días; contra el plan del mes y con el ritmo diario necesario para llegar.

**Fotos mensuales de stock (v57):** stock a costo FIFO al cierre de cada mes, reconstruido desde el kardex (ventas por fecha de venta) y **congelado** en `db.stockSnaps` cuando el admin abre la app en un mes nuevo. Un mes congelado no cambia si después se edita un documento viejo; "Recalcular meses cerrados" (en Análisis) lo rearma. Alimenta la columna "Stock al cierre", el gráfico de stock, el minigráfico del Resumen y el stock vs objetivo por mes de Plan vs Real.

**Gastos de estructura (v83)** (`js/11f-view-gastos.js`, datos en `db.gastos`): categorías editables agrupadas en *Administración* y *Comercialización*; **gastos fijos** con mes desde / hasta (cambiar el monto "desde tal mes" parte el gasto en dos tramos y no reescribe la historia; "Dar de baja" cierra el tramo) y **gastos puntuales** imputados a un mes. Criterio de lo devengado: cada gasto pesa entero en su mes, aunque el filtro tome parte del mes; los fijos se devengan hasta el mes en curso. Sociedad: directo o *Compartido* (con foco en una sociedad, los compartidos se prorratean por su % de ingreso neto). En el **P&L**: KPI de resultado operativo, waterfall hasta el resultado operativo, gastos de administración y comercialización con sus categorías en el estado de resultados (con año anterior) y tendencia mensual del resultado operativo. El **Excel del P&L** suma esas filas y una hoja con el detalle. Con filtros de juego/idioma/país/vendedor los gastos no se asignan y se avisa. La pestaña muestra además el punto de equilibrio del mes (gastos ÷ margen de contribución %).

**Export del P&L con presentación (v85)** (`js/31b-export-pnl-pro.js`): reemplaza al Excel plano. Usa **ExcelJS** (cargado al exportar desde cdnjs, con jsDelivr de respaldo; el SW lo cachea). Hojas: *Resumen* (tarjetas KPI, estado de resultados con subtotales y colores, waterfall, ingreso/resultado por mes y donut por juego dibujados en canvas, lectura rápida con punto de equilibrio; entra en una hoja apaisada), *P&L mensual* (fórmulas de total y %), *Por sociedad* (sólo consolidado), *Por juego* y *Por vendedor* (barras de datos y escala de color), *Gastos de estructura* y *Productos* (filtros). Si ExcelJS no carga, se exporta el Excel plano de 31-export-pnl.js.

**Panel:** los KPIs son subtotales del filtro activo (línea, idioma, estado, etc.).

---


## Catálogo público (v86)

Link libre, **sin login y de solo lectura**, para que los clientes vean el stock: `https://<tu-pages>/catalogo.html` (en **Productos → Link del catálogo** se copia solo). Opcional: `?lang=es` lo abre en español.

- **Qué muestra:** juego, nombre, idioma, stock en unidades o cases, y lo que está **en tránsito** como "Próximamente". Nunca costos, precios, SKU, sociedades ni clientes. Los productos **bloqueados** (best offer) y la bóveda de inversión no se publican.
- **Seguridad:** la página no usa `/state`. Pega a `GET /public/catalog` del Worker, que arma la lista con una **whitelist de campos** del lado del servidor. El `space` lo fija el Worker (`CATALOG_SPACE`, default `main`), no quien llama.
- **Cache:** la respuesta se cachea 60 s en el edge (protege a D1). Un cambio en la app tarda hasta 1 minuto en verse.
- **Imágenes:** campo **URL de imagen** en la ficha del producto (solo `http/https`). Sin imagen, o si el link se rompe, se muestra un placeholder con el color del juego y el código del set.
- **Pedido:** el cliente arma cantidades por producto (unidades o cases por línea), agrega nombre y nota, y lo **copia** o lo manda por **WhatsApp** / **mail** a su vendedor. El pedido vive solo en el navegador del cliente, nunca llega al servidor.
- `sagaDe()` está duplicada en `worker.js` para derivar el juego del lado del servidor: si la cambiás en `10-view-dashboard.js`, cambiala también allá.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app entera (UI + lógica). Es lo único imprescindible para que corra. |
| `manifest.json` | Metadatos PWA para instalación. |
| `sw.js` | Service worker: cachea la app y pdf.js para uso offline. |
| `catalogo.html` | Catálogo público de stock (sin login, sin precios) con armado de pedido. |
| `worker.js` | Backend opcional (Cloudflare Worker): login + API de estado con control de `rev`. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Íconos de la PWA. |
| `apple-touch-icon.png` | Ícono para "Agregar a inicio" en iOS. |
| `favicon.png`, `favicon-32.png` | Favicons. |

> Para probarla sola, con abrir `index.html` alcanza (modo Local, sin sincronización). Los demás archivos son para que sea **instalable, offline y multi-dispositivo**.

---

## Deploy de la app (GitHub Pages)

1. Subí todos los archivos a la raíz del repo (o a `/docs`).
2. **Settings → Pages → Branch `main`** (carpeta raíz o `/docs`).
3. Entrá a la URL publicada. En el celu: **Compartir → Agregar a inicio** y queda como app nativa.

---

## Versionado del service worker

Cada vez que tocás `index.html`, **subí el string de versión** en `sw.js` y pusheá los dos juntos:

```js
const CACHE = "mayor-stock-v56";  // -> "mayor-stock-v57", etc.
```

Si no, `index.html` es *network-first* (trae la última si hay internet), pero conviene bumpear igual por prolijidad y para invalidar el cache de estáticos. También está el `build vNN` en la pantalla de login como referencia visual rápida de qué versión estás corriendo.

---

## Import de PDF

- Reconoce el formato tipo **Coqui Hobby** (`SKU: descripción … QTY UOM MSRP NET EXT`): toma **NET PRICE** como costo y **MSRP** como precio de venta sugerido, y excluye el flete del stock.
- Si el layout no matchea, cae a una detección genérica línea por línea.
- **Siempre** muestra una tabla editable + el texto crudo extraído **antes** de impactar stock. Revisá antes de confirmar: los formatos varían.
- Se procesa 100% en el navegador; el PDF no se sube a ningún lado.

---

## Backend opcional (Cloudflare Worker + D1)

Por defecto todo vive en `localStorage` (modo **Local**, offline). Para tener **el mismo stock desde la PC y el celu**, el `worker.js` expone una API mínima con **login por usuario/contraseña** y control de versión optimista.

### Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/login` `{user, pass}` | Valida el usuario y devuelve `{token, space, role, vendedorId, name}`. |
| `POST` | `/parse-invoice` `{pdf, mime}` | OCR de una factura de compra con Gemini (requiere Bearer y `GEMINI_KEY`). |
| `GET` | `/state?space=…` | Lee el estado (requiere `Authorization: Bearer <token>`). |
| `PUT` | `/state?space=…` | Guarda con control de `rev`; si cambió en el servidor, responde **409 Conflicto**. |

### Secrets necesarios

| Secret | Para qué |
|---|---|
| `AUTH_SECRET` | Clave para firmar los tokens de sesión (HMAC-SHA256, vencen a los 30 días). **Obligatorio.** |
| `ADMIN_USER` / `ADMIN_PASS` | Login de respaldo del admin (sigue funcionando aunque no haya usuarios en D1). |
| `USERS` *(opcional)* | JSON de usuarios de respaldo (ver abajo). Los usuarios nuevos se crean desde la app (**Usuarios**) y quedan en D1 con contraseña hasheada (PBKDF2). |
| `GEMINI_KEY` *(opcional)* | Key de Google AI para el OCR de facturas (`/parse-invoice`). |
| `ALLOWED_ORIGINS` *(opcional)* | Orígenes permitidos para CORS, separados por coma (p. ej. la URL de GitHub Pages). |

### Vendedores (perfiles Teo/Tonio)

Los **vendedores son personas, no sociedades**. Para que Teo y Tonio inicien sesión en su propio celu, definí el secret `USERS` como un JSON. Cada seller lleva un `id` que debe **coincidir** con el id del vendedor en **Data → Sellers** (ahí se le atribuye la comisión):

```json
[
  { "user": "tonio", "pass": "…", "role": "admin" },
  { "user": "teo",   "pass": "…", "role": "seller", "id": "teo",   "name": "Teo" },
  { "user": "tonio-v","pass": "…", "role": "seller", "id": "tonio", "name": "Tonio" }
]
```

- `role: "admin"` → acceso total (compras, inversión, análisis, ve comisiones de todos).
- `role: "seller"` → vende desde el pool unificado; cada venta queda a su nombre; **no** carga compras ni manda a inversión, y sólo ve **sus** ventas.
- Todos comparten el mismo token e inventario (`space: "main"`): **el stock es uno solo**. Los permisos se aplican a nivel UI.

### `wrangler.toml` mínimo

El Worker **crea la tabla solo** (`CREATE TABLE IF NOT EXISTS estado …`), así que no hace falta correr un `schema.sql`. Solo necesitás el binding D1 llamado `DB`:

```toml
name = "mayor-stock-api"
main = "worker.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mayor-stock"
database_id = "PEGÁ-ACÁ-EL-ID"
```

### Deploy del backend (una vez)

```bash
npm i -g wrangler
wrangler login

# 1) Crear la base D1 y pegar el database_id en wrangler.toml
wrangler d1 create mayor-stock

# 2) Definir los secrets (uno por comando, te los pide interactivo)
wrangler secret put TOKEN
wrangler secret put ADMIN_USER
wrangler secret put ADMIN_PASS
wrangler secret put USERS         # opcional: vendedores Teo/Tonio (JSON)
wrangler secret put GEMINI_KEY    # opcional: OCR de facturas

# 3) Publicar
wrangler deploy
```

Te queda una URL tipo `https://mayor-stock-api.TU-USUARIO.workers.dev`. Esa URL va en la constante `API_URL` del `index.html`:

```js
const API_URL = "https://mayor-stock-api.TU-USUARIO.workers.dev";
```

### Entrar

Abrís la app, cargás **usuario y contraseña** (los `ADMIN_USER`/`ADMIN_PASS`) y listo: el primer dispositivo sube su estado, los demás lo traen. La sesión (usuario, token y espacio) queda guardada en `localStorage`.

---

## Datos, sincronización y conflictos

- La app **siempre guarda en local** primero (seguís trabajando sin conexión) y, si hay sesión, empuja/trae el estado completo.
- Control de versión optimista con `rev`: si desde la última sync cambió **acá y en el servidor**, la app avisa **Conflicto** y elegís cuál conservar. Si solo cambió de un lado, sincroniza sola.
- Con `space` podés tener **inventarios separados** en el mismo servidor (`main`, `us`, `europa`, etc.).
- El indicador de estado (**Local / Sincronizado / Guardando / Sin conexión / Conflicto**) está en la barra superior y lateral.

> El `token` viaja en el header `Authorization: Bearer`. Al ser un secreto compartido, tratá la URL + credenciales como una contraseña.

### Respaldo extra

Aun con servidor, **Datos → Exportar JSON** te da una copia puntual. **Importar JSON** reemplaza el estado actual (y se sincroniza si estás conectado).

---

## Stack y decisiones

- **Sin dependencias de build.** Un solo HTML, service worker y (opcional) un Worker. Fácil de auditar y de deployar en Pages.
- **`localStorage` como fuente local** + backend como espejo sincronizado, no al revés: la app nunca depende de estar online.
- **pdf.js** por CDN (cacheado por el SW) solo para el import de facturas.
- **Temas claro/oscuro** con `prefers-color-scheme` y override manual persistido.
