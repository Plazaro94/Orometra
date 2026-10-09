# Changelog

## 2026-10-09 — Metodología al día con el motor, y un fallo de la estabilidad corregido

- **Fallo corregido** (`core/analysis.js`): al repetir la búsqueda moviendo nuestros umbrales
  un ±20 %, la fracción mínima de vecinas que cumplen (0,9) se multiplicaba por el factor y
  por encima de ×1,111 pedía más del 100 %. Esas 9 de 50 repeticiones nunca encontraban
  meseta, así que la estabilidad no pasaba de 0,82 (y el dibujo de Metodología, «48 / 50»,
  era imposible). Ahora se mueve lo que le falta para 1 (entre 0,88 y 0,92). Salió al
  documentar el motor, no al mirar resultados.
- **Banco:** enmienda en `bench/PREREGISTRO.md` y quinto examen ciego (5001-5100). Aprueba
  los criterios de «buena» y «sólida» (ninguna «sólida» sin ventaja; «buena» 2 % en S5, en
  el límite) y suspende tres que el motor anterior suspende igual con esas semillas
  («moderada o más» en S5, 8 %; media con vecinas, 0,198 frente a 0,228; S8 más de 0,10
  peor que la n.º 1 de MT5). La portada cita ahora este examen.
- **Metodología reescrita** contra el código, en lenguaje de trader (ES y EN): cómo se
  puntúa la calidad (escala desde tus mínimos, media geométrica, qué pesa más); qué es
  vecina y qué hace falta para una meseta; el forward con sus cifras (80 % y 65 %, las
  configuraciones sin forward no cuentan como validadas); el contraste del azar como
  adaptación y el resto de comprobaciones que el informe enseña; los umbrales de la
  estabilidad; los avisos de la tabla que no bajan el nivel; el periodo no visto comparado
  con la meseta, que solo mantiene o baja el nivel y cuánto detecta. Sección nueva «Cómo
  sabemos que funciona» con las cifras del último examen y dónde falla, y tres límites más
  en «Lo que no hace». `tests/home-bench.test.js` vigila también esas cifras.

## 2026-10-09 — «Sólida» sin periodo no visto, medida en el banco

- **El problema:** con exports reales de MT5 el nivel no podía pasar de «moderada».
  «Sólida» exigía cero avisos, y el aviso de que MT5 solo reexporta al forward las mejores
  pasadas sale en todo export real. «Buena» solo se veía en el ejemplo, cuyo forward trae
  todas las filas. En el banco, 0 «sólidas» en el segundo examen.
- **Motor** (`core/verdict.js`): los avisos que miden el orden de la tabla y no la meseta
  (ranking de MT5, orden de la nota de Orometra entre periodos, transferencia del ranking,
  asimetría entre periodos, valores que se invierten por parámetro, preselección del
  forward) se siguen mostrando, pero no cuentan para los niveles altos. «Sólida»: sin
  críticos, meseta con configuraciones probadas en el forward, búsqueda repetida moviendo
  los umbrales y ningún aviso sobre la meseta. «Buena»: lo mismo con un aviso, si la
  recomendación aguanta al menos el 80 % de las variaciones de umbral. La elección de la
  configuración no cambia. Dos textos de avisos ajustados a lo que miden.
- **Periodo no visto** (`js/ui-verdict.js`): mantiene el nivel («Evidencia sólida, y el
  periodo no visto no la contradice») o lo baja a «moderada» si va en contra; nunca lo
  sube. Un informe de otra configuración no cambia nada.
- **Banco** (`bench/PREREGISTRO.md`, dos enmiendas): criterios nuevos «sólida» ≤ 1 % y
  «buena o sólida» ≤ 2 % en cada escenario sin ventaja. El tercer examen (3001-3100)
  suspendió el segundo en S5 (3 %) y se publica tal cual; «buena» se endureció y el cuarto
  examen (4001-4100, ciego) aprueba los criterios nuevos: «sólida» 0 % y «buena o sólida»
  1 % como máximo sin ventaja; con ventaja, 52 «buena» y 24 «sólida» de 500; ventaja real
  media de la elegida 0,178 (moderada) < 0,219 (buena) < 0,239 (sólida). Suspende dos
  criterios que ya suspendía el motor anterior con esas semillas: «moderada o más» en S5
  (7 %) y la elección frente a la media con vecinas (0,227 frente a 0,192).
- **Portada:** la sección del banco cita ahora el cuarto examen (falsas alarmas 2,7 % y
  ninguna «sólida», ventajas detectadas 90 %, 0,23 frente a 0,29 de la n.º 1 de MT5) y
  añade el punto débil de S5. El ejemplo de la tarjeta, la metodología, la guía del
  forward y el README describen los niveles nuevos. Pruebas: `tests/levels.test.js` y
  las de coherencia del veredicto.

## 2026-10-09 — Portada: cifras del banco de pruebas y foto del cierre más ligera

- **Sección nueva en la portada, «Puesto a prueba donde se sabe la respuesta»**, entre la
  tarjeta de ejemplo y «Lo que hay detrás». Tres cifras del segundo examen, ciego
  (`bench/results/REPORT-exam2.md`): falsas alarmas 1,7 % (5 de 300 optimizaciones sin
  ventaja con «moderada» o más), ventajas detectadas 85 % (35 de 41 con ventaja clara) y
  distancia mediana a la mejor configuración en el periodo no visto 0,22 frente a 0,30 de la
  n.º 1 de MT5. Debajo, en caja, dónde no gana: la media con vecinas queda por delante en el
  total (0,19) y la n.º 1 de MT5 gana en S7 (genética) y S8 (rejilla de un export real),
  porque cada abstención cuenta como fallo; 9 de 11 criterios; datos simulados. Enlaces al
  prerregistro y a los resultados.
- Antes de citarlas, el examen se repitió con el motor actual (`BENCH_TAG=now node
  bench/run.js exam2`): el informe sale idéntico al publicado, salvo los tiempos.
- `tests/home-bench.test.js` lee `REPORT-exam2.md` y comprueba que los textos en los dos
  idiomas citan esas cifras, y que lo que afirma la nota es cierto en el informe (incluido
  el «por eso»: con la sugerencia orientativa, gana en S7, S8 y a la media con vecinas).
- **Foto del cierre en móvil** (`cierre-mov-915`): AVIF de 192 a 98 KB y WebP de reserva de
  216 a 164 KB, sin diferencia visible. La portada en móvil baja de 599 a 508 KB. El resto
  de la portada ya estaba en su sitio (485-732 KB en escritorio según tema y pantalla).
- Caché de estilos `?v=20261009a`.

## 2026-10-08 — Guías revisadas una a una y ampliadas

