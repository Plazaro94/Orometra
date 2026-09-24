# Orometra — Especificación completa y plan de desarrollo

> **Instrucciones para Cursor (léelas antes de nada)**
>
> 1. Guarda este documento en el repositorio como `docs/SPEC.md` y trátalo como la fuente de verdad del proyecto.
> 2. **No implementes todo de golpe.** Trabaja fase por fase, en el orden indicado. Al empezar cada fase, escribe primero un plan breve (archivos que vas a crear o tocar, riesgos, pruebas) y espera mi confirmación.
> 3. Al terminar cada fase: todas las pruebas (`npm test`) deben pasar, la versión web actual debe seguir funcionando igual y debes actualizar `docs/CHANGELOG.md` con lo hecho y lo pendiente.
> 4. Yo no soy desarrollador. Explícame en lenguaje sencillo qué has hecho, qué tengo que probar yo y cómo (pasos concretos en MT5 si hace falta).
> 5. Si no estás seguro de cómo se comporta MetaTrader 5 en algo concreto (formato de un archivo, una función MQL5, una opción del `.ini`), **no lo inventes**: dilo, propón cómo verificarlo y escribe una prueba o un script de comprobación. Cada suposición no verificada sobre MT5 debe quedar anotada en `docs/MT5_ASSUMPTIONS.md` con su estado (verificada / pendiente).
> 6. Respeta los principios de la sección 2. Si una petición mía los contradice, avísame antes de hacerla.

---

## 1. Qué es Orometra y a dónde va

Orometra ya existe como aplicación web estática (vanilla JS, módulos ES, Web Worker, sin servidor) que analiza el export XML de una optimización de MT5 y busca **mesetas** de parámetros robustas en lugar de picos aislados. Tiene un motor serio (`js/engine.js`, `js/analysis.js`, `js/stats.js`), pruebas sólidas y una metodología honesta. Todo eso se conserva.

**Objetivo final:** que un trader retail sin conocimientos técnicos pueda responder, con el mínimo esfuerzo y con rigor cuantitativo real, a esta pregunta:

> «¿Mi EA, tal como está optimizado, tiene evidencia suficiente para pasar a incubación (demo o real con lote mínimo), o no?»

La app debe hacer por el usuario todo el trabajo pesado: lanzar MT5, recoger resultados, aplicar las pruebas y explicar el veredicto en lenguaje claro. El usuario solo elige el EA, el símbolo, el periodo y los parámetros a optimizar.

**Diferenciación frente a StrategyQuant X, QuantAnalyzer, etc.:** no competimos en número de funciones, sino en **simplicidad y honestidad**: flujo guiado, valores por defecto sensatos, un único veredicto explicado, y un registro que impide engañarse a uno mismo.

### Dos productos, un solo motor

- **Orometra Lite (web, la actual):** gratuita, en el navegador, analiza exports XML de MT5. Sigue funcionando exactamente igual. Es la puerta de entrada.
- **Orometra Desktop (nueva):** aplicación de escritorio para Windows que controla MT5, instrumenta el EA, obtiene curvas de resultados por pasada y ejecuta la validación completa.

Ambas comparten el mismo motor (`core/`), que es JavaScript puro sin dependencias del DOM ni de Node.

---

## 2. Principios no negociables

Estos principios ya están en el README actual y se mantienen, ampliados:

1. **MT5 calcula, Orometra decide.** Nunca construimos un backtester, un optimizador ni un motor de ejecución propios. MT5 simula; nosotros orquestamos, analizamos y auditamos.
2. **No se juzga con la vara con la que se optimizó.** La columna `Result` de MT5 no se usa como medida de calidad.
3. **Umbrales absolutos, no percentiles.** La app debe poder decir «aquí no hay nada».
4. **Una configuración vale lo que su peor periodo** (maximin), no la media.
5. **Se elige el centro de la meseta, no su cima.**
6. **Lo que no se puede calcular no se calcula, y se dice por qué.** Ninguna métrica se presenta con el nombre de un método publicado (PBO, DSR, CSCV…) si no se ha calculado como en el método publicado. Las adaptaciones se nombran como adaptaciones.
7. **Evidencia, no permiso.** La app nunca dice «opera». Los veredictos son sobre la fuerza de la evidencia.
8. **«No hay datos suficientes» es un resultado válido** y distinto de «no funciona».
9. **Reproducibilidad total.** Todo experimento queda registrado con lo necesario para repetirlo.
10. **Determinismo.** Todo proceso aleatorio del motor (bootstrap, Monte Carlo, remuestreos) usa una semilla registrada. Mismas entradas + misma semilla = mismo resultado, siempre.
11. **La herramienta se audita a sí misma** (ya existe: perturbación de umbrales ±20 %). Se extiende a los nuevos módulos.
12. **Seguridad del usuario.** La app jamás envía órdenes, jamás toca una cuenta real y jamás modifica el EA original: trabaja siempre sobre una copia.

