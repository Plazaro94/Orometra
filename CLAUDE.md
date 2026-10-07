# Orometra — guía para Claude Code

Web estática (JS sin dependencias, módulos ES, Web Worker) que audita optimizaciones de
MetaTrader 5: busca **mesetas** de parámetros estables en lugar de picos y califica la
**fuerza de la evidencia**, no la estrategia. Todo se calcula en el navegador. Se publica en
https://orometra.com.

Antes de cambiar algo de fondo, lee lo que aplique:
`README.md` (qué hace y por qué) · `docs/SPEC.md` (principios y normas) ·
`docs/CHANGELOG.md` (historia y decisiones) · `docs/MT5_ASSUMPTIONS.md` (qué se sabe de MT5
y qué no) · `bench/PREREGISTRO.md` (cómo se valida el motor) · `DEPLOY.md` (publicación).

## Cómo trabajar con el autor

- Habla en **español**, conciso y al grano.
- Si pide **analizar o auditar**, no toques código hasta que lo diga.
- **No inventes ni infles problemas.** Si algo está bien, dilo. Cada hallazgo, con
  `archivo:línea` y un escenario concreto; si no lo has podido comprobar, dilo también.
- Al terminar, separa lo **comprobado** de lo **no comprobado**.
- Cambios visibles: enséñale capturas del antes y el después (móvil y escritorio, tema
  claro y oscuro) y espera su visto bueno antes de publicar.

## Comandos

```bash
node tools/serve.js          # servidor local en http://localhost:3000 (hace falta: módulos ES y worker)
npm test                     # build-es --check + tests/*.test.js (~3 min)
npm run test:e2e             # navegador real (Playwright + Chromium; lanza su propio servidor)
node tools/build-es.js       # regenera es/ tras cambiar una página inglesa o js/i18n.js
node bench/run.js            # banco del motor (ver bench/PREREGISTRO.md)
node bench/unseen.js 100     # banco del contraste del periodo no visto (cifras que cita la app)
```

Antes de cada push: `npm test`, y `npm run test:e2e` si se toca la interfaz.

## Estructura

- `core/` — motor puro, sin DOM: `analysis.js` (orquesta), `engine.js` (vecindad, mesetas),
  `metrics.js` (calidad y mínimos), `verdict.js` (nivel de evidencia y hallazgos),
  `unseen.js` (periodo no visto), `report.js` (informe HTML de backtest), `trades/`
  (Monte Carlo, muestra y costes sobre las operaciones del informe), `setfile.js`.
- `js/` — interfaz por secciones (`ui-*.js`), exportación (`export.js`), textos (`i18n.js`).
- `es/` — **generado** por `tools/build-es.js`: no se edita a mano.
- `tests/` — cualquier `*.test.js` entra solo en `npm test`; `tests/e2e.mjs` es el navegador.

## Principios que no se negocian (de docs/SPEC.md)

1. No se juzga con la columna `Result` de MT5: se usan las métricas objetivas.
2. Umbrales absolutos, no percentiles: la app tiene que poder decir «aquí no hay nada».
3. **Evidencia, no permiso:** la app nunca dice «opera» ni da GO/NO-GO.
4. Ninguna cifra lleva el nombre de un método publicado (PBO, DSR, CSCV…) si no se ha
   calculado como en el método publicado; las adaptaciones se llaman adaptaciones.
5. Lo que no se puede calcular no se calcula, y se dice por qué.
6. Determinismo: todo lo aleatorio usa semilla (`core/rng.js`).

## Normas de código

- Textos visibles **en ES y EN**: `L('es', 'en')` o claves en `js/i18n.js`. Lenguaje de
  trader; lo técnico, en el detalle. Los dos idiomas deben decir lo mismo.
- Español **de España**, con **tú**, comillas «» y espacio antes de % («20 %»). Inglés
  **americano** (analyze, behavior, gray…). «Orometra» es la marca: no se traduce ni se cambia.
- Términos asentados: meseta (plateau), pasada (pass), configuración, mínimos (minimums),
  drawdown, factor de beneficio, probador (Strategy Tester), «columna Result».
- Sin tildes en identificadores (lo vigila `tests/source.test.js`).
- Todo valor que venga de los archivos del usuario se escapa al pintarlo: `esc()` y
  `paramHtml()`; nunca `paramValue()` dentro de una plantilla.
- Los valores de parámetros se muestran como en MT5: exactos y con punto decimal.
- Cero dependencias en tiempo de ejecución. Lo pesado va en el worker.
- Cada función estadística nueva llega con una prueba de respuesta conocida.
- **Si cambias un método estadístico, mídelo en `bench/` antes y después**, y cita cifras
  reales. Si cambian cifras que cita la app, actualiza el texto y su prueba.
- Al cerrar un trabajo relevante, entrada en `docs/CHANGELOG.md` (la más reciente arriba).

## Git y publicación

- Commits en español. El trabajo pendiente de visto bueno va en la rama `trabajo`; con el
  visto bueno, se lleva a `main`. Desde las sesiones en la nube no se pueden borrar ramas
  ni crear etiquetas en GitHub.
- Cada push a `main` publica en orometra.com (`.github/workflows/static.yml`, que antes pasa
  `npm test` y el navegador). `ci.yml` pasa las mismas pruebas en cada PR.

## Pendiente conocido

- **Probar con un informe HTML real de MT5.** El stress de costes deduce el valor del
  contrato emparejando cada cierre con su apertura (`core/report.js`,
  `core/trades/costs.js`); solo se ha probado con informes sintéticos. Lo más arriesgado:
  cuentas de cobertura con varias posiciones abiertas a la vez y terminales en español.
- Sin confirmar con MT5: si el `.set` acepta enums escritos como texto y si las cabeceras
  del terminal en español coinciden con los patrones de `core/schema.js`.
- Aceptado a propósito: `collapseToTopology` (`core/engine.js`) se queda con la mejor fila
  al agrupar configuraciones que solo difieren en parámetros planos; el sesgo es pequeño.