Revisión de las seis guías (EN y ES) contra la ayuda de MetaQuotes y el código.

- **Errores corregidos:**
  - Informe del probador: el drawdown relativo no es «esa misma caída en porcentaje»: el
    máximo en dinero y el relativo en % son dos máximos distintos y pueden ser episodios
    diferentes (ayuda de MT5). Ejemplo resuelto en la guía.
  - Forward: decía que Orometra contrasta «sin mezclar ni promediar los dos periodos», y el
    motor elige dentro de la meseta por puesto conjunto in-sample + forward. Ahora lo
    explica tal cual, y por qué eso obliga a pedir un periodo no visto.
- **Precisión:** el forward prueba el 10 % (completa) o el 25 % (genética) mejor, con un
  número mínimo de pasadas (ayuda de MT5; el export real de `MT5_ASSUMPTIONS.md`, 810 → 256,
  encaja con el mínimo de 256 que se cita en los foros). Los criterios «Profit Factor max» y
  similares se describían en la ayuda antigua combinados con el balance: la guía lo dice y
  remite a la ayuda del propio terminal. Los rótulos del MT5 en español, sin confirmar, van
  con el inglés entre paréntesis.
- **Ampliadas** (de ~650 a ~1.150–1.450 palabras cada una), con ejemplos resueltos:
  exportar (preparar el probador, columnas de cada archivo, Back Result, comprobar los
  archivos); forward (cuántas operaciones necesita, qué pasadas llegan y por qué no es una
  muestra al azar, cómo leer su tabla con un ejemplo, el tercer tramo); genética o completa
  (contar combinaciones, estimar el tiempo con los agentes, cobertura, decidir paso a paso);
  criterio (tabla de qué premia cada uno, criterio complejo de la versión 2615, ejemplo de
  `OnTester()`); informe (fórmulas de cada cifra, drawdowns con ejemplo, Sharpe de la versión
  3210 y sus franjas, calidad del histórico, modos de modelado y costes). Sobreoptimización:
  el mínimo de pasadas del forward y la prueba de tus mínimos en «Se examina a sí mismo».
- Tablas, ejemplos y código con estilo propio (`guide-table`, `guide-note`, `guide-code`),
  desplazables con teclado si no caben. Fecha de revisión de las seis guías: 2026-10-08.

## 2026-10-08 — Historial local de análisis

- **Qué guarda:** tras cada análisis (no el ejemplo), un resumen de ~0,7 KB en el navegador
  (`orometra.history`): nombres de archivo y de parámetros, mínimos, nivel mostrado,
  configuración recomendada, tamaño, robustez y tramo de su meseta por parámetro, y el
  resultado del periodo no visto si se comprueba. Nunca los archivos ni las tablas. Se
  conservan los 50 más recientes. Volver a analizar exactamente lo mismo no cuenta como otro
  intento. Activado por defecto, con un aviso la primera vez («Entendido» / «No guardar
  historial») y un interruptor en la pestaña.
- **El mismo EA:** el XML de MT5 no trae nombre, símbolo ni fechas, así que se reconoce por
  sus parámetros (huella FNV-1a del conjunto de nombres). Cada EA admite una etiqueta propia.
- **En el veredicto:** «Frente a tu análisis anterior de este EA»: nivel antes y ahora,
  tamaño y robustez de la meseta y, sobre todo, si la configuración recomendada ahora cae
  dentro del tramo de la meseta de la otra vez, parámetro a parámetro. Si cambiaron los
  mínimos o el forward, se dice que los niveles no son comparables. «Coherente con una meseta
  real; si son los mismos datos, no es una prueba independiente».
- **Aviso de intentos:** desde el 3.er análisis del mismo EA, «subir de nivel tras varios
  intentos no es más evidencia: es probar más veces». No se sabe si el periodo es el mismo
  (no hay fechas) y se dice.
- **Pestaña Historial** (08, accesible sin análisis): lista por EA con fecha, archivos,
  mínimos, nivel, configuración recomendada y periodo no visto; borrar uno o todo (con
  confirmación) e interruptor.
- **Privacidad** (página y aviso legal de la app, ES/EN) al día; la prueba AUD-08 exige ahora
  que se nombre el historial. `core/history.js` con 34 pruebas de respuesta conocida
  (`tests/history.test.js`) y 11 comprobaciones de navegador nuevas.
- Sin exportar ni importar el historial por ahora (decisión del autor).

## 2026-10-08 — Tema según el sistema en la primera visita

- Sin elección guardada, la web usa el tema del sistema (claro u oscuro) en lugar de
  empezar siempre en oscuro, y lo sigue si el sistema cambia (modo noche automático). En
  cuanto el usuario elige un tema, manda su elección. Vale para portada, páginas de texto y
  app.
- La etiqueta `color-scheme` sigue al tema antes de pintar: con el sistema en claro ya no
  hay un instante de fondo oscuro al cargar.
- Prueba de navegador nueva: sistema claro u oscuro, con y sin elección guardada, en la
  portada y en la app (8 comprobaciones).

## 2026-10-08 — Portada equilibrada, guías en el móvil, tarjeta de ejemplo clicable y gráficos del veredicto en el móvil

Comprobado a 320, 390, 768, 1024, 1440 y 1920 px, en los dos temas.

- **Portada, «En MT5, el n.º 1 suele ser el más frágil»:** las dos tarjetas comparten filas
  (subgrid): título, recuadro, imagen y texto quedan a la misma altura. Antes, a la de MT5 le
  sobraban 118–149 px abajo en escritorio. Lleva un recuadro neutro gemelo del lima: «La n.º 1
  de MT5: pasada 1842 · El Resultado más alto entre miles de pasadas». En el móvil, una
  debajo de otra como siempre. Las etiquetas del diagrama crecen (de 8 a 10 px a 320 px).
- **Guías en el móvil:** sin huecos de hasta 46 px sobre «Leer la guía». Las tarjetas solo se
  igualan en altura cuando van a dos columnas.
- **Tarjeta de ejemplo de la portada:** sus botones («Descargar .set», «Copiar parámetros»)
  parecían funcionar y no hacían nada. Ahora toda la tarjeta es una vista previa: tocarla en
  cualquier punto abre el informe de ejemplo completo, donde esos botones funcionan. Lo hace
  el enlace «Ver el informe de ejemplo completo», estirado sobre el bloque (el texto se sigue
  leyendo como texto); al pasar el ratón la tarjeta se eleva, y con teclado se ve el foco.
- **Veredicto → «Gráficos: optimización frente a validación» en el móvil:** la nube de puntos
  y los deciles se dibujan con un formato compacto (280 unidades, ejes y etiquetas más cortos)
  y caben sin deslizar desde 320 px. Al girar el móvil se redibujan solos sin cerrar el
  desplegable. En escritorio, igual que antes.
