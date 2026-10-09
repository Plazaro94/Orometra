# Orometra

**Encuentra las zonas estables de tu EA de MetaTrader 5, no los picos.**

El nombre viene de la *orometría*, la rama de la geografía que mide el relieve. Sus dos
magnitudes centrales son la **prominencia** —cuánto se eleva una cima sobre el collado más
bajo que la conecta con terreno más alto— y el **aislamiento**. Es exactamente lo que hace
el motor sobre la superficie de parámetros: decidir si una cima está sola o forma parte de
terreno alto y ancho.

Auditoría anti-sobreajuste para optimizaciones de MetaTrader 5. Aplicación web estática:
todo el análisis se ejecuta en el navegador y ningún archivo sale del equipo.

Su función no es ordenar tu tabla de resultados de otra manera. Es **hacer de árbitro entre
el optimizador de MT5 y tu decisión de poner dinero real**, y su respuesta más valiosa es
«no, y aquí están los números».

## Principios de diseño

1. **Los parámetros no se reconocen por su nombre, sino por su estructura.** Para un mismo
   `Pass`, un parámetro vale lo mismo en el archivo in-sample y en el forward; una métrica no,
   porque se midió sobre otro periodo. Así funciona con cualquier EA. Las columnas de métricas
   sí se reconocen por nombre (cabeceras en inglés y en español); si faltan las clave, la
   aplicación lo avisa como crítico.
2. **Nunca se juzga con la vara con la que se optimizó.** La columna `Result` es el criterio
   que eligió el usuario (Balance, Recovery, Complex Criterion…): significa algo distinto en
   cada optimización y está contaminada por la selección. La calidad se reconstruye con las
   columnas objetivas que MT5 exporta siempre: factor de beneficio, recuperación, Sharpe,
   drawdown y número de operaciones.
3. **Umbrales absolutos, no percentiles.** Un percentil siempre encuentra un «mejor 5 %»,
   incluso donde todo pierde dinero. Con mínimos absolutos la aplicación puede decir que no
   hay nada.
4. **Se descubre en el in-sample y se valida en el forward; los mínimos se exigen en cada periodo por separado.** La meseta
   se busca con la calidad y los mínimos del in-sample. El forward vuelve a exigir los mínimos
   para validarla: si muchas de sus configuraciones fallan allí, esa meseta baja de puesto.
   (Existe un modo `joint`, no activado por defecto, en el que cada configuración vale lo que
   vale su peor periodo.)
5. **Se elige dentro de la meseta por puesto conjunto, no por su cima**: la configuración con
   mejor puesto en in-sample más su puesto en forward, ambos promediados con sus vecinas. Se
   midió en el banco de pruebas (`bench/`) frente a la regla maximin anterior y a métodos
   habituales. Sin meseta y con forward, se da una sugerencia **orientativa** con la misma
   regla. Resultado honesto del examen ciego: gana a elegir la pasada que MT5 pone primera (mayor beneficio in-sample), la mejor del
   forward, la suma de puestos y el azar; **pierde por poco contra «media con vecinas»** si
   se cuenta como fallo cada caso en que Orometra no propone meseta (con la sugerencia
   orientativa gana). Detalle en `bench/PREREGISTRO.md`.
6. **Solo se ignora lo demostrablemente plano, medido de dos formas.** La influencia de un
   parámetro se mide *aislada* (agrupando por su valor y promediando el resto) y *combinada*
   (dejando fijo todo lo demás), y manda la mayor de las dos. Un parámetro cuyo efecto se
   invierte según otro —un filtro de régimen, por ejemplo— sale **exactamente plano** en la
   primera medida. Descartarlo haría pasar por vecinas a configuraciones que no lo son,
   inflaría el soporte y fabricaría una meseta donde no hay ninguna.

7. **Lo que no se puede calcular, no se calcula, y se dice cuál es.** El CSCV de Bailey y
   López de Prado necesita la curva de equity de cada configuración, y la exportación de
   optimización de MT5 solo trae métricas agregadas por pasada. Aquí se mide otra cosa —la
   fragilidad de la regla de selección, en los dos sentidos de la partición— y por eso **no se
   llama PBO**. Lo mismo con el Reality Check de White y el SPA de Hansen: no se ejecutan, y
   se explica por qué.

