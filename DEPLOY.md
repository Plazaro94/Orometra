# Despliegue

## GitHub Pages (producción actual)

Sitio estático servido desde el repo. Cada `push` a `main` dispara el workflow
`.github/workflows/static.yml`: primero corre `npm test` y, si pasa, publica
**solo Lite** (`app/`, `js/`, `core/`, landing, methodology, privacy, assets) en:

https://orometra.com (dominio propio, fichero `CNAME`)

No se suben a Pages `tests/`, `docs/` ni `node_modules/`.

Además, `.github/workflows/ci.yml` ejecuta los mismos tests en cada push y PR a
`main` (aunque no haya deploy).

En el repo: **Settings → Pages → Source: GitHub Actions** (solo hace falta
configurarlo una vez). En el plan gratuito de GitHub, Pages requiere el
repositorio **público**.

## Vercel (alternativa)

Sitio estático: no necesita comando de compilación ni runtime de servidor. Sube la carpeta como
proyecto nuevo y listo. El `vercel.json` incluido desactiva la caché de `index.html`, `.js` y
`.css` para que cada despliegue se vea de inmediato, y añade cabeceras de seguridad básicas.

## Local

Hacen falta módulos ES y un Web Worker, así que **no vale abrir `index.html` con doble clic**:
el navegador bloquea ambos sobre `file://`. Levanta el servidor incluido:

```bash
node tools/serve.js
```

Y abre `http://localhost:3000`. Si ese puerto está ocupado, pasa otro: `node tools/serve.js 8080`.

El servidor sirve los `.js` con el tipo MIME exacto que exigen los módulos ES y desactiva la
caché, para que al recargar nunca se quede una versión antigua. Se para con Ctrl+C.

## Cómo exportar los datos desde MT5

1. Ejecuta la optimización en el Probador de Estrategias.
2. En la pestaña **Optimización**, clic derecho sobre la tabla de resultados → exportar el
   informe. Acepta el `.xml` que propone por defecto: no hace falta cambiar la extensión a
   `.xls`, porque el contenido es el mismo XML Spreadsheet en ambos casos y la aplicación lo
   lee de forma nativa.

   El `.opt` que aparece en `MQL5/Profiles/Tester` es la caché binaria del probador, no un
   formato de intercambio, y la aplicación no lo admite.
3. Si activaste **Forward**, repite la exportación desde la pestaña de resultados forward.
4. Sube el archivo in-sample y, si lo tienes, el forward. Deben ser de la **misma** optimización:
   la aplicación lo comprueba y avisa si no cuadran.

## Seguridad y dependencias

**Sin librerías externas en tiempo de ejecución; solo analítica de tráfico.**
No hay CDN de librerías ni tipografías remotas: el código propio (`js/xlsx.js`, tema, etc.) es
toda la lógica. La analítica son dos servicios:

- **GoatCounter**, en todas las páginas. Su script (`js/goatcounter.js`) es una copia local sin
  modificar del oficial y se sirve desde el propio dominio; solo los *datos* van a
  `plazaro94.goatcounter.com` (página, procedencia, ancho de pantalla y, en la app, el nombre del
  evento de `js/track.js`).
- **Cloudflare Web Analytics**, en todas las páginas **menos la app** (`app/`), para que en la
  página donde se abren los archivos no se ejecute ningún script de un tercero.

Ninguno usa cookies ni ve los archivos del usuario (no salen del navegador). Eso permite una
política de seguridad de contenido estricta, con esas excepciones explícitas, que se aplica igual
en desarrollo que en producción, para que un fallo de política aparezca al programar y no el día
del despliegue:

- **GitHub Pages (producción) no envía cabeceras propias.** Por eso la política va también en
  un `<meta http-equiv="Content-Security-Policy">` en cada página, antes
  del primer script. Un `<meta>` no admite `frame-ancestors`, así que en Pages la web se
  puede incrustar en otra; `X-Frame-Options`, `nosniff`, `Referrer-Policy` (esta sí va en un
  `<meta name="referrer">`) y `Permissions-Policy` solo llegan con un host que envíe cabeceras.