- **Medidor de fiabilidad:** no cambia. El comentario de la regla de color de `styles.css`
  recoge ahora la escala de rojo a lima como excepción deliberada.

## 2026-10-08 — Diagrama de cajas y mapa de calor enteros en el móvil

- **Parámetros → «Calidad por valor del parámetro» y «Los dos parámetros más
  influyentes»:** pasan de SVG de 620 unidades a HTML con rejilla CSS. En el móvil se
  deslizaban de lado y a 390 px solo se veían 3 de los 7 valores del diagrama y 5 de las 7
  columnas del mapa; ahora caben enteros desde 360 px. En escritorio se ven como antes.
  Solo si hay más valores de los que caben (o en pantallas de 320 px) se vuelve a deslizar,
  con el mismo difuminado que avisa.
- Celdas y cajas se imprimen (`print-color-adjust`); el detalle de cada celda sigue al pasar
  el ratón.
- El aviso «Se necesitan dos parámetros con varios valores» salía solo en español; ahora
  también en inglés.
- Prueba de navegador nueva: en el móvil, los tres gráficos de Parámetros caben sin deslizar y
  su texto no baja de 10 px.

## 2026-10-08 — Tarjetas anchas del informe a dos columnas

Medido a 1440 px: tres tarjetas usaban la mitad de su ancho (el texto va a 72 caracteres
como máximo) y dejaban la otra mitad vacía. Ahora, cuando la tarjeta mide 880 px o más (se
mide la tarjeta, no la ventana: *container queries*), se reparten en dos columnas. En tablet
y móvil no cambian.

- **«Por qué este nivel»** con un solo lado (solo «A favor» o solo «En contra»): las
  razones en dos columnas. Del 54 % al 98 % del ancho y de 667 a 509 px de alto.
- **«Influencia relativa»:** el gráfico a la izquierda y su explicación a la derecha
  (del 49 % al 98 %; de 408 a 330 px).
- **«Carga aquí el informe del backtest»** (periodo no visto): el texto a la izquierda y, a la
  derecha, dónde soltar el informe, con el botón (del 49 % al 92 %).
- El mapa de calor se queda como estaba: partido, salía un 17 % más pequeño (su ancho de
  referencia de 620 unidades es a propósito) y su lado derecho ya es parte del SVG.

## 2026-10-08 — Cabecera compacta en el informe y pico frente a meseta en la portada

- **Informe, fuera del veredicto:** la cabecera pasa de un titular de tres líneas (~285 px
  antes del contenido en cada pestaña) a una línea con el nivel («● Evidencia buena»), la
  pasada y «Descargar .set» junto a «Empezar de cero» y «Exportar». En escritorio queda fija
  arriba al bajar; en el móvil no, porque ya están fijas las pestañas. Sin forward, el botón
  es «Descargar rango»; sin meseta, no hay botón y se dice «Ninguna configuración con
  garantías» (o la sugerencia orientativa). El titular completo sigue en el h1 para el lector
  de pantalla y al imprimir; la pestaña del veredicto no cambia.