8. **La herramienta se audita a sí misma.** Los umbrales internos son juicios calibrados, no
   cantidades derivadas. La búsqueda se repite 50 veces moviéndolos al azar un ±20 % y se
   informa de cuántas veces sigue ganando la misma región. Si una recomendación solo sobrevive
   con los números exactos que elegimos nosotros, no es una recomendación.

## Qué calcula

- Lectura nativa de **XML Spreadsheet 2003**, que es lo que MT5 escribe al exportar los
  resultados de una optimización, tanto si guardas con extensión `.xml` (la que propone por
  defecto) como si la cambias a `.xls`: el contenido es idéntico y la extensión da igual.
  También CSV/TSV, y `.xlsx` real mediante un lector opcional que solo se carga si hace falta.
- **El `.opt` no se admite, y es deliberado.** Es la caché binaria del probador, sin formato
  documentado y con estructura que cambia entre builds de MT5. Leerlo obligaría a adivinar el
  diseño de cada versión, y un fallo ahí no daría un error visible sino números equivocados.
- Comprobación de integridad: emparejado por `Pass`, duplicados y **prueba de procedencia**
  (el resultado del backtest del archivo forward debe reproducir el del in-sample). Aviso si
  el forward trae claramente menos filas que el in-sample (posible subconjunto de las mejores).
- Detección del método de optimización por cobertura (`probadas / espacio cartesiano`):
  rejilla completa, parcial o muestreo disperso de algoritmo genético.
- Vecindad ordinal con radio adaptativo, estabilidad local, detección de **acantilados** y de
  **picos aislados**. Los desplazamientos cubren la **bola** de Manhattan completa —cualquier
  número de ejes a la vez— y no solo la cruz de uno o dos ejes; cuando el espacio es tan grande
  que enumerarla no cabe en el presupuesto, se degrada a la aproximación anterior **avisando**.
- Detección de **rejillas con saltos desiguales** (`10, 20, 30, 100, 500`): el motor cuenta
  posiciones, no distancias, así que ahí la continuidad de una meseta puede ser un espejismo.
- El tamaño de una meseta se tope por el **volumen del espacio que abarca**, no por cuántas
  configuraciones se muestrearon: con algoritmo genético, la densidad mide dónde miró el
  optimizador tanto como dónde hay estabilidad.
- Mesetas como componentes conexas con suelo de calidad absoluto, y su **núcleo**.
- **Fragilidad de la selección**: fracción de veces que la regla «quédate con la primera de
  la tabla» falla al remuestrear configuraciones (en ambos sentidos de la partición IS/OOS).
  No es el PBO publicado (CSCV); ese exige curvas de equity por pasada.
- **Contraste de selección sobre el Sharpe (adaptación)**: compara el mejor Sharpe observado
  con el máximo que cabría esperar por azar tras N pruebas, usando la dispersión de los
  Sharpe observados entre pasadas (estilo Bailey y López de Prado) como nula — no el error
  de estimación de Lo (2002) por número de operaciones, retirado por partir de un supuesto
  falso sobre cómo MT5 calcula esa cifra (SR-1 en `docs/MT5_ASSUMPTIONS.md`). No es el
  Deflated Sharpe Ratio publicado.
- **Calificación de la FUERZA DE LA EVIDENCIA** («Fiabilidad»), no de la estrategia, en cinco
  niveles: insuficiente, débil, moderada, buena y sólida. «Sólida» es una meseta validada en
  el forward, estable al mover los umbrales y sin avisos sobre ella; «buena», lo mismo con
  un aviso. Como el forward ya se usó para elegir, un periodo no visto puede mantener el
  nivel o bajarlo a «moderada», nunca subirlo (criterios medidos en `bench/`). La aplicación no emite GO ni NO-GO, y es deliberado: mide lo que
  contienen unos datos, no si un EA va a funcionar. Distingue «no hay región conexa»
  de «no hay datos suficientes para saberlo», que son hechos, y deja la decisión al usuario.
- **Lectura del informe de backtest de MT5** (`Informe → HTML`): se suelta en la app y
  rellena solo la validación del periodo no visto. Trae tres cosas que el export de
  optimización no tiene: las **fechas reales** del periodo, **todos los parámetros de
  entrada** —con los que comprueba que el backtest se lanzó con la configuración
  propuesta y avisa si no— y la **lista de operaciones una a una**.