- **`tools/serve.js`, `vercel.json` y `_headers`** (Netlify / Cloudflare Pages) envían la
  política completa como cabecera. `tests/input-guards.test.js` comprueba que las tres copias
  y el `<meta>` coinciden.

```
default-src 'self'      · script-src 'self' + Cloudflare Analytics
style-src 'self'        · connect-src 'self' + Cloudflare Analytics + GoatCounter
object-src 'none'       · base-uri 'self'
form-action 'none'      · frame-ancestors 'none'
img-src 'self' data: + GoatCounter · worker-src 'self' blob:
style-src-attr 'unsafe-inline'   (tres atributos style= generados en plantillas)
```

Detalles que la hacen posible:

- **El `.xlsx` se lee con código propio** (`js/xlsx.js`, unas 160 líneas). Antes se cargaba
  SheetJS desde jsdelivr: 900 KB —más del doble que la aplicación entera— para un caso
  poco frecuente, que además rompía la promesa de que todo se ejecuta en tu navegador y
  obligaba a abrir la política a un origen externo. Un `.xlsx` es un ZIP con XML dentro y
  el navegador ya sabe descomprimir con `DecompressionStream`.
- **El `.xls` binario antiguo (BIFF/OLE) no se admite**, a propósito: MT5 no lo genera y
  su formato es mucho más complejo. Ese caso recibe un mensaje que explica qué hacer.
- **El script que aplica el tema vive en `js/theme-init.js`**, no en línea, para que
  `script-src 'self'` no necesite ni hashes ni excepciones.

## Lo que la aplicación no puede calcular, y por qué

Conviene tenerlo escrito, porque la tentación de aparentar más de lo que se mide es alta:

- **CSCV / PBO original.** Necesita la serie temporal de rendimientos de *cada* configuración.
  La exportación de optimización de MT5 solo trae métricas agregadas por pasada, así que es
  imposible. Se mide la **fragilidad de la regla de selección** en los dos sentidos de la
  partición IS/forward, que es útil pero es otra cosa.
- **Reality Check de White y SPA de Hansen.** Mismo motivo.
- **Sharpe deflactado publicado.** Se calcula una adaptación, no el original: la dispersión de
  la hipótesis nula sale de los Sharpe observados entre pasadas (no del error de estimación de
  Lo (2002) por número de operaciones, que se usó en una versión anterior y se retiró por
  partir de un supuesto falso sobre cómo MT5 calcula esa cifra — ver SR-1 en
  `docs/MT5_ASSUMPTIONS.md`). En una malla densa de una sola estrategia esa dispersión la
  produce en parte la forma de la superficie de parámetros, no solo el ruido, así que el
  umbral sube cuanta más señal real hay — nunca da falsa confianza.
- **Cifras limpias del forward.** La meseta se descubre en el in-sample, pero el forward la valida
  y decide el orden entre mesetas, así que sus números están algo favorecidos. El único número no
  contaminado es el del periodo no visto.

## Compatibilidad

Hacen falta módulos ES, Web Workers (de tipo módulo), `structuredClone` y, solo para `.xlsx`,
`DecompressionStream`: cualquier Chrome, Edge, Firefox o Safari de los últimos años.

## El informe del periodo no visto

Cuando hayas elegido configuración y quieras validarla en un tramo no usado: lanza el
backtest en el probador, clic derecho sobre los resultados → **Informe** → **HTML**, y
suelta ese archivo en la app. El formato Open XML también existe, pero el HTML se lee de
forma nativa, sin cargar ninguna librería externa.

## Privacidad

Los archivos se procesan en el navegador y no se envían a ningún servidor: no hay `fetch` ni
peticiones de ningún tipo con su contenido. La única petición externa de la página es el script
de Cloudflare Web Analytics, que cuenta visitas y no ve los archivos. En el navegador se guardan
tres preferencias (tema, idioma y mínimos) en `localStorage`.
