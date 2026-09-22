# Orometra

**Encuentra las zonas estables de tu EA de MetaTrader 5, no los picos.**

El nombre viene de la *orometría*, la rama de la geografía que mide el relieve. Sus dos
magnitudes centrales son la **prominencia** —cuánto se eleva una cima sobre el collado más
bajo que la conecta con terreno más alto— y el **aislamiento**. Es exactamente lo que hace
el motor sobre la superficie de parámetros: decidir si una cima está sola o forma parte de
terreno alto y ancho.

## Temas

Tres: oscuro, claro y crema. Todo el color pasa por una escala semántica de 28 tokens
definida en el bloque `:root` de `styles.css`; **no se escribe ningún color literal fuera
de ahí**. Antes había 168 sueltos por la hoja, lo que hacía imposible cualquier tema
alternativo. Los nombres describen el papel y no el color (`--ok-text` es «texto verde
legible sobre su fondo»), para que al invertir el tema sigan significando lo mismo.

El tema elegido se guarda en `localStorage` y se aplica en un script del `<head>` antes de
pintar, porque si no se ve un fogonazo del tema contrario al recargar.


Auditoría anti-sobreajuste para optimizaciones de MetaTrader 5. Aplicación web estática:
todo el análisis se ejecuta en el navegador y ningún archivo sale del equipo.

Su función no es ordenar tu tabla de resultados de otra manera. Es **hacer de árbitro entre
el optimizador de MT5 y tu decisión de poner dinero real**, y su respuesta más valiosa es
«no, y aquí están los números».

## Principios de diseño

1. **Los parámetros no se reconocen por su nombre, sino por su estructura.** Para un mismo
   `Pass`, un parámetro vale lo mismo en el archivo in-sample y en el forward; una métrica no,
   porque se midió sobre otro periodo. Así funciona con cualquier EA y en cualquier idioma del
   terminal.
2. **Nunca se juzga con la vara con la que se optimizó.** La columna `Result` es el criterio
   que eligió el usuario (Balance, Recovery, Complex Criterion…): significa algo distinto en
   cada optimización y está contaminada por la selección. La calidad se reconstruye con las
   columnas objetivas que MT5 exporta siempre: factor de beneficio, recuperación, Sharpe,
   drawdown y número de operaciones.
3. **Umbrales absolutos, no percentiles.** Un percentil siempre encuentra un «mejor 5 %»,
   incluso donde todo pierde dinero. Con mínimos absolutos la aplicación puede decir que no
   hay nada.
4. **La calidad combinada es el mínimo de los dos periodos, no la media.** Una configuración
   vale lo que vale su peor periodo.
5. **Se elige el centro de la meseta, no su cima**, por criterio maximin: la configuración
   cuyo *peor* vecino es el mejor posible.
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
  (el resultado del backtest del archivo forward debe reproducir el del in-sample).
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
- **PBO**: probabilidad de sobreajuste en la selección, por remuestreo de configuraciones.
- **Contraste de Sharpe deflactado**: el mejor Sharpe que cabría esperar sin ninguna ventaja
  real tras N pruebas, usando el error típico de Lo (2002).
- **Calificación de la FUERZA DE LA EVIDENCIA**, no de la estrategia: sólida / moderada /
  débil / insuficiente. La aplicación no emite GO ni NO-GO, y es deliberado: mide lo que
  contienen unos datos, no si un EA va a funcionar. Decir «no recomendado» era opinar sobre
  algo que nunca se midió —y reventó con un EA real, donde se emitió NO-GO mientras 2.925 de
  2.925 configuraciones eran rentables fuera de muestra—. Distingue «no hay región conexa»
  de «no hay datos suficientes para saberlo», que son hechos, y deja la decisión al usuario.
- **Lectura del informe de backtest de MT5** (`Informe → HTML`): se suelta en la app y
  rellena solo la validación del periodo no visto. Trae tres cosas que el export de
  optimización no tiene: las **fechas reales** del periodo, **todos los parámetros de
  entrada** —con los que comprueba que el backtest se lanzó con la configuración
  propuesta y avisa si no— y la **lista de operaciones una a una**. El resultado neto de
  cada operación arrastra la comisión de su apertura, de modo que la suma reproduce
  exactamente el beneficio declarado por MT5.
- **Validación en periodo no visto**: se introducen los resultados del backtest de la
  configuración elegida sobre un tramo que no se haya usado ni para optimizar ni para
  validar, y se comprueba si son *normales para ese EA* comparándolos con el recorrido
  que la meseta entera demostró. El drawdown máximo y el factor de recuperación se
  corrigen por duración, porque dependen del número de operaciones: un tramo con la
  cuarta parte de operaciones debería mostrar la mitad de drawdown, y compararlos en
  crudo lleva a la conclusión contraria.