- **Validación en periodo no visto**: se introducen los resultados del backtest de la
  configuración elegida sobre un tramo que no se haya usado ni para optimizar ni para
  validar, y se comprueba si son *normales para ese EA* comparándolos con el recorrido
  que la meseta entera demostró.
- **A partir de las operaciones una a una del informe** (agrupadas por día): Monte Carlo
  por bootstrap estacionario (Politis & Romano 1994) sobre el periodo no visto —
  distribución de resultado, drawdown esperado y probabilidad de pérdida a 3/6/12 meses,
  solo cuando el tramo cubre ese horizonte entero—, tamaño de muestra y potencia
  estadística, stress de costes (coste extra por operación en puntos básicos del precio,
  con el valor del contrato deducido de las propias operaciones, así que no depende del
  instrumento ni del lote; con punto de equilibrio en puntos del instrumento) y aviso si el swap pesa una parte grande del resultado neto.
- Exportación: `.set` de la configuración propuesta, `.set` de **rango de refinamiento**
  acotado a un número de combinaciones ejecutable, informe JSON (con el nivel de evidencia que
  se muestra en pantalla y, aparte, el del motor) y CSV completo en el formato numérico del
  idioma activo.
- **Solo in-sample**: sin archivo forward se puede auditar igualmente; el veredicto lo marca
  como limitación crítica y no pasa de «débil».
- **Defensas de entrada**: dos exports forward o el mismo periodo cargado dos veces se
  rechazan (compararían un periodo consigo mismo); el separador decimal se deduce por columna
  (`1,101` es 1,101 en un CSV con coma decimal, no 1101); los valores de los archivos se
  escapan antes de pintarse.
- **Vista previa de los mínimos** y **aviso de empate** entre mesetas casi igualadas.

## Cómo se usa

1. En el Probador de Estrategias de MT5, lanza la optimización (con **Forward** si quieres
   validar) y, en la pestaña **Optimización**, clic derecho sobre la tabla → exportar. Acepta
   el `.xml` que propone; si activaste Forward, repite desde la pestaña de resultados forward.
   El `.opt` de `MQL5/Profiles/Tester` es la caché binaria del probador y no se admite.
2. Suelta los dos archivos en la app. Deben ser de la **misma** optimización: la aplicación lo
   comprueba y avisa si no cuadran.
3. Para validar la configuración elegida en un tramo no usado, lanza su backtest, clic
   derecho sobre los resultados → **Informe** → **HTML**, y suelta ese archivo en la pestaña
   del periodo no visto.

Las guías de la web (`/guides/`, `/es/guias/`) lo explican paso a paso.

## Ejecutar en local

Necesita un servidor HTTP: usa módulos ES y un Web Worker, que el navegador bloquea sobre
`file://`. El proyecto trae uno sin dependencias:

```bash
node tools/serve.js
```

Después abre `http://localhost:3000`. Acepta otro puerto como argumento: `node tools/serve.js 8080`.

## Páginas en español

Las páginas públicas (portada, metodología, guías, privacidad y «Quiénes somos») tienen una
versión por idioma: en inglés en la raíz (`/`, `/methodology/`, `/guides/…`) y en español bajo
`/es/…`, enlazadas con `hreflang` para que Google indexe
las dos. Las de `es/` **se generan**, no se editan a mano: cambia la página inglesa o
`js/i18n.js` y ejecuta

```bash
node tools/build-es.js
```

`npm test` falla (`build-es.js --check`) si `es/` no está al día. El idioma de estas páginas lo
decide su dirección; `js/theme-init.js` lleva a `/es/` a quien tiene el navegador en español
(o lo eligió antes) y los botones EN/ES cambian de dirección. La aplicación (`/app/`) sigue
siendo una sola página que se traduce en el navegador.

## Pruebas

```bash
npm test
```

Comprueba que `es/` está al día y ejecuta todos los `tests/*.test.js` (`tests/all.js`; una
prueba nueva entra sola si su nombre acaba en `.test.js`). Entre ellas:

- **`tests/source.test.js`** revisa el propio código (tildes en identificadores, clases CSS, ids).
- **`tests/regression.test.js`** compara el JSON canónico de la demo con un fixture fijo.
- **`tests/input-guards.test.js`**: dos forward, coma decimal, escape de valores y CSP en `<meta>`.
- **`tests/verdict-coherence.test.js`**: el copy del método coincide con el modo de selección,
  un solo nivel de evidencia en pantalla y en el export, modo solo in-sample e IC diario.