- **Portada, «Lo que hace Orometra»:** un diagrama con las mismas pasadas que la tabla de al
  lado: la n.º 1 de MT5 (1842) es un pico solo cuyas vecinas no pasan tus mínimos; la 4283,
  el centro de una meseta que sí los pasa. Pico en gris y elegida en lima, como en la tabla.
  Es SVG en la propia página, sin código 3D. Desde que salieron el relieve 3D (#117) y los
  estorninos, ninguna imagen de la portada contaba la idea de pico frente a meseta.

## 2026-10-08 — Auditoría de diseño: seis arreglos visuales

- **Influencia relativa (pestaña Parámetros):** pasa de SVG de 620 px a una lista HTML que
  se adapta al ancho. En el móvil, el gráfico se deslizaba de lado y las cifras
  («0.87 · aislado 0.67») quedaban fuera de vista; ahora va nombre y cifra en una línea y la
  barra debajo. En escritorio se ve como antes. Las barras se imprimen
  (`print-color-adjust`).
- **Tablas apiladas en el móvil:** las etiquetas («Parámetro», «Valores») salían en
  monoespaciada si la celda lo era; ahora siempre en la letra del texto.
- **Títulos de pestaña** con interlineado 1,2 (heredaban 1,55: en el móvil, dos líneas muy
  separadas).
- **Índice de las guías:** sin doble número («01 1. Antes de optimizar…» → «01 Antes de
  optimizar…»).
- **Accesibilidad:** `role="group"` en la tarjeta de ejemplo de la portada y en los valores
  recomendados del informe (un `aria-label` en un `div` sin rol no se anuncia); fuera un
  `aria-labelledby` redundante en las preguntas frecuentes.
- **Portada:** «12 de 12» como en la app (antes «12 / 12»). Caché de estilos `?v=20261008a`.

## 2026-10-07 — Plurales, «%» en inglés y la banda del periodo no visto

- **Singular con una sola unidad:** «1 configuración supera los mínimos», «1 pasada sin
  pareja», «solo 1 vecino probado», «Has optimizado 1 parámetro», «Falta #3: esa
  configuración…», «El .set solo lleva el parámetro que optimizaste»… (antes, siempre en
  plural). Lo mismo en inglés.
- **Mínimos que no filtran:** con varios, la frase dice «por ninguno de ellos, así que
  moverlos» (antes, siempre «moverlo»).
- **Porcentajes:** nuevo `pctSign()` en `js/i18n-core.js`: «20 %» en español y «20%» en inglés
  donde la cifra se compone igual para los dos idiomas (antes, en inglés salía «20 %»).
- **Periodo no visto:** la banda de cada métrica tiene descripción para lectores de pantalla
  (valor, estado y rango habitual).

## 2026-10-07 — CLAUDE.md

- Nuevo `CLAUDE.md` en la raíz: lo lee Claude Code al empezar cada sesión. Resume cómo
  trabajar con el autor, los comandos, la estructura, los principios de `docs/SPEC.md`, las
  normas de código y de texto (español de España con tú, inglés americano, términos
  asentados), cómo se publica y lo pendiente conocido, para no repetirlo en cada chat.

## 2026-10-07 — Un solo botón en la portada, «Analizar» en la app y diagrama del paso 9

- **Portada:** fuera el círculo con flecha junto a «Analizar mis resultados» (arriba y en el
  cierre): llevaba al mismo sitio que el botón.
- **App vacía:** «Analizar» desactivado ya no parece otra tarjeta (sin fondo, con su flecha
  apagada) y dice cuándo se activa en vez de repetir lo que ya dice la zona de carga. La
  nota del .set pasa de cuatro líneas a dos y de 13 a 14 px.
- **Metodología, paso 9:** «Monte Carlo», «Tamaño de muestra» y «Stress de costes» caben en
  una línea mientras el diagrama mide más de 470 px; por debajo, con la letra agrandada, se
  siguen partiendo en dos.

## 2026-10-07 — Páginas de texto: una columna de lectura y letra más grande

- **Metodología, Guías, Privacidad y Quiénes somos:** el contenido va en una columna centrada
  de 640 px; separadores, listas y diagramas miden lo mismo que el texto. Antes, el texto
  ocupaba ~470 px pegado a la izquierda y dejaba media pantalla vacía. El índice de la
  Metodología y las tarjetas de Privacidad y de Guías se abren a 920 px. La cabecera con foto
  no cambia.
- **Metodología:** cada paso lleva su diagrama debajo del texto, a lo ancho de la columna, en
  vez del zigzag (que apretaba el texto de esos pasos en 360 px).
- **Texto largo a 18 px** (16 en el móvil, antes 15) y entradilla a 20 px; títulos de sección
  a 24 px para que sigan destacando. Unos 70–80 caracteres por línea en escritorio.

## 2026-10-07 — Escala de fiabilidad en el móvil y texto del informe más legible

- **Escala de fiabilidad:** en móviles de 361 a ~420 px (iPhone de 390 px), «Insuficiente»
  se salía de su tramo y quedaba pegado a «Débil». Ahora, si la escala mide menos de 356 px,
  se muestra solo el nivel actual (antes, por debajo de 313 px); desde 356 px hay 8 px o más
  entre nombres.
- **Informe de la app:** el 87 % del texto iba a 13–14 px. Los párrafos de lectura (notas de
  gráficos, introducciones de panel, hallazgos, «A favor / En contra», límites, pasos de
  «Qué hacer ahora», nota de la pasada elegida) pasan a 15 px, y las notas secundarias a
  14 px. Etiquetas, cifras, tablas y botones no cambian.

## 2026-10-07 — Portada sin la sección de los estorninos

- Se quita «Ningún estornino vuela solo»: repetía la idea de las vecinas, que la portada ya
  explica dos secciones antes, con una metáfora que competía con la del relieve. Fuera también
  sus textos, las 12 fotos de la bandada y su etalonado en `tools/fotos.mjs`.

## 2026-10-07 — Auditoría de textos en español e inglés

Revisión de todos los textos visibles (diccionario, veredicto, mesetas, periodo no visto,
errores, exportaciones y páginas públicas), comparando cada pareja ES/EN. Unos 190 cambios
puntuales; lo que estaba bien no se ha tocado.

- **Incoherencias ES↔EN corregidas:** el inglés decía «no plateau to fall back on» donde el
  español (y la lógica) dicen «no hay región amplia»; «cerca de la mitad de los casos» con
  estabilidades de hasta el 80 % pasa a «hasta en la mitad»; la nota del Sharpe menciona los
  rendimientos logarítmicos en los dos idiomas; el glosario de coherencia y la descripción
  de privacidad para compartir dicen lo mismo en ambos.
- **Sin traducir:** el pie de página (`aria-label`, `title`) y la navegación de la app
  quedaban en inglés en las páginas españolas; el gráfico de sensibilidad pintaba
  «particion»/«plano» en inglés; los nombres de los archivos descargados salían siempre en
  español.
- **Términos unificados:** «drawdown» en vez de «caída», «minimums» en vez de «gates» y
  «Minima», «meseta» en vez de «región», «probador» en vez de «tester», «columna Result»,
  «rejilla», «archivo», y «test/check» en vez del calco «contrast» en inglés.
- **Errores en lenguaje llano:** «masa interior» y «región conexa con soporte local» se
  explican sin jerga; «exporta el informe XML» pasa a «Exportar a XML».
- **Ortografía:** inglés americano (modeling, gray, around, parenthesized), espacio antes de
  % y comillas «» en español, tildes, rayas y concordancias. «Sharpe» ya no sale en
  minúscula en el periodo no visto.

## 2026-10-07 — Revisión independiente del PR de la auditoría

- **Reversiones «in/out» (cuentas de compensación):** el stress de costes contaba dos veces
  el lote que se abre en sentido contrario, así que el punto de equilibrio salía a la
  mitad. Ahora se usa solo el volumen que cierra cada operación.
- **Cierres «out by»:** no sacaban sus posiciones de la cola de aperturas, y un solo «out
  by» descolocaba el emparejado de todo lo que venía detrás (el stress de costes se
  apagaba). Ahora se consumen, aunque su precio no se usa para el valor del contrato.
- **Tipos en alemán:** «Verkauf» se leía como compra (contiene «kauf»).
- **Precios con artefactos de coma flotante** (`1.0876500000000001`): ya no fijan un tamaño
  de punto absurdo.
- **Periodo no visto:** la banda ensanchada del factor de beneficio no baja de 0, y la
  tabla dice que el rango está «ajustado a tu tramo».
- **Pruebas:** en navegador, dos mesetas (el menú «Exportar» baja M1 aunque se haya mirado
  M2; con el código anterior bajaba M2) y sin forward (ningún botón .set que dé error).
  En `tests/report.test.js`, los cuatro casos de emparejado de arriba.

## 2026-10-07 — Auditoría (3): detalles de presentación y del periodo no visto

- **Muestra de menos de 30 días:** ya no enseña «potencia 99 %» junto a «no se distingue
  de cero». Por debajo de 30 días no se calcula y se dice por qué (`sampleAudit.reason`).
- **Drawdown del Monte Carlo y del stress de costes:** el capital inicial cuenta como primer
  pico (`[-100, 50]` caía 0 en vez de 100).
- **Botones «Descargar .set» sin forward:** ya no aparecen donde solo podían dar error (ficha
  de meseta, alternativas, periodo no visto). Los de la ficha de meseta y el de
  refinamiento llevan la meseta explícita.
- **«Ver la meseta completa»** baja al relieve de esa misma meseta en vez de saltar a M1.
- **Cómo cargar el .set en MT5:** el paso 1 y el rango de refinamiento lo dicen (pestaña de
  parámetros de entrada, clic derecho → «Cargar»). El paso 1 cuenta los parámetros que
  lleva de verdad el .set (también los no optimizados si cargaste el .set de la optimización).
- **Textos:** la leyenda del gráfico dice «lavanda» (decía «verde»); la configuración se
  describe igual en la tarjeta y en el .set («elegida por buen puesto…», no «el centro»);
  las operaciones por parámetro dicen que son la mediana de las configuraciones;
  «Pasada original» en el .set en español; «minimums» en la leyenda en inglés; el resumen
  .txt ya no repite el nivel.
- **Pruebas:** la del bootstrap comparaba el total de cada camino con la media diaria y
  pasaba solo porque la serie tenía media ~0; ahora compara magnitudes equivalentes.

## 2026-10-07 — Auditoría (2): valores exactos, avisos al día y periodo no visto

- **Los parámetros se muestran exactos, como en el .set.** La tarjeta, el Top 3, la tabla
  de refinamiento y el resumen .txt redondeaban a 4 decimales y escribían con coma
  (0.00015 salía «0,0002»; «1,5» en el .txt). Ahora llevan punto decimal y todas sus cifras.
- **El título de la pestaña y el resumen .txt siguen al nivel mostrado.** El título se
  quedaba con el nivel del primer análisis y el .txt seguía diciendo «pruébala en un
  periodo no usado» después de haberlo probado.
- **Un informe al que le faltan parámetros optimizados ya no «coincide».** Antes bastaba
  con que hubiera uno y ninguno distinto; si no se leía ninguno, el sello salía en verde.
  Ahora sale «No valida» y se listan los que faltan.
- **«Evidencia insuficiente» da la misma cifra en el resumen y en el hallazgo** (las
  configuraciones que pasan en el periodo optimizado, que es donde se buscan las mesetas).
- **Contraste del periodo no visto más fiable con tramos cortos** (`core/unseen.js`). El
  drawdown se corregía por duración con la raíz de n, que vale para una estrategia sin
  ventaja; ahora con n^0,35 (y el factor de recuperación con n^0,65). Las bandas del factor
  de beneficio, del beneficio por operación y del Sharpe se ensanchan por
  √(n_referencia / n_tramo) cuando el tramo es más corto. `bench/unseen.js` mide ahora tres
  duraciones (×1, ×0,4 y ×0,2 las operaciones del forward). Con 100 semillas por escenario:
  falsas alarmas con la ventaja intacta 24/29/30 % (antes 27/37/40 %), avisos sin ventaja
  35/44/45 % (antes 35/48/45 %). La nota de alcance de la app cita estas cifras y la
  proporción del tramo del usuario frente al forward. Con este banco, la regla anterior
  daba 35 % de avisos sin ventaja con un tramo como el forward, no el 49 % que citaba.

## 2026-10-07 — Auditoría: exportar, costes y nivel «sólida»

- **El menú «Exportar» baja siempre la configuración propuesta (M1).** Antes usaba la
  última meseta abierta en la pestaña de mesetas: tras mirar una alternativa, «Configuración
  propuesta (.set)» bajaba el `.set` de M2.
- **El stress de costes ya no depende del instrumento ni del lote.** Restaba cantidades
  fijas de dinero (0,5 por lote, 0,2 por lado…): en EURUSD el escenario moderado equivalía a
  4 pips por operación con 0,01 lotes y a 0,09 con 1 lote, y en oro o índices no significaba
  nada. Ahora el coste extra se mide en puntos básicos del precio (moderado +1 pb ≈ 1 pip en
  EURUSD, severo +3 pb), y el valor en dinero de cada movimiento de precio se deduce de las
  operaciones del informe emparejando cada cierre con su apertura (`core/report.js`,
  `core/trades/costs.js#contractValues`). El punto de equilibrio se da en puntos del
  instrumento, en pb y por lote. Si no se puede deducir el valor del contrato, no se
  simulan escenarios y se dice por qué.
- **«Sólida» ya no dice «confirmada».** El medidor decía «validada y confirmada en un
  periodo no visto» mientras el siguiente paso decía que aprobarlo «no la confirma». Ahora
  es «validada en el forward y sin contradicción en un periodo no visto», también en
  Metodología.

## 2026-10-04 — Limpieza del repositorio

- Fuera lo que ya no usaba nada: unas 30 reglas y 20 variables de `styles.css` de pantallas
  antiguas del veredicto, 20 textos de `js/i18n.js` y una captura suelta en la raíz.
- Fuera `vercel.json` y `_headers`: la web solo se publica en GitHub Pages. La política de
  seguridad de referencia es la de `tools/serve.js`, y el test comprueba ahora el `<meta>`
  de **todas** las páginas, no solo de ocho.
- `npm test` ejecuta `tests/all.js`, que recorre todos los `tests/*.test.js` (una prueba
  nueva ya no hay que añadirla a mano a `package.json`). `run.js`, `stress.js` e
  `invariance.js` pasan a llamarse `engine.test.js`, `stress.test.js` e `invariance.test.js`.
- `core/matrix/` pasa a llamarse `core/trades/`: el nombre venía del CSCV retirado el
  2026-09-24 y hoy la carpeta solo analiza las operaciones del periodo no visto (sus
  pruebas: `tests/trades.test.js` y `tests/trades-from-deals.test.js`).
- Licencias OFL de las tres tipografías, con su aviso de copyright correcto (faltaba la de
  IBM Plex Mono).
- `README.md` y `DEPLOY.md` al día: cinco niveles de fiabilidad, páginas en español,
  cómo se usa, y cada tema en un solo sitio.

## 2026-10-01 → 2026-10-04 — Portada, app y fiabilidad

- **Fiabilidad en cinco niveles** (insuficiente, débil, moderada, buena, sólida), de rojo a
  lima. «Buena» es una meseta sin avisos validada en el forward a falta del periodo no
  visto; si ese periodo va en contra, baja a moderada.
- **Portada** editorial: titular nuevo, fotos de paisaje (portada, cierre, guías,
  metodología, 404), sección «Lo que te llevas», preguntas frecuentes reescritas y página
  «Quiénes somos». Paleta «Noche y señal»: azul medianoche, lavanda y el lima solo para lo
  importante; tipografía Source Sans 3 / Source Serif 4 / IBM Plex Mono servida desde el
  propio dominio.
- **App**: la misma cabecera que la portada (fija al bajar, con menú en el móvil), el
  veredicto se entiende en 10 segundos, lenguaje claro en todas las pestañas, un nombre por
  concepto, nada por debajo de 12 px, mapa de calor y relieve 3D legibles en los dos temas,
  y la auditoría de interfaz resuelta en cuatro bloques.
- **Robustez**: optimizaciones de hasta 160.000 filas, errores con código y pista,
  cancelar un análisis, `.xlsx` leído fuera del hilo principal y pruebas de navegador
  (Playwright) en CI.

## 2026-09-30 — Textos: adiós a «la primera fila»

- «La primera fila» no se entendía sin conocer MT5 y se quedaba corta: con miles de
  combinaciones falla el grupo de arriba, no solo una. Ahora se habla de «los mejores
  resultados», «lo primero de la lista» o «los primeros puestos», con «suelen» / «a menudo»
  donde antes se afirmaba sin matices. La tabla de la portada se marca como ejemplo.

## 2026-09-30 — Informe: lectura más rápida

- La tarjeta de arriba del veredicto lleva ya los valores recomendados (antes había que bajar
  dos pantallas); se quitan de «Configuración ganadora» para no repetirlos.
- «Qué demuestran estos datos» en lenguaje llano («5018 combinaciones parecidas», «probaste
  todas las combinaciones»); la robustez se muestra sobre 100.
- Sin puntos en contra (o a favor) ya no se reserva una columna vacía.

## 2026-09-30 — Portada: superficie 3D renovada

- Relieve sombreado con curvas de nivel reales, más grande y con etiquetas de ejes. Al pasar
  el ratón (o solo, en táctil) muestra el mismo resultado en un periodo nuevo: el pico de
  MT5 n.º 1 (4,71) cae y la meseta de Orometra (2,18) aguanta. Se gira arrastrando (o con
  ← →). Las cifras enlazan con la tabla de la portada (`tests/hero-surface.test.js`).

## 2026-09-29 — Banco de pruebas, auditorías 2 y 3, verificación con datos reales

- **Motor** (medido en `bench/`, criterios en `bench/PREREGISTRO.md`): los porcentajes que
  exigen los dos periodos se miden sobre las configuraciones con forward; la elección
  dentro de la meseta es por puesto conjunto in-sample + forward promediado con vecinas
  (empates con puesto medio); una meseta que aguanta menos del 65 % en el forward es
  crítico; sin meseta y con forward hay una sugerencia orientativa. Segundo examen ciego:
  9 de 11 criterios frente a 5 del motor anterior.
- **Periodo no visto:** el informe del backtest se lee en HTML, Open XML (.xlsx, también en
  UTF-16 como lo guarda MT5) y XML; una métrica mejor que todo lo visto se marca como tal;
  «normal» pasa a «no contradice» y se explica el alcance con cifras medidas
  (`bench/unseen.js`: avisa en 4 de cada 10 casos en que la ventaja había caído).
- **Carga:** avisos claros con archivos que no son de MT5, con un segundo in-sample y con
  más de 4 archivos; columnas clave sin reconocer (otro idioma) son un aviso crítico y no
  se bloquea por no reconocer parámetros en un solo archivo.
- **Impresión** siempre en paleta clara; etiquetas de calidad e identificadores de métricas
  en el idioma de la interfaz; `.set` en el idioma activo y sin formato regional; «Empezar
  de cero» restablece menú y título; textos de metodología corregidos (los mínimos se
  exigen por periodo; no existe un modo «Todos los parámetros» en MT5).

## 2026-09-26 — SR-1 resuelto: fuera el contraste de Sharpe basado en operaciones

`core/analysis.js`'s `sharpeTest` calculaba el error típico de cada Sharpe (Lo,
2002) usando el número de operaciones de cada Pass como tamaño de muestra —
pero SR-1 (ver `docs/MT5_ASSUMPTIONS.md`) ya establecía que MT5 calcula ese
Sharpe sobre los log-retornos de la curva de equity **por barra**, anualizados,
no por operación. El export de optimización no dice cuántas barras usó cada
Pass, así que ese error típico no tenía base real: podía salir demasiado
laxo o demasiado estricto según el timeframe de cada usuario, sin que fuera
un sesgo conocido en ninguna dirección.

