# Orometra — Especificación

> Este documento reemplaza una versión anterior mucho más larga que planeaba una
> aplicación de escritorio (Electron), un runner que controlaba MT5 directamente y una
> sonda MQL5 (`.orf`) para obtener curvas de resultados por pasada. Esa vía se abandonó
> el 2026-09-24: ver `docs/CHANGELOG.md` para el porqué. Lo que sigue describe **lo que
> Orometra es ahora**, no un plan a varias fases.

## 1. Qué es Orometra

Aplicación web estática (vanilla JS, módulos ES, Web Worker, sin servidor) que analiza
el export XML de una optimización de MT5 y busca **mesetas** de parámetros robustas en
lugar de picos aislados. Todo el análisis ocurre en el navegador; ningún archivo sale
del equipo del usuario. Un único producto — no hay versión de escritorio.

**Pregunta que responde:** de las configuraciones que salieron de tu optimización,
¿cuáles tienen alrededor una zona de parámetros que también funciona, y qué tan sólida
es esa evidencia? La app no dice «opera esto»: mide lo que los datos sostienen.

## 2. Principios no negociables

1. **MT5 calcula, Orometra decide.** No se construye backtester, optimizador ni motor
   de ejecución propio.
2. **No se juzga con la vara con la que se optimizó.** La columna `Result` de MT5 no se
   usa como medida de calidad.
3. **Umbrales absolutos, no percentiles.** La app debe poder decir «aquí no hay nada».
4. **Una configuración vale lo que su peor periodo** (maximin), no la media.
5. **Se elige el centro de la meseta, no su cima.**
6. **Lo que no se puede calcular no se calcula, y se dice por qué.** Ninguna métrica se
   presenta con el nombre de un método publicado (PBO, DSR, CSCV…) si no se ha
   calculado como en el método publicado. Las adaptaciones se nombran como
   adaptaciones. Esto es justamente lo que hizo retirar CSCV/PBO real, DSR real y el
   walk-forward multiventana: exigían una curva de equity por configuración que solo
   una sonda instalada en el EA del usuario podía dar, y esa vía se cerró.
7. **Evidencia, no permiso.** La app nunca dice «opera». Los veredictos son sobre la
   fuerza de la evidencia.
8. **«No hay datos suficientes» es un resultado válido**, distinto de «no funciona».
9. **Determinismo.** Todo proceso aleatorio (bootstrap, remuestreos) usa una semilla
   registrada (`core/rng.js`). Mismas entradas + misma semilla = mismo resultado.
10. **La herramienta se audita a sí misma**: los umbrales internos se perturban ±20 % y
    se informa de cuántas veces sigue ganando la misma región.

## 3. Arquitectura

```
orometra/
├── core/                    # Motor puro (JS, sin DOM, sin Node)
│   ├── engine.js            # topología, vecindades, mesetas
│   ├── analysis.js          # análisis de optimización agregada
│   ├── stats.js             # primitivas estadísticas
│   ├── metrics.js           # puntuación por ejes (retorno/riesgo/eficiencia/evidencia)
│   ├── verdict.js           # veredicto por fuerza de evidencia
│   ├── unseen.js            # contraste contra el periodo no visto (6 cifras agregadas)
│   ├── report.js            # lector del informe HTML de backtest (operación a operación)
│   ├── matrix/              # análisis sobre la lista de operaciones del periodo no visto
│   │   ├── from-deals.js    # agrupa `report.js#deals` en serie diaria y orquesta lo de abajo
│   │   ├── bootstrap.js     # bootstrap estacionario (Politis-Romano) / Monte Carlo
│   │   ├── sample.js        # tamaño de muestra, intervalos, potencia
│   │   ├── costs.js         # stress de costes analítico + punto de equilibrio
│   │   └── risk.js          # aviso de dominancia del swap
│   ├── parse.js, xlsx.js, setfile.js, schema.js, errors.js, rng.js
├── app/                     # shell de la app (index.html)
├── js/                      # UI (módulos por sección; ninguno debe superar ~600 líneas)
├── methodology/, privacy/   # páginas públicas
├── tests/
└── docs/
    ├── SPEC.md              # este documento
    ├── CHANGELOG.md
    └── MT5_ASSUMPTIONS.md
```

### Por qué `core/matrix/` no necesita nada fuera del navegador

El export de **optimización** de MT5 solo trae métricas agregadas por pasada: con eso
nunca se podría hacer Monte Carlo ni stress de costes real. Pero el informe HTML de
**un backtest individual** (el que se usa para validar el periodo no visto) sí trae la
lista de operaciones una a una. `core/matrix/from-deals.js` agrupa esa lista por día y
alimenta bootstrap/muestra/costes con ella — sin sonda, sin Electron, sin nada que
instalar. Lo que esa lista **no** trae (stop loss por operación, posiciones simultáneas,
hora de apertura) es exactamente lo que se dejó fuera (auditoría de estructura de
riesgo, duración media de operación): no se rellena con supuestos.

Lo que sigue sin poder calcularse sin la curva de equity por configuración de toda la
rejilla — y por tanto sigue fuera — es el PBO/CSCV publicado, el Deflated Sharpe Ratio
publicado con número efectivo de pruebas por clustering, y el walk-forward multiventana
orquestando MT5. Ver `docs/CHANGELOG.md`, entrada 2026-09-24.

## 4. Normas de trabajo

1. **Pruebas primero en `core/`:** cada función estadística nueva llega con una prueba
   de respuesta conocida (datos sintéticos donde se sabe cuál es el resultado
   correcto).
2. **Nada de dependencias innecesarias.** Cero dependencias en tiempo de ejecución;
   cualquier nueva se justifica explícitamente.
3. **Textos de usuario en ES y EN**, lenguaje de trader, no de estadístico; los
   términos técnicos van en el detalle desplegable o en nota a pie.
4. **Nunca presentar una cifra sin su contexto:** nº de operaciones, periodo, y de
   dónde sale (agregado del export vs. operación a operación del informe).
5. **Errores comprensibles:** todo fallo se explica con qué ha pasado y qué hacer
   (`core/errors.js`).
6. **Rendimiento:** los cálculos pesados van en el Web Worker; la UI nunca se congela.
7. **No borrar ni reescribir funcionalidad existente** sin decirlo antes.
8. Al cerrar una sesión de trabajo relevante: resumen en `docs/CHANGELOG.md`.

## 5. Referencias metodológicas

- Politis, Romano (1994). *The Stationary Bootstrap*.
- Bailey, Borwein, López de Prado, Zhu (2014). *Pseudo-Mathematics and Financial
  Charlatanism* (MinBTL, potencia estadística).
- Lo (2002). *The Statistics of Sharpe Ratios*.

Las referencias sobre CSCV, DSR publicado y walk-forward (Bailey et al. 2014 sobre PBO;
López de Prado 2018) siguen citadas en el código retirado a través del historial de git
si se retoma esa vía en el futuro con una fuente de datos por configuración.