---

## 3. Arquitectura objetivo

```
orometra/
├── core/                 # Motor puro (JS, sin DOM, sin Node). Se mueve aquí lo de js/ que es cálculo.
│   ├── engine.js         # (existente) topología, vecindades, mesetas
│   ├── analysis.js       # (existente) análisis de optimización agregada
│   ├── stats.js          # (existente) primitivas estadísticas
│   ├── matrix/           # NUEVO: análisis sobre matriz de retornos T×N
│   │   ├── wfo.js
│   │   ├── cscv.js       # PBO real (Bailey et al.)
│   │   ├── dsr.js        # Deflated Sharpe real + nº efectivo de pruebas
│   │   ├── costs.js      # stress de costes analítico
│   │   ├── bootstrap.js  # bootstrap por bloques / Monte Carlo
│   │   ├── sample.js     # tamaño de muestra, intervalos, potencia
│   │   └── risk.js       # auditoría de estructura de riesgo
│   ├── verdict.js        # veredicto integrado
│   └── rng.js            # generador aleatorio con semilla
├── web/                  # Orometra Lite (la app actual: index.html, app/, methodology/…)
├── desktop/              # NUEVO: Electron
│   ├── main/             # proceso principal (Node): runner MT5, base de datos, ficheros
│   │   ├── mt5/
│   │   │   ├── detect.js     # localizar instalaciones de MT5
│   │   │   ├── ini.js        # generar .ini de pruebas
│   │   │   ├── launch.js     # lanzar terminal64.exe y vigilar el proceso
│   │   │   ├── compile.js    # compilar con metaeditor64.exe
│   │   │   ├── instrument.js # insertar la sonda en una copia del EA
│   │   │   └── collect.js    # leer informes y frames
│   │   ├── ledger/           # SQLite (better-sqlite3)
│   │   └── ipc.js
│   └── renderer/         # UI (reutiliza componentes de web/ donde se pueda)
├── mql5/
│   ├── OrometraProbe.mqh # NUEVO: sonda que se incluye en el EA
│   └── examples/OrometraDemoEA.mq5
├── tests/                # pruebas existentes + nuevas
└── docs/
    ├── SPEC.md
    ├── CHANGELOG.md
    └── MT5_ASSUMPTIONS.md
```

### Decisiones tecnológicas (justificadas)

- **Electron** para escritorio, no Tauri ni Python: permite reutilizar el motor y la UI existentes en JavaScript sin reescribir nada, y Node da acceso a procesos y ficheros de Windows.
- **better-sqlite3** para el registro de investigación (ledger): un único fichero local, sin servidor, transaccional.
- **electron-builder** para generar el instalador de Windows.
- **Sin frameworks de UI nuevos** salvo que yo lo apruebe. La web actual es vanilla JS y funciona; mantener coherencia.
- Solo Windows en esta versión (MT5 es nativo de Windows). macOS/Linux fuera de alcance; documentarlo.
- Ningún dato sale del ordenador del usuario. Sin cuentas, sin telemetría, igual que la versión web.

---

## 4. Fases de desarrollo

Cada fase tiene objetivo, tareas y **criterios de aceptación**. No pases a la siguiente sin cumplirlos.

---

### FASE 0 — Saneamiento y preparación (sin funciones nuevas)

**Objetivo:** dejar la base lista para crecer sin romper nada.

**Tareas:**

