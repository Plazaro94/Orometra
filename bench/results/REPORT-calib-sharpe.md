# Contraste del Sharpe: cuántas veces lo supera el puro ruido

Medición del 2026-10-15, **sin cambiar el motor** (`6689445`, el de la rama `trabajo`; da los
mismos 800 niveles que `calib-2026-10-14` y `exam6`). Script: `node bench/sharpe.js calib` y
`node bench/sharpe.js exam6`; casos en `calib-sharpe.jsonl` y `exam6-sharpe.jsonl`. El sexto
examen ya estaba publicado: aquí solo confirma lo que se ve en la calibración.

## Pregunta

La app dice que, sin ninguna ventaja real, el mejor Sharpe superaría el umbral «solo el 5 % de
las veces» (`core/verdict.js`, hallazgo del Sharpe, y Metodología, `doc.method.s6.body`). ¿Es así?

El umbral es σ · Φ⁻¹(0,95^(1/N)), con σ la dispersión de los Sharpe del forward entre pasadas y
N las «pruebas efectivas»: las celdas distintas del espacio grueso (`core/analysis.js`), no las
pasadas que entran en el contraste.

## Variantes

- **A**, la actual: N = pruebas efectivas.
- **B**: N = pasadas que entran en el contraste (exacto si sus Sharpe son independientes).
- **C**, exploratoria: N = pasadas y σ estimada con las diferencias entre vecinas a un paso,
  var(Si − Sj) / 2, para que no cuente la forma de la superficie (la señal).

B solo sube el listón: un caso solo puede pasar de aprobar a suspender. Suspender es crítico y
deja el nivel en «débil».

## 1. Cuántas veces se supera el umbral

Casos con contraste (hace falta un forward con al menos 30 pasadas de más de 30 operaciones).

| Escenario | Calibración: A / B / C | Sexto examen: A / B / C | N efectivas / pasadas (medianas) | Correlación del Sharpe entre vecinas |
|---|---|---|---|---|
| **S1** ruido puro | **33,3 % / 1,6 % / 3,2 %** (63) | **40,8 % / 7,0 % / 5,6 %** (71) | 24 / 220 · 18 / 264 | −0,01 · 0,00 |
| S2 ruido con suerte por zonas | 42,9 % / 9,5 % / 12,7 % (63) | 40,0 % / 11,4 % / 18,6 % (70) | 24 / 252 · 24 / 264 | 0,03 · 0,07 |
| S5 ventaja solo en el in-sample | 47,9 % / 15,1 % / 38,4 % (73) | 32,9 % / 7,1 % / 12,9 % (70) | 24 / 216 · 24 / 270 | 0,11 · 0,11 |
| S3 meseta ancha | 92,8 % / 68,1 % / 84,1 % | 92,3 % / 67,9 % / 82,1 % | 16 / 324 · 18 / 231 | 0,20 · 0,23 |
| S4 meseta + pico | 94,4 % / 73,6 % / 84,7 % | 85,3 % / 57,3 % / 85,3 % | 24 / 303 · 24 / 248 | 0,22 · 0,25 |
| S6 cambio de régimen | 66,7 % / 44,4 % / 52,4 % | 66,7 % / 37,5 % / 56,9 % | 18 / 272 · 24 / 264 | 0,12 · 0,14 |
| S7 genético | 85,9 % / 70,4 % / 77,5 % | 81,0 % / 65,1 % / 77,8 % | 16 / 77 · 16 / 72 | 0,16 · 0,19 |
| S8 rejilla real | 80,6 % / 69,4 % / 80,6 % | 67,0 % / 54,0 % / 65,0 % | 48 / 203 · 48 / 203 | 0,18 · 0,15 |

**S1 es la única nula limpia** (sin ventaja y sin suerte en el forward). Ahí, con A, el umbral
se supera en 50 de 134 casos (**37 %**), no en el 5 %. Con B, en 6 de 134 (**4,5 %**). En S2 y
S5 el forward tiene su propia suerte por zonas, que es real dentro de ese periodo. Por eso
cualquier variante lo supera algo más.

**Causa.** El banco simula por separado las operaciones de cada configuración, así que en S1
los Sharpe del forward de vecinas no están correlacionados (−0,01 y 0,00). El máximo es el de
todas las pasadas (220-264), pero el umbral se calcula como si fueran 18-24.

## 2. Qué niveles cambiarían

| | Calibración: A → B | Sexto examen: A → B |
|---|---|---|
| Sin ventaja, «moderada» o más | 1,3 % → 0,7 % | 1,3 % → 1,3 % |
| Potencia (S3 con ventaja clara) | 92,7 % → 87,8 % (41 casos) | 96,9 % → 93,8 % (32 casos) |
| Con ventaja, bajan a «débil» | 18 (13 moderada, 5 buena) | 25 (20 moderada, 5 buena) |
| Con ventaja, «moderada» o más | 47,8 % → 44,2 % | 43,8 % → 38,8 % |
| Coherencia: ventaja real media de la elegida, débil · moderada · buena · sólida | A 0,123 · 0,203 · 0,232 · 0,256 → B 0,132 · 0,204 · 0,236 · 0,256 | A 0,123 · 0,194 · 0,238 · 0,248 → B 0,130 · 0,199 · 0,242 · 0,248 |

Con B ningún caso sin ventaja sube de nivel y ninguno con ventaja pierde «sólida». La potencia
sigue por encima del 80 % que exige el §6 y la coherencia se mantiene. La elección de la
configuración no cambia (el contraste no interviene en ella), así que el arrepentimiento
tampoco. La coherencia se ha calculado cruzando con `calib-2026-10-14` y `exam6`, que traen la
ventaja real de cada caso. Solo entran los casos con meseta.

**C se descarta como candidata.** En S5 supera el umbral el 38,4 % de las veces en calibración y
el 12,9 % en el examen. No está calibrada y es inestable. Con C cambian de nivel 8 y 7 casos con
ventaja, y otros 2 y 5 podrían subir de nivel, cosa que este script no puede medir.

## 3. Límite de esta medición

En el banco cada configuración tiene sus propias operaciones. En un EA real, dos configuraciones
vecinas comparten buena parte de sus operaciones, y sus Sharpe pueden estar mucho más
correlacionados que aquí (como mucho 0,25 en estos escenarios). Ese era el motivo de contar
«pruebas efectivas», y es razonable. Pero el número de celdas no se ha medido nunca contra nada.
Con vecinas muy correlacionadas, B pone el listón más alto de lo necesario: es un error del lado
prudente, el mismo que el código ya acepta para σ («nunca da falsa confianza»). A, en cambio,
promete un 5 % que en el banco es un 37 %. No hay exports reales en el repositorio para medir
la correlación entre vecinas de un EA de verdad.

## 4. Lo que significa para el usuario

Hoy, en el banco, más de un tercio de las optimizaciones de puro ruido llevan en el informe
«A favor: el mejor Sharpe supera el umbral del azar», con un texto que dice que eso pasaría el 5 %
de las veces. Es lo que se ve en el ejemplo «sin ventaja» de la app.