- **Retirado**: el contraste tipo Lo (2002) por operaciones (`typicalSe`,
  `bestSe`, `chanceMax`/`chanceMaxEffective` basados en operaciones,
  `deflated`), y el finding "El Sharpe aprueba con nuestro criterio, no con
  el más estricto" que comparaba ambos umbrales.
- **Único criterio ahora**: la dispersión de los Sharpe observados *entre
  pasadas* (estilo Bailey y López de Prado, ya calculada antes como umbral
  "más estricto" secundario). No depende de operaciones ni de barras — es
  un hecho observable sobre la malla que de verdad se probó. Su sesgo
  conocido va siempre en la dirección seria: más estricto cuanta más señal
  real hay, nunca da falsa confianza.
- `sharpeTest` pierde los campos `observedTrades`, `typicalSe`, `bestSe`,
  `chanceMaxEffective`, `chanceMaxConservative`, `conservativeSigma`,
  `crossSectionalSd`, `deflated`; gana `sigma` (antes `conservativeSigma`/
  `crossSectionalSd`, ahora un único campo). `chanceMax` cambia de
  significado: antes era el umbral por operaciones con N total, ahora es el
  único umbral, calculado con pruebas efectivas.
- Actualizados: panel de Diagnósticos (`js/ui-plateaus.js`), herramienta de
  consola (`tools/audit.js`), `tests/run.js`, fixture de regresión
  (`tests/fixtures/demo-regression.json`), y los 2 títulos de finding en
  `tests/finding-categories.test.js` (114 → 112 tras retirar el finding del
  segundo umbral).