1. Mover el código de cálculo puro de `js/` a `core/` (engine, analysis, stats, metrics, schema, parse, verdict, setfile, unseen, report-parser). Lo que toque el DOM se queda en `web/`. Actualizar imports y el worker.
2. Dividir `js/ui.js` (≈2.800 líneas) en módulos por sección (carga de archivos, mesetas, descartes, validación no vista, exportación, ajustes…). Ningún archivo de UI debe superar ~600 líneas.
3. Corregir inconsistencias del README: en «Qué calcula» aún aparece «**PBO**» y «Contraste de Sharpe deflactado» como si fueran los métodos publicados, mientras que en otros apartados (y en el código: `selectionFragility`) se aclara que no lo son. Unificar nombres: «fragilidad de la selección» y «contraste de selección sobre el Sharpe (adaptación)». Reordenar el README: la sección de temas va al final.
4. **Verificar el comportamiento del forward de MT5.** Documentar en `docs/MT5_ASSUMPTIONS.md` si el export forward de una optimización contiene **todas** las pasadas o solo un subconjunto de las mejores del in-sample. Si es un subconjunto, el emparejamiento IS/OOS y las vecindades en forward están sesgados por selección: el motor debe detectarlo (comparando nº de filas IS vs forward), avisar al usuario y ajustar la interpretación (las mesetas en forward solo se evalúan entre pasadas preseleccionadas).
5. Verificar cómo calcula MT5 el «Sharpe Ratio» que aparece en el export de optimización (por operación, por periodo de equity, anualizado o no). El contraste actual asume que es por operación; documentar la verificación y corregir el error típico si la suposición es falsa.
6. Añadir `core/rng.js` (PRNG con semilla, p. ej. mulberry32 o xoshiro128**) y usarlo en todo lo aleatorio del motor existente.

**Criterios de aceptación:** `npm test` pasa; la web desplegada en GitHub Pages funciona igual que antes (probar la demo `?demo=1` y un XML real); los resultados del motor son idénticos antes y después del refactor (añadir una prueba de regresión que compare el JSON de la demo antes/después).

---

### FASE 1 — Aplicación de escritorio y registro de investigación (Ledger)

**Objetivo:** tener Orometra Desktop funcionando con el análisis actual y con un registro persistente de todo lo que el usuario prueba.

**Tareas:**

1. Crear el proyecto Electron en `desktop/`. La primera versión muestra la misma UI de análisis de XML que la web, pero leyendo archivos del disco.
2. Implementar el **modelo de datos** del ledger en SQLite:

   - `strategy`: id, nombre, hipótesis en texto libre (qué ineficiencia cree explotar el usuario y en qué mercados debería funcionar), fecha de creación.
   - `ea_version`: id, strategy_id, ruta del .mq5/.ex5, hash SHA-256 del fuente (si existe) y del binario, fecha, nota de cambios, `parent_version_id`.
   - `dataset`: id, broker, servidor, símbolo, timeframe, desde, hasta, modelo de ticks, huella de los datos (ver fase 3), build de MT5.
   - `experiment`: id, ea_version_id, dataset_id, tipo (optimización / backtest único / WFO / stress / incubación), configuración completa en JSON (rangos de parámetros, método de optimización, criterio, depósito, apalancamiento, retardo de ejecución), nº de pasadas, semilla, estado, fechas, `preregistration_id`.
   - `preregistration`: umbrales y reglas de decisión congelados **antes** de ver resultados (ver fase 5), con hash.
   - `result`: id, experiment_id, rutas a los ficheros de resultados, resumen JSON.
   - `declared_prior_search`: texto y número aproximado de pruebas que el usuario declara haber hecho **fuera** de Orometra antes de empezar (campo obligatorio al crear una estrategia; puede ser «0» o «no lo sé»).

3. **Contador de búsqueda honesto:** por estrategia, mostrar siempre cuántos experimentos, cuántas versiones del EA, cuántas pasadas en total y cuántas pruebas efectivas (fase 4) se han hecho. Este número aparece junto a cualquier métrica de rendimiento en todos los informes.
4. Importar un XML de optimización ya existente crea automáticamente un experimento en el ledger (preguntando al usuario a qué estrategia pertenece).
5. Exportar/importar el ledger completo (para copias de seguridad).

**Criterios de aceptación:** puedo crear una estrategia, importar dos optimizaciones y ver el historial con el contador total; al cerrar y abrir la app todo sigue ahí; el análisis de mesetas da exactamente lo mismo que la web.

---

### FASE 2 — Control de MT5 (Runner)

**Objetivo:** que el usuario no tenga que abrir el Strategy Tester nunca más. Orometra lanza las optimizaciones y backtests por él.

**Tareas:**

