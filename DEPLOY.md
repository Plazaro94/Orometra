# Despliegue

## GitHub Pages (producci├│n actual)

Sitio est├ítico servido desde el repo. Cada `push` a `main` dispara el workflow
`.github/workflows/pages.yml` y publica en:

https://plazaro94.github.io/Orometra/

En el repo: **Settings ÔåÆ Pages ÔåÆ Source: GitHub Actions** (solo hace falta
configurarlo una vez). En el plan gratuito de GitHub, Pages requiere el
repositorio **p├║blico**.

## Vercel (alternativa)

Sitio est├ítico: no necesita comando de compilaci├│n ni runtime de servidor. Sube la carpeta como
proyecto nuevo y listo. El `vercel.json` incluido desactiva la cach├® de `index.html`, `.js` y
`.css` para que cada despliegue se vea de inmediato, y a├▒ade cabeceras de seguridad b├ísicas.

## Local

Hacen falta m├│dulos ES y un Web Worker, as├¡ que **no vale abrir `index.html` con doble clic**:
el navegador bloquea ambos sobre `file://`. Levanta el servidor incluido:

```bash
node tools/serve.js
```

Y abre `http://localhost:3000`. Si ese puerto est├í ocupado, pasa otro: `node tools/serve.js 8080`.

El servidor sirve los `.js` con el tipo MIME exacto que exigen los m├│dulos ES y desactiva la
cach├®, para que al recargar nunca se quede una versi├│n antigua. Se para con Ctrl+C.

## C├│mo exportar los datos desde MT5

1. Ejecuta la optimizaci├│n en el Probador de Estrategias.
2. En la pesta├▒a **Optimizaci├│n**, clic derecho sobre la tabla de resultados ÔåÆ exportar el
   informe. Acepta el `.xml` que propone por defecto: no hace falta cambiar la extensi├│n a
   `.xls`, porque el contenido es el mismo XML Spreadsheet en ambos casos y la aplicaci├│n lo
   lee de forma nativa.

   El `.opt` que aparece en `MQL5/Profiles/Tester` es la cach├® binaria del probador, no un
   formato de intercambio, y la aplicaci├│n no lo admite.
3. Si activaste **Forward**, repite la exportaci├│n desde la pesta├▒a de resultados forward.
4. Sube el archivo in-sample y, si lo tienes, el forward. Deben ser de la **misma** optimizaci├│n:
   la aplicaci├│n lo comprueba y avisa si no cuadran.

## Seguridad y dependencias

**Cero dependencias externas en tiempo de ejecuci├│n.** No hay CDN, ni anal├¡tica, ni
tipograf├¡as remotas. Eso permite una pol├¡tica de seguridad de contenido estricta, que se
sirve **igual en desarrollo que en producci├│n** (`tools/serve.js` y `vercel.json`) para que
un fallo de pol├¡tica aparezca al programar y no el d├¡a del despliegue:

```
default-src 'self'      ┬À script-src 'self'   ┬À style-src 'self'
connect-src 'self'      ┬À object-src 'none'   ┬À base-uri 'self'
form-action 'none'      ┬À frame-ancestors 'none'
img-src 'self' data:    ┬À worker-src 'self' blob:
style-src-attr 'unsafe-inline'   (tres atributos style= generados en plantillas)
```

Detalles que la hacen posible:

- **El `.xlsx` se lee con c├│digo propio** (`js/xlsx.js`, unas 160 l├¡neas). Antes se cargaba
  SheetJS desde jsdelivr: 900 KB ÔÇöm├ís del doble que la aplicaci├│n enteraÔÇö para un caso
  poco frecuente, que adem├ís romp├¡a la promesa de que todo se ejecuta en tu navegador y
  obligaba a abrir la pol├¡tica a un origen externo. Un `.xlsx` es un ZIP con XML dentro y
  el navegador ya sabe descomprimir con `DecompressionStream`.
- **El `.xls` binario antiguo (BIFF/OLE) no se admite**, a prop├│sito: MT5 no lo genera y
  su formato es mucho m├ís complejo. Ese caso recibe un mensaje que explica qu├® hacer.
- **El script que aplica el tema vive en `js/theme-init.js`**, no en l├¡nea, para que
  `script-src 'self'` no necesite ni hashes ni excepciones.

## Lo que la aplicaci├│n no puede calcular, y por qu├®

Conviene tenerlo escrito, porque la tentaci├│n de aparentar m├ís de lo que se mide es alta:

- **CSCV / PBO original.** Necesita la serie temporal de rendimientos de *cada* configuraci├│n.
  La exportaci├│n de optimizaci├│n de MT5 solo trae m├®tricas agregadas por pasada, as├¡ que es
  imposible. Se mide la **fragilidad de la regla de selecci├│n** en los dos sentidos de la
  partici├│n IS/forward, que es ├║til pero es otra cosa.
- **Reality Check de White y SPA de Hansen.** Mismo motivo.
- **Sharpe deflactado publicado.** Se calcula, pero con el error de estimaci├│n de Lo (2002) en
  lugar de la dispersi├│n entre ensayos: en una malla densa de una sola estrategia esa
  dispersi├│n la produce la forma de la superficie de par├ímetros, no el ruido. Se muestran los
  dos umbrales para que la distancia entre ellos se pueda juzgar.
- **Cifras limpias del forward.** El forward filtra y punt├║a, luego participa en la selecci├│n y
  sus n├║meros est├ín algo inflados. El ├║nico n├║mero no contaminado es el del periodo no visto.

## Compatibilidad

Hacen falta m├│dulos ES, Web Workers y `structuredClone`: cualquier Chrome, Edge, Firefox
o Safari de los ├║ltimos a├▒os. El ├║nico punto donde el navegador importa es la futura
conexi├│n a una carpeta local (File System Access API), que Firefox no implementa.

## El informe del periodo no visto

Cuando hayas elegido configuraci├│n y quieras validarla en un tramo no usado: lanza el
backtest en el probador, clic derecho sobre los resultados ÔåÆ **Informe** ÔåÆ **HTML**, y
suelta ese archivo en la app. El formato Open XML tambi├®n existe, pero el HTML se lee de
forma nativa, sin cargar ninguna librer├¡a externa.

## Privacidad

Los archivos se procesan en el navegador y no se env├¡an a ning├║n servidor. La ├║nica petici├│n
externa posible es la descarga del lector opcional de Excel binario, y solo ocurre si subes un
`.xlsx` real en lugar del `.xls` que exporta MT5.
