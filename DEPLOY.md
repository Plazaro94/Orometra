# Despliegue

## GitHub Pages (producción actual)

Sitio estático servido desde el repo. Cada `push` a `main` dispara el workflow
`.github/workflows/static.yml`: primero corre `npm test` y las pruebas de navegador y, si
pasan, publica solo lo que forma parte de la web (`app/`, `js/`, `core/`, la portada y las
demás páginas, `es/`, `fonts/`, `img/` y los iconos) en:

https://orometra.com (dominio propio, fichero `CNAME`)

No se suben a Pages `tests/`, `tools/`, `bench/`, `docs/` ni `node_modules/`.

Además, `.github/workflows/ci.yml` ejecuta los mismos tests en cada PR a `main`
(los push a `main` ya los prueba el despliegue). Las acciones van fijadas por SHA y
Dependabot (`.github/dependabot.yml`) propone sus actualizaciones.

En el repo: **Settings → Pages → Source: GitHub Actions** (solo hace falta
configurarlo una vez). En el plan gratuito de GitHub, Pages requiere el
repositorio **público**.

## Local

Hacen falta módulos ES y un Web Worker, así que **no vale abrir `index.html` con doble clic**:
el navegador bloquea ambos sobre `file://`. Levanta el servidor incluido:

```bash
node tools/serve.js
```

Y abre `http://localhost:3000`. Si ese puerto está ocupado, pasa otro: `node tools/serve.js 8080`.

El servidor sirve los `.js` con el tipo MIME exacto que exigen los módulos ES y desactiva la
caché, para que al recargar nunca se quede una versión antigua. Se para con Ctrl+C.

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
- **`tools/serve.js`** (el servidor local) envía la política completa como cabecera, con
  `frame-ancestors`. `tests/input-guards.test.js` comprueba que el `<meta>` de cada página
  coincide con ella.

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

## Compatibilidad

Hacen falta módulos ES, Web Workers (de tipo módulo), `structuredClone` y, solo para `.xlsx`,
`DecompressionStream`: cualquier Chrome, Edge, Firefox o Safari de los últimos años.

## Privacidad

Los archivos se procesan en el navegador y no se envían a ningún servidor: no hay `fetch` ni
peticiones de ningún tipo con su contenido. Las únicas peticiones externas son las de la
analítica descrita arriba, que cuenta visitas y no ve los archivos. En el navegador se guardan
tres preferencias (tema, idioma y mínimos) en `localStorage`.