## 2026-09-24 — Recorte de alcance: fuera Desktop, sonda MQL5 y walk-forward

Decisión del usuario, no técnica: Orometra se queda como **una sola cosa, en el
navegador**. Se retira todo lo construido en la sesión anterior (entrada de más
arriba) que dependía de instalar algo fuera del navegador.

### Retirado
- **`desktop/`** entero: app Electron, ledger SQLite (`better-sqlite3`), runner que
  detectaba/lanzaba MT5 (`detect.js`, `launch.js`, `ini.js`, `queue.js`), IPC.
- **`mql5/`** entero: `OrometraProbe.mqh` y el EA de ejemplo instrumentado. Con ella se
  iba el único camino que existía hacia PBO/CSCV real y DSR publicado (necesitan la
  curva de equity de cada configuración de la rejilla, y el export de optimización de
  MT5 nunca la trae).
- `core/orf.js` (lector del `.orf`), `core/incubation.js`, `core/verdict-integrated.js`
  (solo los usaba el asistente de Desktop).
- `core/matrix/cscv.js` (PBO real), `core/matrix/wfo.js` (walk-forward multiventana),
  `core/matrix/dsr.js` (DSR publicado + nº efectivo de pruebas por clustering): los
  tres necesitaban la matriz T×N de retornos por configuración que solo daba la sonda.
- `core/matrix/risk.js`: se quedó solo con el aviso de dominancia del swap
  (`dataWarnings`). La auditoría de estructura de riesgo (martingala, grid, sin stop)
  necesitaba el lote y el SL de cada posición abierta — datos de la sonda, no del
  informe HTML de MT5 — y no se reintroduce con datos a medias.
- Dependencias `electron`, `@electron/rebuild`, `better-sqlite3`: el proyecto vuelve a
  tener **cero dependencias** en tiempo de ejecución y de compilación.