1. **Detección de MT5** (`detect.js`): localizar instalaciones de `terminal64.exe` (Program Files y rutas personalizadas) y sus carpetas de datos (`%APPDATA%\MetaQuotes\Terminal\<id>\`, usando `origin.txt` para asociar cada carpeta de datos con su instalación). Listar EAs disponibles en `MQL5\Experts`. Permitir elegir la ruta a mano si no se detecta.
2. **Terminal dedicado recomendado:** ofrecer al usuario crear una copia portátil de MT5 exclusiva para Orometra (arrancada con `/portable`), para no interferir con el terminal donde opera. Explicarlo en lenguaje sencillo. Si el terminal elegido está abierto, avisar y pedir que se cierre (o usar el dedicado).
3. **Generación de `.ini`** (`ini.js`): sección `[Tester]` con `Expert`, `Symbol`, `Period`, `Model`, `Optimization`, `OptimizationCriterion`, `FromDate`, `ToDate`, `ForwardMode`/`ForwardDate`, `Deposit`, `Currency`, `Leverage`, `ExecutionMode` (retardo), `Report`, `ReplaceReport=1`, `ShutdownTerminal=1`; y sección `[TesterInputs]` con el formato `nombre=valor||inicio||paso||fin||Y/N`. **Verificar cada clave contra la documentación oficial de MT5** y registrar en `MT5_ASSUMPTIONS.md`.
4. **Lanzamiento** (`launch.js`): ejecutar `terminal64.exe /config:"ruta.ini"` (y `/portable` si procede), vigilar el proceso, detectar fin por salida del proceso y aparición del informe, timeout configurable, detección de cuelgues, reintento una vez, cancelación desde la UI. Mostrar progreso aproximado (tiempo transcurrido, y si se puede, pasadas completadas leyendo los frames o logs del tester).
5. **Recogida** (`collect.js`): leer el informe XML de optimización con el parser existente de `core/`, y el informe HTML de backtest único (también existente). Guardar todo en el ledger.
6. **Estimador de coste antes de lanzar:** nº de combinaciones del espacio, tiempo estimado (a partir de un backtest único de prueba) y, en la fase 3, tamaño estimado de los datos. Si la búsqueda exhaustiva supera un límite razonable, sugerir reducir rangos o parámetros (explicando que menos parámetros también es más robustez), antes de recurrir al algoritmo genético.
7. Cola de trabajos: el usuario puede encadenar varias tareas y dejarlas corriendo.

**Criterios de aceptación:** desde Orometra, sin tocar MT5, lanzo una optimización de un EA de ejemplo, termina sola, el resultado se importa y se analiza automáticamente. Si cierro MT5 a mitad, la app lo detecta y lo informa claramente.

---

### FASE 3 — La sonda: curvas de resultados por pasada

**Objetivo:** superar el límite actual (el export XML solo trae métricas agregadas) para obtener la **serie temporal de resultados de cada pasada**. Esto desbloquea WFO, PBO real, DSR real, Monte Carlo y stress de costes.

#### 3.1 `mql5/OrometraProbe.mqh`

Include que se añade al EA. Funciones públicas:

- `OrometraOnInit()`, `OrometraOnTick()` (opcional, para muestrear equity), `OrometraOnTester()`, `OrometraOnTesterInit()`, `OrometraOnTesterPass()`, `OrometraOnTesterDeinit()`.

Comportamiento:

- **En cada pasada (en el agente), dentro de `OnTester()`:** `HistorySelect(0, TimeCurrent())`, recorrer los deals y agregar **por día natural** (hora del servidor): P&L neto (`DEAL_PROFIT + DEAL_COMMISSION + DEAL_SWAP + DEAL_FEE`), volumen negociado en lotes, número de operaciones cerradas, comisión y swap por separado. Guardar solo los días con actividad (formato disperso): `[índice_de_día, pnl, volumen, n_trades, swap, comisión]`.
- Registrar además un resumen de estructura de riesgo por pasada: máximo de posiciones abiertas simultáneas, lote mínimo y máximo usados, si el lote varía (posible interés compuesto o martingala), nº de operaciones sin stop loss (mirando `ORDER_SL` en las órdenes de historial), duración media de las operaciones, operaciones que cruzan el fin de semana.
- Codificar todo en un `double[]` con cabecera versionada (`[versión_formato, fecha_inicio, n_días_activos, …]`) y enviarlo con `FrameAdd("orometra", 0, criterio, datos)`. **La sonda nunca modifica decisiones de trading del EA** y el valor que devuelve `OnTester()` sigue siendo el criterio original del usuario.
- **En el terminal, en `OnTesterDeinit()`:** recorrer todos los frames con `FrameFirst()`/`FrameNext()`, obtener los parámetros de cada pasada con `FrameInputs()` y escribir un fichero binario compacto en la carpeta común (`FILE_COMMON`, es decir `%APPDATA%\MetaQuotes\Terminal\Common\Files\Orometra\<experiment_id>.orf`) más un `.json` pequeño con los metadatos (nombres de parámetros, nº de pasadas, versión de formato).
- Si el EA ya define sus propios `OnTester`/`OnTesterInit`/etc., la sonda se integra llamando a las funciones `Orometra*` desde ellos.
- Huella de datos (dataset fingerprint): en una pasada de referencia, contar ticks por día y guardar un hash de la secuencia de conteos. Sirve para detectar si los datos históricos del broker cambiaron entre dos experimentos. Registrar también, como heurística y claramente marcada como tal, el primer día en que la densidad de ticks sugiere ticks reales frente a ticks generados.

**Verificar y documentar** en `MT5_ASSUMPTIONS.md`: límites de tamaño de un frame, comportamiento de los frames con agentes locales, remotos y **MQL5 Cloud Network** (si en la nube no funcionan o tienen límites, la app debe avisar y recomendar agentes locales), y qué pasa con los frames en optimización genética.

#### 3.2 Instrumentación automática (el usuario no toca código)

En `desktop/main/mt5/instrument.js` y `compile.js`:

1. El usuario elige su `.mq5`. Orometra hace una **copia** (`<nombre>_orometra.mq5`), nunca toca el original.
2. Inserta `#include <OrometraProbe.mqh>` y las llamadas en los manejadores de eventos (creándolos si no existen; si existen, añade la llamada al principio o al final según corresponda). Copia el `.mqh` a `MQL5\Include\`.
3. Compila con `metaeditor64.exe /compile:"ruta" /log`, lee el log y muestra errores en lenguaje claro.
4. Ejecuta un backtest de verificación y comprueba que el resultado de la copia instrumentada es **idéntico** al del original (mismo beneficio y nº de operaciones). Si no lo es, abortar y avisar: la sonda no debe cambiar el comportamiento.
5. **Modo caja negra:** si el usuario solo tiene el `.ex5`, se trabaja con el XML (análisis actual, «Lite»), y los informes indican claramente qué pruebas no se han podido hacer y por qué.

#### 3.3 Presupuesto de datos

Antes de lanzar, estimar el tamaño: pasadas × días activos × 6 valores × 4 bytes (float32 en disco). Si supera un límite (p. ej. 2 GB), avisar y proponer reducir el espacio. En el lector (Node), cargar el fichero en `Float32Array` por bloques.

#### 3.4 Lista de operaciones de los candidatos

Para las configuraciones finalistas (top-K de la fase 4, K pequeño, p. ej. 5), lanzar backtests individuales con informe HTML y leer la lista completa de operaciones con el parser existente. Esa lista se usa para Monte Carlo y para el stress de costes preciso.

**Criterios de aceptación:** con el EA de ejemplo, una optimización exhaustiva de ~2.000 pasadas produce el fichero `.orf`; la app lo lee; la suma de los P&L diarios de cada pasada coincide con el beneficio neto de esa pasada en el XML (tolerancia de céntimos); la copia instrumentada da el mismo resultado que el original.

---

### FASE 4 — Motor de validación sobre la matriz de retornos

**Objetivo:** con la matriz T×N (días × pasadas), calcular todas las pruebas **sin volver a ejecutar MT5**. Todo en `core/matrix/`, puro y probado.

> Condición de validez que el motor debe comprobar: si la sonda detecta lote variable (interés compuesto), los retornos se normalizan por volumen o se avisa de que la selección por ventanas puede estar sesgada por la trayectoria.

#### 4.1 Decisión previa: ¿parámetros fijos o reoptimización periódica?

Al crear la validación, la app pregunta en lenguaje sencillo:

- **«Voy a operar con estos parámetros fijos»** → la evidencia principal es: estabilidad de la meseta, consistencia entre subperiodos y un periodo reservado no visto. El WFO se muestra como diagnóstico secundario.
- **«Voy a reoptimizar cada cierto tiempo»** → la evidencia principal es el WFO, y la app registra la cadencia y la regla de selección, que serán **obligatorias** en real.

Explicar al usuario por qué importa: el WFO valida un procedimiento de reoptimización, no un conjunto fijo de parámetros.

#### 4.2 WFO sobre la matriz (`wfo.js`)

- Modos: rolling y anchored. Parámetros: longitud IS, longitud OOS, paso. Valores por defecto razonables y **una sola configuración elegida antes de ver resultados** (registrada en el pre-registro). Si el usuario prueba varias configuraciones de WFO, cada una cuenta como búsqueda adicional en el ledger.
- En cada ventana: calcular la métrica de calidad de cada pasada solo con los días IS; aplicar la regla de selección; tomar la serie OOS de la pasada elegida.
- Reglas de selección: (a) máximo de la métrica (solo como referencia), (b) **centro de meseta maximin**, reutilizando `core/engine.js` sobre las métricas de la ventana IS. La regla por defecto es (b).
- Resultados: curva OOS concatenada, eficiencia walk-forward (rendimiento OOS anualizado / IS anualizado), % de ventanas OOS positivas, drawdown global, Sharpe OOS, estabilidad de los parámetros elegidos entre ventanas (¿salta de región en región?).
- Advertencia si la selección con optimización genética introduce sesgo (el conjunto de pasadas evaluadas se eligió mirando el periodo completo). Recomendar búsqueda exhaustiva para el WFO.

#### 4.3 PBO real por CSCV (`cscv.js`)

Implementar el método de Bailey, Borwein, López de Prado y Zhu (2014): dividir T en S bloques (S par, por defecto 16), todas las combinaciones de S/2 bloques como IS, el resto como OOS, elegir la mejor en IS, calcular su rango relativo en OOS, logit, y PBO = proporción de logits ≤ 0. Mostrar también la distribución de logits y la degradación de rendimiento IS→OOS. Con N muy grande, permitir submuestrear columnas de forma estratificada con semilla. Aquí sí se llama **PBO**, porque lo es.

#### 4.4 Deflated Sharpe Ratio real y nº efectivo de pruebas (`dsr.js`)

- Implementar el DSR de Bailey y López de Prado (2014), con corrección por asimetría y curtosis de la serie de retornos de la configuración elegida.
- **Nº efectivo de pruebas:** agrupar las pasadas por correlación de sus series (clustering jerárquico sobre la distancia `sqrt(0.5·(1−ρ))`, corte por umbral configurable, o un método tipo ONC simplificado) y usar el nº de grupos. Mostrar el nº bruto y el efectivo.
- Sumar al nº efectivo las pruebas de experimentos anteriores de la misma estrategia registradas en el ledger, y mostrar aparte la búsqueda previa declarada por el usuario. Dejar claro que el total es una **cota inferior**.
- Mantener el contraste actual del Sharpe sobre métricas agregadas para el modo Lite, con su nombre de adaptación.

#### 4.5 Stress de costes analítico (`costs.js`)

Con el volumen y nº de operaciones por día de cada pasada, restar costes extra: spread adicional (en puntos → dinero por lote), slippage por lado y comisión adicional. Escenarios por defecto: base, moderado, severo (el usuario puede ajustarlos con valores sencillos: «¿cuánto spread extra por operación?»). Resultado: ¿sigue siendo rentable?, ¿cuánto se degrada?, **punto de equilibrio** (coste extra por operación que anula la ventaja). Explicar que es una aproximación de primer orden que no captura efectos de trayectoria (stops alcanzados por el spread); para estrategias con stops muy ajustados o scalping, marcar el resultado como «orientativo».

#### 4.6 Bootstrap y Monte Carlo (`bootstrap.js`)

- Siempre sobre el **OOS concatenado** (del WFO o del periodo reservado), nunca sobre el in-sample optimizado; si solo hay in-sample, decirlo y marcar el resultado como optimista.
- Bootstrap por bloques estacionario (Politis-Romano) sobre retornos diarios, longitud media de bloque configurable con valor por defecto razonable. 10.000 simulaciones por defecto, con semilla.
- Salidas: distribución de retorno, drawdown máximo, duración del peor drawdown, probabilidad de pérdida en 3/6/12 meses, probabilidad de alcanzar un drawdown X (el usuario indica cuál es su límite de dolor).
- No usar la simple permutación de operaciones como prueba de la ventaja (no cambia el resultado final); si se ofrece, rotularla solo como análisis de orden de drawdown.

#### 4.7 Tamaño de muestra (`sample.js`)

Para cada métrica clave: intervalo de confianza (bootstrap), número de operaciones y **potencia**: ¿con este nº de operaciones se puede distinguir esta ventaja de cero? Longitud mínima de backtest (MinBTL). Si la muestra no alcanza, el veredicto es «evidencia insuficiente», no «falla».

#### 4.8 Auditoría de estructura de riesgo (`risk.js`)

Con los datos de la sonda: detectar martingala (lote que aumenta tras pérdidas), grid o promediado (muchas posiciones simultáneas en la misma dirección), operaciones sin stop, exposición máxima. Estas estrategias pueden tener curvas perfectas hasta que quiebran; si se detectan, es un **veto duro** con explicación clara.

#### 4.9 Avisos de datos

- **Swaps:** el tester de MT5 aplica los swaps actuales del símbolo a todo el histórico. Si el swap supone más de un X % del resultado o las operaciones duran días, avisar.
- **Calidad de ticks:** avisar si el periodo mezcla tramos con ticks reales y generados (heurística de la fase 3).
- **Huella de datos:** si dos experimentos de la misma estrategia usan datos con huella distinta, avisar.

**Criterios de aceptación (obligatorios, con pruebas automatizadas de respuesta conocida):**

- Matriz de ruido puro (N columnas de retornos aleatorios sin ventaja): PBO cercano a 0,5 o superior, DSR bajo, veredicto «sin evidencia».
- Matriz con una ventaja plantada en una región conocida: PBO bajo, DSR alto, WFO elige configuraciones de esa región.
- Columnas duplicadas o casi idénticas: el nº efectivo de pruebas no crece con los duplicados.
- Bootstrap: con la misma semilla, resultados idénticos; la media de las simulaciones converge a la media de la serie.
- Costes: con coste extra igual al punto de equilibrio, el resultado neto es ≈ 0.
- Todas las funciones son puras y no tocan el DOM ni Node.

---

### FASE 5 — Flujo guiado, pre-registro y veredicto

**Objetivo:** que todo lo anterior sea invisible para el usuario salvo cuando quiera verlo.

#### 5.1 Asistente en 4 pasos

1. **Tu estrategia:** elegir o crear estrategia, escribir la hipótesis en una frase, declarar búsqueda previa, elegir el EA (.mq5 o .ex5).
2. **Qué quieres probar:** símbolo, timeframe, periodo total, parámetros a optimizar con sus rangos (precargados desde los `input` del EA, que Orometra lee del fuente o de un `.set`), y «¿parámetros fijos o reoptimización?».
3. **Tu listón (pre-registro):** perfil *Prudente / Estándar / Exploratorio* con umbrales ya definidos (factor de beneficio mínimo, drawdown máximo tolerable, operaciones mínimas, coste de stress, límite de dolor). Opción avanzada para ajustarlos. Al confirmar, **se congelan** con hash y fecha. Cambiarlos después crea un nuevo pre-registro que queda visible en el informe («listón modificado tras ver resultados»).
4. **Periodo reservado:** la app propone reservar el tramo más reciente (por defecto ~20 % del periodo, mínimo según nº esperado de operaciones) y **no lo usa** hasta el final. Se avisa con honestidad: si el usuario ya ha mirado ese periodo antes, no es realmente ciego; la única prueba totalmente limpia es la incubación.

Después, un botón: **«Validar»**. Orometra instrumenta, compila, optimiza, analiza, lanza los candidatos, ejecuta todas las pruebas y al final evalúa el periodo reservado **una sola vez**.

#### 5.2 Veredicto

Tres niveles, cada uno con explicación en lenguaje sencillo:

- **Descartar:** algún veto duro (estructura de riesgo peligrosa, la ventaja desaparece con costes moderados, degradación severa fuera de muestra, PBO alto, periodo reservado claramente fuera de lo esperado).
- **Investigar más / evidencia insuficiente:** no hay vetos, pero la muestra no alcanza o la evidencia es mixta. Decir qué haría falta (más historia, más operaciones, otro periodo).
- **Apto para incubación:** evidencia suficiente con el listón fijado. **Nunca** «apto para real».

Reglas:

- Pocos vetos duros (los enumerados arriba). El resto de pruebas suman o restan evidencia; no son todas binarias, para evitar que nada pase nunca o que el usuario ajuste umbrales hasta que pase.
- El análisis multi-mercado solo cuenta si la hipótesis del usuario dice que la estrategia debería funcionar en otros mercados. Si no, no penaliza.
- La perturbación de umbrales ±20 % (autoauditoría existente) se extiende al veredicto final: informar de si el veredicto cambia.

#### 5.3 Pantalla de resultado

- Arriba: veredicto, una frase de por qué, y el contador de búsqueda («este resultado se obtuvo tras N pruebas efectivas»).
- Debajo: 5–6 tarjetas (Meseta, Fuera de muestra, Costes, Riesgo, Muestra, Periodo reservado), cada una con semáforo y una línea de explicación. Clic para ver el detalle técnico (lo que ya existe en la web actual).
- Exportar: informe HTML/PDF imprimible («Research Record») con toda la configuración, los hashes y el pre-registro; `.set` de la configuración elegida.

**Criterios de aceptación:** una persona sin conocimientos técnicos, con un `.mq5` y MT5 instalado, llega de cero al veredicto sin abrir el Strategy Tester ni editar código. Probar el flujo completo con el EA de ejemplo y con un EA perdedor (debe salir «Descartar» o «evidencia insuficiente», nunca «apto»).

---

### FASE 6 — Incubación (la prueba de verdad)

**Objetivo:** el único periodo realmente no visto es el futuro. Orometra acompaña la incubación.

**Tareas:**

1. Al pasar a incubación, la app fija **antes de empezar** las bandas esperadas (a partir del bootstrap del OOS): rango esperado de resultado y drawdown a 1, 3 y 6 meses, y el nº de operaciones necesario para poder juzgar (no el nº de días).
2. Recomendación explícita: una cuenta real con lote mínimo suele dar información más fiable que una demo (la ejecución en demo suele ser más favorable). Dejar la elección al usuario.
3. Seguimiento: importar el historial de la cuenta (informe HTML de historial de MT5) o leer un fichero que escribe una versión ligera de la sonda en el EA en vivo (solo registro, nunca opera). Comparar con las bandas.
4. Reglas de parada definidas antes de empezar (p. ej. drawdown fuera del percentil 95 de lo esperado → alerta de parar y revisar). Lenguaje claro, sin alarmismo.
5. **Calibración de costes:** comparar slippage y spread reales con los simulados; guardar la diferencia por broker/símbolo para que los escenarios de stress de futuras estrategias sean realistas.

**Criterios de aceptación:** con un historial de ejemplo, la app muestra dónde está el resultado real respecto a las bandas y emite la alerta cuando corresponde.

---

### FASE 7 — Futuro (no empezar sin mi aprobación)

- WFO «fiel» orquestando MT5 ventana a ventana, para estrategias con fuerte dependencia de trayectoria.
- Stress de costes con símbolos personalizados (ticks con spread ensanchado) para estrategias de stops ajustados.
- Validación cruzada purgada / CPCV para estrategias con machine learning.
- Análisis de cartera (correlaciones entre estrategias, drawdown conjunto, asignación).
- Actualizaciones automáticas y licencias.

---

## 5. Normas de trabajo para Cursor

1. **Pruebas primero en `core/`:** cada función estadística nueva llega con una prueba de respuesta conocida (datos sintéticos donde se sabe cuál es el resultado correcto). Mantener el estilo de los bancos de prueba actuales (`tests/run.js`, `tests/stress.js`, invariantes).
2. **Nada de dependencias innecesarias.** Cada nueva dependencia se justifica en el plan de la fase.
3. **Textos de usuario en ES y EN** usando el sistema i18n existente. Lenguaje de trader, no de estadístico; los términos técnicos van en el detalle desplegable.
4. **Nunca presentar una cifra sin su contexto:** nº de operaciones, periodo, y nº de pruebas efectivas.
5. **Errores comprensibles:** todo fallo (MT5 no encontrado, compilación fallida, informe vacío, datos insuficientes) se explica con qué ha pasado y qué hacer, siguiendo el patrón de `errors.js`.
6. **Rendimiento:** los cálculos pesados en un Worker (web) o en un proceso aparte (desktop); la UI nunca se congela; progreso visible.
7. **No borrar ni reescribir funcionalidades existentes** sin decírmelo antes.
8. **Commits pequeños y descriptivos**, una idea por commit.
9. Al final de cada sesión, resumen en `docs/CHANGELOG.md`: qué se hizo, qué falta, qué suposiciones sobre MT5 siguen pendientes de verificar.

---

## 6. Referencias metodológicas

- Bailey, Borwein, López de Prado, Zhu (2014). *The Probability of Backtest Overfitting*.
- Bailey, López de Prado (2014). *The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality*.
- Bailey, Borwein, López de Prado, Zhu (2014). *Pseudo-Mathematics and Financial Charlatanism* (MinBTL).
- López de Prado (2018). *Advances in Financial Machine Learning* (clustering de estrategias, CPCV).
- Lo (2002). *The Statistics of Sharpe Ratios*.
- Politis, Romano (1994). *The Stationary Bootstrap*.
- Documentación oficial MQL5: `OnTester`, `OnTesterInit`, `OnTesterPass`, `OnTesterDeinit`, `FrameAdd`, `FrameNext`, `FrameInputs`, `ParameterSetRange`; ayuda de MT5 sobre ejecución por línea de comandos (`/config`, `/portable`) y compilación con MetaEditor (`/compile`, `/log`).

Implementa los métodos a partir de estas fuentes. Si alguna fórmula no está clara, dilo y propón cómo comprobarla con datos sintéticos antes de implementarla.

---

**Empieza por la FASE 0. Escribe el plan y espera mi confirmación.**