- Exportación: `.set` de la configuración propuesta, `.set` de **rango de refinamiento**
  acotado a un número de combinaciones ejecutable, informe JSON y CSV completo. Los
  parámetros también se copian al portapapeles con un clic.
- **Vista previa de los mínimos**: al mover los umbrales se ve al instante cuántas
  configuraciones sobrevivirían, sin rehacer el análisis. Las puertas son una función
  pura de las métricas ya cargadas; lo caro es la topología, y esa solo se recalcula si
  se pide. Responde de un vistazo a «¿esto aguanta si aprieto un poco más?».
- **Aviso de empate**: cuando las primeras mesetas puntúan casi igual, se dice
  explícitamente en lugar de sugerir una jerarquía que los datos no sostienen.

## Ejecutar en local

Necesita un servidor HTTP: usa módulos ES y un Web Worker, que el navegador bloquea sobre
`file://`. El proyecto trae uno sin dependencias:

```bash
node tools/serve.js
```

Después abre `http://localhost:3000`. Acepta otro puerto como argumento: `node tools/serve.js 8080`.

## Pruebas

```bash
npm test
```

Son cuatro bancos con propósitos distintos:

- **`tests/source.test.js`** revisa el propio código: que ninguna tilde haya caído dentro
  de un identificador, que toda clase CSS usada esté definida, que no queden ids
  huérfanos ni restos de depuración. Existe porque al restituir las tildes del texto
  visible tres de ellas acabaron dentro de nombres de propiedad (`indices:` pasó a ser
  `índices:`) y rompieron la aplicación en silencio.

- **`tests/run.js`** valida que el motor acierta cuando se conoce la respuesta: mesetas
  plantadas en un centro conocido, EAs perdedores, ruido, parametros inertes, booleanos
  y enumeraciones, mas los archivos reales de MT5 si estan disponibles.
- **`tests/stress.js`** valida que el modelo se comporta bien en *cualquier* caso, que es
  lo que de verdad importa cuando lo usa gente distinta: de 1 a 20 parametros, de 16 a
  100.000 configuraciones, con y sin forward, con columnas de metricas ausentes,
  superficies planas, EAs sin operaciones suficientes y rangos degenerados. Cada escenario
  comprueba primero los invariantes que deben cumplirse siempre (veredicto valido, mesetas
  coherentes y ordenadas, refinamiento ejecutable, ningun texto con NaN) y despues lo suyo.
- **`tests/report.test.js`** valida el lector de informes: fechas, parámetros uno por
  fila, entidades HTML, y que la suma de los resultados netos cuadre al céntimo con el
  beneficio declarado.
- **`tests/unseen.test.js`** valida la corrección por duración del periodo no visto, con
  la demostración clave: un mismo drawdown del 12,99 % es normal con 1.274 operaciones y
  anómalo con 318.

## Accesibilidad y soporte

- Funciona con teclado: las zonas de carga son enfocables y se activan con Enter o
  espacio. Los archivos se sueltan en cualquier punto de la página.
- En móvil la barra lateral se convierte en una tira horizontal de pestañas: las siete
  secciones siguen siendo alcanzables.
- Hoja de estilos de impresión propia: el informe sale legible en papel, con salto de
  página por sección.
- Los mínimos exigidos se recuerdan entre sesiones, y cada sección tiene su propio
  enlace (`#mesetas`, `#descartes`…).

Cubre las primitivas estadísticas, la conversión numérica regional, una rejilla con una meseta
plantada en un centro conocido, un EA perdedor, ruido puro, parámetros constantes e inertes, el
ejemplo sintético de la aplicación y, si están presentes, archivos reales de MT5.

Para incluir archivos reales, colócalos como `IS(1).xls` y `OOS(1).xls` en tu carpeta de
descargas, o indica la ruta:

```bash
MT5_SAMPLES=/ruta/a/tus/exportaciones node tests/run.js
```

## Límites conocidos

- No sustituye a una prueba en un periodo que no se haya usado ni para optimizar ni para
  validar. En cuanto eliges mirando el forward, ese forward deja de ser ciego.
- Trabaja con las métricas agregadas del probador, no con la curva de capital ni con las
  operaciones una a una. Por eso el PBO es una aproximación por remuestreo de configuraciones
  y no el CSCV original sobre series temporales.
- No conoce las fechas de los periodos: la duración relativa del forward se estima con el
  número de operaciones.
- El contraste del Sharpe asume que MT5 estima esa cifra sobre las operaciones registradas.
  Suspenderlo es una señal fuerte; aprobarlo no demuestra nada por sí solo.
- Aún no cubre walk-forward con varias ventanas.
- Sin la lista de operaciones no es posible un Monte Carlo serio, y el export de optimización no la trae.