### Añadido — de las 6 cifras a las operaciones una a una
El informe HTML de backtest de una sola configuración ya traía la lista de operaciones
(`core/report.js#deals`) desde la Fase 0, pero solo se usaba para contar cuántas había.
`core/matrix/from-deals.js` las agrupa por día de cierre y con eso, en el periodo no
visto, sin ninguna instalación adicional:
- **Monte Carlo** (`bootstrap.js`, ya existía): 10.000 simulaciones por bootstrap
  estacionario (Politis & Romano 1994) sobre las operaciones reales del usuario. Los
  horizontes de pérdida a 3/6/12 meses solo se muestran si el tramo cubre esos
  63/126/252 días enteros; si no, se marca «—» en vez de repetir el mismo número bajo
  tres etiquetas distintas.
- **Tamaño de muestra / potencia** (`sample.js`, ya existía): ¿se distingue el
  resultado medio diario de cero con esta cantidad de días?
- **Stress de costes** (`costs.js`, ya existía): escenarios base/moderado/severo de
  spread, slippage y comisión extra, y el punto de equilibrio.
- **Aviso de swap** (`risk.js`): si el swap pesa más de un 15 % sobre el neto. Se
  separó `swap` de `commission` en `core/report.js#parseDeals` para poder calcularlo
  (antes iban sumados en un único `cost`).

Los tres primeros módulos (`bootstrap.js`, `sample.js`, `costs.js`) ya estaban escritos
para el pipeline de Desktop+sonda: trabajaban sobre series genéricas de retornos/PnL,
no sobre la matriz T×N, así que no hizo falta reescribirlos — solo un adaptador
(`from-deals.js`) y engancharlos en `js/ui-unseen.js`, en la pestaña «Periodo no
visto», justo debajo de la ficha del informe cargado.

### Nuevas pruebas
`tests/deals-matrix.test.js` (agrupación por día, casos no usables, swap dominante) y
`tests/matrix.test.js` recortado a lo que sobrevive.

### Documentación
`docs/SPEC.md` reescrito (la versión anterior era el plan de Desktop/Fases 1-7, ya no
aplica). `docs/MT5_ASSUMPTIONS.md` sin las filas `INI-*`/`FRAME-*`/`ORF-1`/`PROBE-1`.

---

## 2026-09-24 — Plan cerrado (malla Validar → incubación → CSP)

### Hecho
- **Validar malla:** el asistente acepta `.set`, Optimization 0/1/2, ForwardMode; estima coste; fuerza Opt=0 si no hay params Y.
- **Post-MT5:** `mt5:finishValidate` analiza ORF (PBO/DSR/effectiveTrials), importa XML (IS-only permitido con aviso), guarda summary en ledger; contador suma `effectiveTrials`.
- **Incubación UI:** vista Desktop con fijar bandas / comparar realizado; bandas también desde Validar (sessionStorage).
- **Desktop hardening:** CSP en sesión Electron + `sandbox: true`; i18n ES/EN básico del shell.
- IPC nuevos: `parseSetFile`, `setToInputs`, `finishValidate`, `incubationBands`, `compareIncubation`, `createEaVersion`.

### Pendiente (MT5 real / no inventado)
- Verificar en terminal real: compile MetaEditor, escritura `.orf` en Common\Files\Orometra, Forward XML de Optimization=1, INI-*.
- Malla genética con inputs enormes: el usuario debe confirmar coste; no hay auto-recorte de rejilla.
- Fase 7: no iniciada.

## 2026-09-24 — Validar cableado (Fases 3–5 parcial)

- IPC: `mt5:instrumentEa`, `compileMq5`, `readOrf`, `findOrf`, `analyzeOrf`, `prepareValidate`, `integratedVerdict`.
- `desktop/main/mt5/orf-matrix.js`: ORF → matriz T×N + PBO/DSR/WFO/costes + `integratedVerdict`.
- Asistente: Validar instrumenta/compila `.mq5`, encola backtest, busca `.orf`, muestra tarjetas; `.ex5` → import XML caja negra; botón «Analizar .orf…».
- Progreso MT5 se emite a todas las ventanas Electron.
- Pendiente: malla de optimización desde el wizard, auto-import forward, UI incubación.

## 2026-09-24 — CI + Pages Lite

- `.github/workflows/ci.yml`: `npm test` en push/PR a `main` (Node 22, sin Electron).
- `.github/workflows/static.yml`: deploy a Pages solo tras tests verdes; artifact = sitio Lite (sin desktop/tests/mql5).

## 2026-09-24 — Fases 2–6 (estado)

### Fase 2 — Runner MT5 — **hecho (código); aceptación MT5 real pendiente**
- `desktop/main/mt5/detect.js`: `origin.txt`, instalaciones, EAs, `parseOriginTxt` / `associateDataPaths`.
- `ini.js`, `launch.js`, `collect.js`, `cost.js`, `portable.js`, `queue.js` + IPC `mt5-ipc.js`.
- UI shell `data-view="mt5"`: listar instalaciones, estimar coste, encolar/cancelar, aviso terminal en ejecución, texto portable.
- Pruebas: `tests/mt5-ini.test.js`, `tests/mt5-detect.test.js`.
- **Pendiente:** criterio de aceptación con MT5 real (lanzar optimización de ejemplo de extremo a extremo).

### Fase 3 — Sonda / curvas por pasada — **hecho (código); verificación MT5 pendiente**
- `mql5/OrometraProbe.mqh`, Demo EA, `instrument.js` (`transformSource` / `instrumentMq5Source`), `compile.js`, `core/orf.js`.
- Pruebas: `tests/orf.test.js`, `tests/instrument.test.js`.
- **Pendiente:** FRAME-*/ORF-1/PROBE-1 en MT5; backtest instrumentado vs original; finalistas 3.4; caja negra `.ex5` en UI.

### Fase 4 — Matriz de retornos — **hecho (motor + tests)**
- `core/matrix/` (WFO, CSCV/PBO, DSR, costes, bootstrap, sample, risk).
- Prueba `tests/matrix.test.js`.
- **Pendiente:** cableado completo en el asistente / UI de resultado; contador `effectiveTrials` en ledger aún n/d hasta integrar.

### Fase 5 — Flujo guiado, pre-registro, veredicto — **parcial**
- Asistente `wizard.html` / `wizard.js`; `core/verdict-integrated.js`; perfiles Prudente/Estándar/Exploratorio.
- Ledger: `createPreregistration` + IPC `savePreregistration`.
- Prueba `tests/verdict-incubation.test.js` (veredicto).
- **Pendiente:** orquestación «Validar» extremo a extremo (instrumentar → MT5 → matriz → veredicto); pantalla de resultado con tarjetas; Research Record.