- **`tests/engine.test.js`**, **`tests/stress.test.js`**, **`tests/invariance.test.js`**, etc.: motor, invariantes y lecturas.
- **`tests/robustness.test.js`**: optimizaciones enormes (160.000 filas), tope de filas y errores con código.

La interfaz se prueba en un navegador de verdad (Chromium con Playwright, que no es
dependencia del proyecto: se usa el instalado; en CI lo instala el workflow):

```bash
npm run test:e2e
```

Carga archivos XML como los de MT5, recorre el informe, cambia de idioma, descarga el `.set`,
prueba un archivo que no sirve, cancela un análisis y comprueba la navegación en el móvil.

La imagen para redes (`og-image.jpg`, `og-image-es.jpg`) se genera con
`node tools/og-image.mjs`, a partir del relieve de la portada.

Para incluir archivos reales, colócalos como `IS(1).xls` y `OOS(1).xls` en tu carpeta de
descargas, o indica la ruta:

```bash
MT5_SAMPLES=/ruta/a/tus/exportaciones node tests/engine.test.js
```

## Accesibilidad y soporte

- Funciona con teclado: las zonas de carga son enfocables y se activan con Enter o
  espacio. Los archivos se sueltan en cualquier punto de la página.
- En móvil la barra lateral se convierte en una tira horizontal de pestañas.
- Hoja de estilos de impresión propia.
- Los mínimos exigidos se recuerdan entre sesiones; cada sección tiene enlace (`#mesetas`, …).

## Límites conocidos

- No sustituye a una prueba en un periodo que no se haya usado ni para optimizar ni para
  validar. En cuanto eliges mirando el forward, ese forward deja de ser ciego.
- La rejilla de optimización solo trae métricas agregadas por pasada, no la curva de
  capital de cada una. Por eso la **fragilidad de la selección** es un remuestreo de
  configuraciones y no el CSCV original sobre series temporales (no se llama PBO), y por
  eso el Monte Carlo y el stress de costes solo existen para la **configuración elegida**,
  sobre las operaciones una a una del periodo no visto — no para la rejilla entera.
- No conoce las fechas de los periodos de la rejilla: la duración relativa del forward se
  estima con el número de operaciones (el periodo no visto sí trae fechas reales, del
  informe HTML).
- El contraste del Sharpe no asume nada sobre cómo MT5 calcula esa cifra por dentro (SR-1
  en `docs/MT5_ASSUMPTIONS.md`, resuelto): usa solo la dispersión de los Sharpe que de
  verdad se observaron entre pasadas, no el número de operaciones. Suspenderlo es una
  señal fuerte; aprobarlo no demuestra nada por sí solo.
- No hace walk-forward con varias ventanas ni PBO/DSR publicados: exigirían lanzar y volver
  a lanzar el backtest por ventana, o una curva de equity por configuración de la rejilla,
  y eso escapa a «sube un archivo, todo ocurre en tu navegador» (ver `docs/SPEC.md`).

## Temas

Dos: oscuro y claro. El color pasa por una escala semántica de tokens definida al principio
de `styles.css` (`:root` y su versión `[data-theme="light"]`). Los nombres describen el
papel y no el color (`--ok-text` es «texto de estado correcto, legible sobre su fondo»), para
que al invertir el tema sigan significando lo mismo. Las pocas escalas con un color por
paso —los cinco niveles de fiabilidad (`--lv-1` a `--lv-5`) y el mapa de calor— se definen
junto a su componente, también para los dos temas.

El tema elegido se guarda en `localStorage` y se aplica en un script del `<head>` antes de
pintar, porque si no se ve un fogonazo del tema contrario al recargar.

## Despliegue, seguridad y privacidad

En [`DEPLOY.md`](DEPLOY.md): cómo se publica en GitHub Pages, la política de seguridad de
contenido, la analítica y qué se guarda en el navegador. La historia de cambios está en
[`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes ver, usar, modificar y compartir el código
para cualquier fin no comercial (estudio personal, investigación, un fork para tu propio
uso). El uso comercial —revenderlo, ofrecerlo como servicio de pago, incorporarlo a un
producto con el que se cobre— necesita permiso del autor.
