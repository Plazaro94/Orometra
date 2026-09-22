# Despliegue

## GitHub Pages (producción actual)

Sitio estático servido desde el repo. Cada `push` a `main` dispara el workflow
`.github/workflows/pages.yml` y publica en:

https://plazaro94.github.io/Orometra/

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

**Cero dependencias externas en tiempo de ejecución.** No hay CDN, ni analítica, ni
tipografías remotas. Eso permite una política de seguridad de contenido estricta, que se
sirve **igual en desarrollo que en producción** (`tools/serve.js` y `vercel.json`) para que
un fallo de política aparezca al programar y no el día del despliegue:

```
default-src 'self'      · script-src 'self'   · style-src 'self'
connect-src 'self'      · object-src 'none'   · base-uri 'self'
form-action 'none'      · frame-ancestors 'none'
img-src 'self' data:    · worker-src 'self' blob:
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
- **Sharpe deflactado publicado.** Se calcula, pero con el error de estimación de Lo (2002) en
  lugar de la dispersión entre ensayos: en una malla densa de una sola estrategia esa
  dispersión la produce la forma de la superficie de parámetros, no el ruido. Se muestran los
  dos umbrales para que la distancia entre ellos se pueda juzgar.
- **Cifras limpias del forward.** El forward filtra y puntúa, luego participa en la selección y
  sus números están algo inflados. El único número no contaminado es el del periodo no visto.

## Compatibilidad

Hacen falta módulos ES, Web Workers y `structuredClone`: cualquier Chrome, Edge, Firefox
o Safari de los últimos años. El único punto donde el navegador importa es la futura
conexión a una carpeta local (File System Access API), que Firefox no implementa.

## El informe del periodo no visto

Cuando hayas elegido configuración y quieras validarla en un tramo no usado: lanza el
backtest en el probador, clic derecho sobre los resultados → **Informe** → **HTML**, y
suelta ese archivo en la app. El formato Open XML también existe, pero el HTML se lee de
forma nativa, sin cargar ninguna librería externa.

## Privacidad

Los archivos se procesan en el navegador y no se envían a ningún servidor. La única petición
externa posible es la descarga del lector opcional de Excel binario, y solo ocurre si subes un
`.xlsx` real en lugar del `.xls` que exporta MT5.