### Fase 6 — Incubación — **parcial (núcleo)**
- `core/incubation.js`: bandas esperadas + comparación con historial.
- Cubierto en `tests/verdict-incubation.test.js`.
- **Pendiente:** UI de seguimiento, import historial cuenta, calibración de costes reales, reglas de parada en shell.

### Fase 7 — Futuro
- **No implementada** (requiere aprobación explícita según SPEC).

---

## 2026-09-24 — Fase 3 (sonda / curvas por pasada)

### Hecho
- `mql5/OrometraProbe.mqh`: hooks `OrometraOnInit/OnTick/OnTester/OnTesterInit/OnTesterPass/OnTesterDeinit`; agregación diaria de deals; resumen de riesgo; `FrameAdd("orometra")`; escritura `.orf` + `.json` en `FILE_COMMON/Files/Orometra/<OrometraExperimentId>`.
- `mql5/examples/OrometraDemoEA.mq5`: cruce de medias + hooks (apto para demo de optimización).
- `desktop/main/mt5/instrument.js`: copia `*_orometra.mq5`, inserta include + handlers (puro `transformSource` / `instrumentMq5Source`); instala el `.mqh` en `MQL5/Include`.
- `desktop/main/mt5/compile.js`: localiza `metaeditor64.exe`, `/compile` + `/log`, mensajes de error en lenguaje claro.
- `core/orf.js` (+ `desktop/main/mt5/orf-read.js`): formato **ORF1** float32, roundtrip, `verifyDailyPnLSums`, `estimateOrfBytes`.
- Pruebas: `tests/orf.test.js`, `tests/instrument.test.js`.
- `docs/MT5_ASSUMPTIONS.md`: FRAME-1/2/3, ORF-1, PROBE-1 (pendientes de verificación en MT5 real).

### Cómo probar (con MT5)
1. `npm test` (incluye orf + instrument).
2. Instrumentar el Demo EA o copiar a mano el `.mqh` a Include; compilar.
3. Optimización exhaustiva local con `OrometraExperimentId` distinto de vacío.
4. Abrir `Common/Files/Orometra/<id>.orf` y contrastar sumas vs XML.

### Pendiente / no cerrado en Fase 3
- Verificación real FRAME-* / ORF-1 / PROBE-1 en MT5 (sin inventar límites).
- Backtest de verificación instrumentado vs original (mismo profit / nº trades) — orquestación completa en runner Fase 2.
- Lista de operaciones de finalistas (3.4) y modo caja negra `.ex5` en UI.

---

## 2026-09-24 — Fase 2 (Runner MT5)

### Hecho
- Detección de instalaciones (`detect.js`) y generación `.ini` (`ini.js`) + estimador de coste + cola + IPC.
- Vista Desktop **MT5 / Runner** (`data-view="mt5"`): instalaciones, EA, símbolo/fechas, estimar, encolar, cola/cancelar, aviso si el terminal está abierto, info `/portable`.
- Pruebas unitarias ini/detect sin MT5.

### Pendiente
- Aceptación E2E con terminal real; progreso fino de pasadas; reintento automático documentado en UI.

---

## 2026-09-24 — Fase 1 (Desktop + ledger)

### Hecho
- App Electron en `desktop/` (`npm run desktop`): shell de estrategias + ventana de análisis (misma UI Lite).
- Ledger SQLite (`better-sqlite3`) con tablas: strategy, ea_version, dataset, experiment, preregistration, result.
- Búsqueda previa obligatoria al crear estrategia (`prior_search_note` / `prior_search_approx`).
- Contador honesto por estrategia: experimentos, versiones EA, pasadas totales; pruebas efectivas = n/d hasta integrar Fase 4.
- Importar XML/XLS IS+Forward → analiza con `core/` (mismo motor) y guarda experimento + resumen.
- Exportar / importar ledger completo (JSON).
- Host del ledger en proceso Node aparte (evita ABI Electron vs prebuild Node).
- `createPreregistration` + IPC `savePreregistration` (pre-registro Fase 5).
- Prueba `tests/ledger.test.js`.

### Cómo probar
1. `npm run desktop`
2. Nueva estrategia (pon «0» o «no lo sé» en búsqueda previa).
3. Importar XML: elige estrategia + IS + Forward de la misma optimización.
4. Mira el historial y el contador; cierra y vuelve a abrir: debe persistir.
5. Exportar ledger → Importar ledger (copia de seguridad).
6. «Abrir análisis» debe comportarse como Lite (`?demo=1` sigue válido en esa ventana).
7. Vista MT5 / Runner: detectar instalaciones y estimar coste (sin lanzar si no hay MT5).

### Pendiente Fase 1 / siguiente
- Contador embebido junto a métricas en el informe Lite (parcial: visible en shell Desktop).

---

## 2026-09-24 — Fase 0 (saneamiento)

### Hecho
- Motor de cálculo movido a `core/` (`engine`, `analysis`, `stats`, `metrics`, `schema`, `parse`, `verdict`, `setfile`, `unseen`, `report`, `errors`).
- `core/rng.js` unificado (mulberry32); `demo.js` y `stats.js` lo reutilizan.
- `js/ui.js` partido en módulos ≤~600 líneas (`ui-state`, `ui-files`, `ui-audit`, `ui-chrome`, `ui-verdict`, `ui-plateaus`, `ui-unseen`, `ui-export`).
- README unificado: «fragilidad de la selección» y «contraste de selección sobre el Sharpe (adaptación)»; sección Temas al final.
- Detección de forward sospechosamente incompleto (`integrity.forwardSelectionSuspect`) + aviso en veredicto (FWD-1 mitigado, no verificado).
- Prueba de regresión `tests/regression.test.js` + fixture `tests/fixtures/demo-regression.json`.
- `docs/SPEC.md`, `docs/MT5_ASSUMPTIONS.md` (este changelog).

### Pendiente / no cerrado en Fase 0
- **SR-1** (cómo calcula MT5 el Sharpe del export): sigue pendiente de verificación manual en MT5.
- **FWD-1**: mitigado con aviso; falta confirmar con exports reales el comportamiento exacto de MT5.
- Reorganizar la app web bajo carpeta `web/` (arquitectura objetivo): aplazado.
- Verificación manual FWD-1 / SR-1 en MT5 (sigue pendiente).

### Trabajo Lite previo (aún puede estar sin commit limpio)
- Cobertura vs `.set`, copy DoF/Sharpe, UX evidencia débil, IS+Forward obligatorio, i18n del veredicto, etc.

---

## Cómo usar este archivo
Al cerrar cada fase: fecha, qué se hizo, qué falta, y supuestos MT5 pendientes.
