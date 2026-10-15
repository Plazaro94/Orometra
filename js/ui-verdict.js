// Veredicto, evidencia, why-grade, outcome y top3.

import { qualityLabel } from '../core/metrics.js';
import { compareParams } from '../core/report.js';
import { setCoverageNote } from './export.js';
import { mergeSetValues } from '../core/setfile.js';
import { outcomeFromAnalysis, CODE, errorCopy } from '../core/errors.js';
import { scatterIsOos, degradationChart, plateauHeatmap } from './charts.js';
import { topInfluentialPair } from '../core/surface.js';
import { t, L, localeTag, pctSign, shareText } from './i18n.js';
import { state, api, num, int, pct, esc, rich, paramHtml, categorizeFinding, findInMt5Html, mt5Figure, mt5Figures, forwardHoldHtml, deployableSet, forwardUntested } from './ui-state.js';
import { gloss } from './glossary.js';

/*
 * El sello califica la FUERZA DE LA EVIDENCIA, no la estrategia. Antes decia
 * "NO RECOMENDADO" / "SUPERA LA AUDITORIA", que era decidir por el usuario sobre algo
 * que la aplicacion no mide. Ahora describe lo que sostiene el hallazgo.
 */
/**
 * Cuantas configuraciones se han analizado, contado como lo entiende el usuario.
 *
 * `meta.total` es lo que queda tras agrupar las pasadas que solo se diferencian en
 * parametros sin efecto medible: con un export real (256 pasadas emparejadas) salia
 * "92 configuraciones" y parecia que se habian leido mal los archivos.
 */
export function configsLabel(a, short = false) {
  const integ = a.integrity || {};
  const paired = Number.isFinite(integ.matchedRows) ? integ.matchedRows : a.meta.total;
  const grouped = integ.collapsedTopology > 0 && paired > a.meta.total;
  const base = a.meta.hasForward
    ? L(`${int(paired)} pasadas emparejadas`, `${int(paired)} paired passes`)
    : L(`${int(paired)} pasadas`, `${int(paired)} passes`);
  if (!grouped) return base;
  if (short) return L(`${base} (${int(a.meta.total)} distintas)`, `${base} (${int(a.meta.total)} distinct)`);
  const flat = (a.meta.flatDims || []).join(', ');
  return L(
    `${base} · ${int(a.meta.total)} tras agrupar ${flat || 'parámetros'} (sin efecto medible)`,
    `${base} · ${int(a.meta.total)} after grouping ${flat || 'parameters'} (no measurable effect)`,
  );
}

export function verdictCopy(level) {
  if (level === 'insufficient') return { label: t('verdict.insufficient'), cls: 'v-no' };
  if (level === 'weak') return { label: t('verdict.weak'), cls: 'v-weak' };
  if (level === 'moderate') return { label: t('verdict.moderate'), cls: 'v-warn' };
  if (level === 'good') return { label: t('verdict.good'), cls: 'v-go' };
  return { label: t('verdict.strong'), cls: 'v-go' };
}

/**
 * Textos de un «periodo no visto» que repite uno ya usado (core/unseen.js#repeatedPeriod):
 * 'is', 'oos' o 'both'. `body` necesita la pasada comparada.
 */
export function repeatedPeriodText(kind, passId = '') {
  const where = kind === 'is'
    ? L('el periodo optimizado', 'the optimized period')
    : kind === 'oos' ? L('el forward', 'the forward') : L('el periodo optimizado y el forward', 'the optimized period and the forward');
  return {
    headline: L(`Este backtest repite ${where}`, `This backtest repeats ${where}`),
    short: L(`El backtest repite ${where}: no es un periodo no visto.`, `The backtest repeats ${where}: it is not an unseen period.`),
    body: kind === 'both'
      ? L(`Sus operaciones y su beneficio coinciden con la suma de los dos periodos de la pasada ${passId}: es el rango entero que ya usaste para optimizar y validar, así que estas cifras no prueban nada nuevo. Lanza el backtest en MT5 sobre un tramo que no hayas usado y vuelve a cargar el informe.`,
        `Its trades and profit match the sum of both periods of pass ${passId}: it is the whole range you already used to optimize and validate, so these figures prove nothing new. Run the backtest in MT5 on a period you have not used and load the report again.`)
      : L(`Sus operaciones y su beneficio coinciden con los de la pasada ${passId} en ${where}: son las mismas fechas, así que estas cifras ya formaban parte de lo que la meseta había mostrado y no prueban nada nuevo. Lanza el backtest en MT5 sobre un tramo que no hayas usado y vuelve a cargar el informe.`,
        `Its trades and profit match those of pass ${passId} on ${where}: same dates, so these figures were already part of what the plateau had shown and prove nothing new. Run the backtest in MT5 on a period you have not used and load the report again.`),
  };
}

/** Estado del holdout para sello / hoja de evidencia (forward ≠ periodo no visto). */
export function holdoutFact(a) {
  const res = state.unseen && state.unseen.result;
  if (!res) {
    return {
      value: L('No aportado', 'Not supplied'),
      note: a && a.meta && a.meta.hasForward
        ? L('Pendiente: es el siguiente paso.', 'Pending: it is the next step.')
        : L('Validación independiente aún no cargada.', 'Independent validation not loaded yet.'),
      short: L('Periodo no visto: no aportado', 'Unseen period: not supplied'),
      done: false,
      ok: false,
    };
  }
  const value = res.level === 'normal'
    ? L('No contradice', 'Not contradicted')
    : res.level === 'tail'
      ? L('En la cola', 'In the tail')
      : L('Fuera de rango', 'Out of range');
  /*
   * Un resultado "normal" solo confirma la recomendación si el backtest es de ESA
   * configuración: la meseta recomendada (M1) y, si hay informe, con sus mismos
   * parámetros y al menos uno leído. Si no, el contraste es aritméticamente correcto
   * pero no valida nada: ni mantiene el nivel con la mención del periodo no visto ni lo
   * baja. "En la cola" o "fuera de rango" sobre la configuración propuesta sí lo bajan.
   */
  const plateaus = (a && a.plateaus) || [];
  const idx = plateaus.length ? Math.min(state.unseen.plateauIndex || 0, plateaus.length - 1) : -1;
  const plateau = idx >= 0 ? plateaus[idx] : null;
  const cmp = state.report && plateau
    ? compareParams(state.report.params, a.meta.paramNames, plateau.record.params)
    : null;
  let problem = '';
  if (cmp && cmp.different.length) {
    problem = L('El informe es de otra configuración: no valida la propuesta.', 'The report is from another configuration: it does not validate the proposal.');
  } else if (cmp && !cmp.same.length) {
    problem = L('No se han podido leer los parámetros del informe, así que no consta que sea de la configuración propuesta.', 'The report parameters could not be read, so it is not confirmed that it comes from the proposed configuration.');
  } else if (cmp && cmp.missing.length) {
    problem = L(`Al informe le faltan parámetros optimizados (${cmp.missing.slice(0, 4).join(', ')}${cmp.missing.length > 4 ? '…' : ''}), así que no consta que sea de la configuración propuesta.`,
      `The report is missing optimized parameters (${cmp.missing.slice(0, 4).join(', ')}${cmp.missing.length > 4 ? '…' : ''}), so it is not confirmed that it comes from the proposed configuration.`);
  } else if (res.repeated) {
    problem = repeatedPeriodText(res.repeated).short;
  } else if (idx > 0) {
    problem = L(`Se evaluó la meseta ${idx + 1}, no la recomendada (la 1).`, `Plateau ${idx + 1} was evaluated, not the recommended one (plateau 1).`);
  }
  return {
    value: problem ? L(`${value} · no valida`, `${value} · does not validate`) : value,
    note: problem || res.headline || '',
    short: problem
      ? L(`Periodo no visto: ${value} · no valida`, `Unseen period: ${value} · does not validate`)
      : L(`Periodo no visto: ${value}`, `Unseen period: ${value}`),
    done: true,
    ok: !problem && res.level === 'normal',
    // "En la cola" o "fuera de rango" sobre la configuración propuesta: el periodo no
    // visto va en contra. Un informe ajeno no dice nada, ni a favor ni en contra.
    against: !problem && res.level !== 'normal',
  };
}

/**
 * El motor califica con el periodo optimizado y el forward, y desde la enmienda del
 * 2026-10-09 (bench/PREREGISTRO.md) puede dar «buena» y «sólida» sin periodo no visto.
 * Ese periodo, si se aporta, solo puede mantener el nivel o bajarlo: si va en contra de la
 * configuración propuesta, «buena» y «sólida» bajan a «moderada»; si no la contradice, el
 * nivel se queda como está (su contraste detecta poco, core/unseen.js: no sube a nadie).
 */
export function displayVerdictLevel(a) {
  const level = a.verdict.level;
  if ((level === 'strong' || level === 'good') && a.meta.hasForward && holdoutFact(a).against) return 'moderate';
  return level;
}

/**
 * Titular y resumen coherentes con el nivel MOSTRADO y con el periodo no visto. Si el
 * periodo no visto baja el nivel, a.verdict.headline/summary siguen siendo el texto que
 * el motor generó para «buena» o «sólida»: usarlos tal cual contradice al medidor.
 */
export function displayVerdictCopy(a) {
  const level = displayVerdictLevel(a);
  const v = a.verdict;
  const hold = holdoutFact(a);
  if (level === v.level) {
    if ((level === 'strong' || level === 'good') && hold.done && hold.ok) {
      return {
        level,
        headline: level === 'strong'
          ? L('Evidencia sólida, y el periodo no visto no la contradice', 'Strong evidence, and the unseen period does not contradict it')
          : L('Evidencia buena, y el periodo no visto no la contradice', 'Good evidence, and the unseen period does not contradict it'),
        summary: level === 'strong'
          ? L('La meseta propuesta se apoya en vecinas que también cumplen tus mínimos, aguanta en el forward y la recomendación se mantiene al mover los umbrales. Además, en un periodo que no se usó ni para optimizar ni para validar, su resultado entra en lo habitual de la meseta.',
            'The proposed plateau rests on neighbors that also clear your minimums, holds on the forward, and the recommendation holds when thresholds are moved. On top of that, on a period used neither to optimize nor to validate, its result falls within the plateau\'s usual range.')
          : L('La meseta propuesta aguanta en el forward y al mover los umbrales, con un aviso que conviene leer. En un periodo que no se usó ni para optimizar ni para validar, su resultado entra en lo habitual de la meseta; eso no la sube de nivel, porque esa prueba detecta poco.',
            'The proposed plateau holds on the forward and when thresholds are moved, with one warning worth reading. On a period used neither to optimize nor to validate, its result falls within the plateau\'s usual range; that does not raise its level, because that check detects little.'),
      };
    }
    return { level, headline: v.headline, summary: v.summary };
  }
  // buena o sólida -> moderada: el periodo no visto va en contra de la configuración propuesta.
  return {
    level,
    headline: L('Evidencia moderada: el periodo no visto no la confirma', 'Moderate evidence: the unseen period does not confirm it'),
    summary: L(
      'La meseta propuesta se apoya en vecinas que también cumplen tus mínimos y pasó el forward, pero en el periodo no visto su resultado se sale de lo habitual. Lo que puedes hacer ahora, y lo que no conviene, está en «Qué hacer ahora».',
      'The proposed plateau rests on neighbors that also clear your minimums and passed the forward, but on the unseen period its result falls outside the usual range. What you can do now, and what is best avoided, is under “What to do now”.',
    ),
  };
}

/**
 * Texto de la sugerencia orientativa (sin meseta), ya escapado para HTML. Tiene que dejar
 * claro que NO es una región estable: es la configuración que mejor combina los dos
 * periodos con sus vecinas.
 */
export function fallbackNote(a) {
  const params = a.meta.paramNames.map((n, j) => `${esc(n)}=${paramHtml(a.fallback.record.params[j])}`).join(', ');
  const gates = a.fallback.passesBoth
    ? ''
    : L(' Ninguna configuración cumple tus mínimos en los dos periodos: esta solo los cumple en el periodo optimizado.',
      ' No configuration meets your minimums in both periods: this one only meets them on the optimized period.');
  return L(
    `Sin meseta. Es la que mejor combina el periodo optimizado y el forward junto con sus vecinas (${params}).${gates} No es una zona estable, y Orometra no puede contrastarla en un periodo no visto porque no hay meseta con la que comparar: tómala solo como punto de partida para volver a optimizar.`,
    `No plateau. It is the one that best combines the optimized period and the forward together with its neighbors (${params}).${gates} It is not a stable zone, and Orometra cannot check it on an unseen period because there is no plateau to compare it with: take it only as a starting point to optimize again.`,
  );
}

/**
 * El siguiente paso depende también del periodo no visto: el motor recomienda hacerlo,
 * pero una vez hecho, repetir "pruébala en un periodo no visto" es un consejo caducado.
 */
export function nextStepText(a, hold) {
  if (!hold || !hold.done || !a.plateaus.length) return a.verdict.nextStep;
  if (hold.ok) {
    // Aprobar el periodo no visto no sube el nivel (detecta poco): con evidencia débil, lo
    // que la deja en débil sigue ahí, y el siguiente paso no puede ser el mismo que con buena.
    if (displayVerdictLevel(a) === 'weak') {
      return a.meta.hasForward
        ? L(
          'El periodo no visto no la contradice, pero eso no compensa lo que la deja en débil: esta prueba detecta poco, y aprobarla no la confirma. Lee en «Por qué este nivel» qué la deja ahí. Si sigues con ella, que sea en demo, sin dinero real, comparando con el rango habitual de la meseta. Para tener más evidencia hace falta un tramo nuevo: el periodo optimizado, el forward y este ya están usados.',
          'The unseen period does not contradict it, but that does not make up for what keeps it weak: this check detects little, and passing it does not confirm it. Read in “Why this level” what keeps it there. If you go on with it, do so on demo, without real money, comparing with the plateau\'s usual range. More evidence needs a new segment: the optimized period, the forward and this one are already used.',
        )
        : L(
          'El periodo no visto no la contradice, pero sin forward la evidencia no pasa de débil y esta prueba no la sube. Para medir más, vuelve a optimizar con Forward en fechas que no hayas usado (tampoco las de este tramo) y analiza de nuevo. Si sigues con ella mientras tanto, que sea en demo, sin dinero real.',
          'The unseen period does not contradict it, but without a forward the evidence does not go above weak and this check does not raise it. To measure more, re-optimize with Forward on dates you have not used (not this segment\'s either) and analyze again. If you go on with it meanwhile, do so on demo, without real money.',
        );
    }
    return L(
      'El periodo no visto no la contradice (esta prueba detecta poco: aprobarla no la confirma). Siguiente paso: pruébala en demo o en real con riesgo reducido, y compara sus resultados en vivo con el rango habitual de la meseta, no con las mejores cifras.',
      'The unseen period does not contradict it (this check detects little: passing it does not confirm it). Next step: run it on demo or live with reduced risk, and compare its live results with the plateau\'s usual range, not with the best figures.',
    );
  }
  if (hold.against) {
    return againstOptions().map(([title, body], i) => `${i + 1}) ${title}. ${body}`).join(' ');
  }
  // El informe no cuenta (otra configuración, otra meseta, un periodo ya usado): no es que
  // haya fallado, es que no se ha probado la propuesta.
  return L(
    `${hold.note} Lanza en MT5 el backtest de la configuración propuesta (con su .set) sobre un tramo que no hayas usado ni para optimizar ni para validar, y suelta aquí el informe.`,
    `${hold.note} Run the backtest of the proposed configuration in MT5 (with its .set) on a segment you have used neither to optimize nor to validate, and drop the report here.`,
  );
}

/**
 * Qué hacer cuando el periodo no visto va en contra de la configuración propuesta. Antes solo
 * se decía «revisa qué métrica falla antes de dar ningún paso más», sin ningún paso. Lo que no
 * conviene va primero: es el error fácil (reoptimizar con ese tramo dentro, o buscar otro hasta
 * que uno salga bien). Pares [título, cuerpo] en texto plano.
 */
export function againstOptions() {
  return [
    [L('No la reoptimices sobre este tramo', 'Do not re-optimize over this segment'),
      L('Ni lo metas en una nueva optimización ni busques otro tramo hasta que uno salga bien: este resultado ya forma parte de lo que sabes de esta configuración.',
        'Do not put it into a new optimization or look for another segment until one comes out well: this result is now part of what you know about this configuration.')],
    [L('Mira qué falla y cuánto', 'See what fails and by how much'),
      L('En la pestaña del periodo no visto, qué cifras se salen. Esta prueba también da falsas alarmas (lo dice su nota de alcance), sobre todo con tramos cortos: una sola métrica en la cola pesa menos que varias fuera de rango.',
        'In the unseen-period tab, which figures fall outside. This check also gives false alarms (its scope note says so), above all with short segments: a single metric in the tail weighs less than several out of range.')],
    [L('Si sigues con ella, sin dinero real', 'If you go on with it, without real money'),
      L('Déjala en demo y compárala con el rango habitual de la meseta. Para volver a confiar en ella hace falta un tramo nuevo que no hayas mirado, no repetir este.',
        'Keep it on demo and compare it with the plateau\'s usual range. Trusting it again needs a new segment you have not looked at, not repeating this one.')],
    [L('O vuelve a empezar', 'Or start over'),
      L('Con la idea revisada o con más histórico, reservando antes de optimizar un tramo final que no vayas a mirar hasta el final.',
        'With the idea revised or with more history, setting aside before optimizing a final segment you will not look at until the end.')],
  ];
}

const LEVEL_ORDER = ['insufficient', 'weak', 'moderate', 'good', 'strong'];

/** Nombre corto de cada nivel para el medidor («Moderada»), sin la palabra «Evidencia». */
export function levelName(level) {
  return {
    insufficient: L('Insuficiente', 'Insufficient'),
    weak: L('Débil', 'Weak'),
    moderate: L('Moderada', 'Moderate'),
    good: L('Buena', 'Good'),
    strong: L('Sólida', 'Strong'),
  }[level];
}

/**
 * Una frase llana que dice qué significa el nivel mostrado en este análisis concreto.
 * El titular del motor («Evidencia moderada») va arriba como título de la página; esto
 * es lo que el usuario necesita leer debajo del medidor para entenderlo sin jerga.
 */
export function trustLine(a, level) {
  const v = a.verdict;
  const regions = a.plateaus.length;
  const warnings = (v.counts && v.counts.warnings) || 0;
  const critical = (v.counts && v.counts.critical) || 0;
  if (level === 'insufficient') {
    return L('Con estos datos no se puede afirmar nada, ni a favor ni en contra de tu EA.',
      'These data cannot support any claim, for or against your EA.');
  }
  if (level === 'weak') {
    if (!regions) {
      return L('No hay ninguna meseta: solo configuraciones sueltas, que pueden deberse a la suerte.',
        'There is no plateau: only isolated configurations, which may be down to luck.');
    }
    if (!a.meta.hasForward) {
      return L('Hay una meseta, pero sin un periodo de validación no se puede saber si aguanta fuera de los datos optimizados.',
        'There is a plateau, but without a validation period there is no way to know whether it holds beyond the optimized data.');
    }
    return critical === 1
      ? L('Hay una meseta, pero con una limitación seria que conviene leer antes de usarla.',
        'There is a plateau, but with one serious limitation worth reading before using it.')
      : L(`Hay una meseta, pero con ${critical} limitaciones serias que conviene leer antes de usarla.`,
        `There is a plateau, but with ${critical} serious limitations worth reading before using it.`);
  }
  const hold = holdoutFact(a);
  const unseenOk = hold.done && hold.ok;
  if (level === 'good') {
    return unseenOk
      ? L('Meseta validada en el forward, con un aviso que conviene leer. El periodo no visto no la contradice.',
        'A plateau validated on the forward, with one warning worth reading. The unseen period does not contradict it.')
      : L('Meseta validada en el forward y estable al mover los umbrales, con un aviso que conviene leer.',
        'A plateau validated on the forward and stable when thresholds are moved, with one warning worth reading.');
  }
  if (level === 'moderate') {
    if (a.verdict.level === 'strong' || a.verdict.level === 'good') {
      return L('Meseta validada en el forward, pero el periodo no visto no la confirma.',
        'A plateau validated on the forward, but the unseen period does not confirm it.');
    }
    return warnings === 1
      ? L('Meseta con apoyo real, con un aviso que conviene leer.', 'A plateau with real support, with one warning worth reading.')
      : L(`Meseta con apoyo real, con ${warnings} avisos que conviene leer.`, `A plateau with real support, with ${warnings} warnings worth reading.`);
  }
  // «Sin contradicción», no «confirmada»: la prueba del periodo no visto detecta poco
  // (core/unseen.js) y el siguiente paso lo dice; aquí no se puede decir lo contrario.
  return unseenOk
    ? L('Lo máximo que estos datos pueden respaldar: una meseta validada en el forward, sin avisos sobre ella, a la que el periodo no visto no contradice.',
      'The most these data can support: a plateau validated on the forward, with no warnings about it, and not contradicted by the unseen period.')
    : L('Lo máximo que el periodo optimizado y el forward pueden respaldar: una meseta validada, estable y sin avisos sobre ella. Un periodo no visto puede mantenerla o bajarla.',
      'The most the optimized period and the forward can support: a validated, stable plateau with no warnings about it. An unseen period can keep it there or lower it.');
}

/**
 * El titular del informe: una frase que contesta y dice el siguiente paso, en vez del nivel
 * a secas («Evidencia sólida»), que queda encima como etiqueta. Texto plano: el número de
 * pasada viene del archivo del usuario y se pinta con textContent o con esc().
 */
export function answerLine(a) {
  const level = displayVerdictLevel(a);
  const best = a.plateaus[0];
  const hold = holdoutFact(a);
  const counts = a.verdict.counts || {};
  const crit = counts.critical || 0;
  const warns = counts.warnings || 0;
  if (level === 'insufficient') {
    return L('Con estos datos no se puede saber si hay algo.', 'These data cannot tell whether there is anything there.');
  }
  if (!best) return L('En esta optimización no hay nada que respaldar.', 'There is nothing to back in this optimization.');
  const id = best.record.id;
  if (hold.done && hold.against) {
    return L(`La pasada ${id} no ha aguantado en el tramo que no habías usado.`, `Pass ${id} did not hold on the stretch you had not used.`);
  }
  if (hold.done && hold.ok) {
    return L(`Tu optimización tiene una zona estable, y el tramo que no habías usado no contradice a la pasada ${id}.`,
      `Your optimization has a stable zone, and the stretch you had not used does not contradict pass ${id}.`);
  }
  if (!a.meta.hasForward) {
    return L(`Hay una zona estable alrededor de la pasada ${id}, pero sin forward no se puede saber si aguanta fuera.`,
      `There is a stable zone around pass ${id}, but without a forward there is no way to know whether it holds elsewhere.`);
  }
  if (!deployableSet(a, best)) {
    return L('Hay una zona estable, pero el forward no ha probado ninguna de sus configuraciones: vuelve a optimizar en su rango.',
      'There is a stable zone, but the forward did not test any of its configurations: optimize again within its range.');
  }
  if (level === 'weak') {
    return crit === 1
      ? L(`Hay una zona estable, pero con una limitación seria: léela antes de usar la pasada ${id}.`,
        `There is a stable zone, but with one serious limitation: read it before using pass ${id}.`)
      : L(`Hay una zona estable, pero con ${crit} limitaciones serias: léelas antes de usar la pasada ${id}.`,
        `There is a stable zone, but with ${crit} serious limitations: read them before using pass ${id}.`);
  }
  const tail = L(`Llévate la pasada ${id} y pruébala en un tramo que no hayas usado.`, `Take pass ${id} and test it on a stretch you have not used.`);
  if (level === 'good') return `${L('Tu optimización tiene una zona estable, con un aviso.', 'Your optimization has a stable zone, with one warning.')} ${tail}`;
  if (level === 'moderate' && warns) {
    return `${warns === 1
      ? L('Tu optimización tiene una zona estable, con un aviso.', 'Your optimization has a stable zone, with one warning.')
      : L(`Tu optimización tiene una zona estable, con ${warns} avisos.`, `Your optimization has a stable zone, with ${warns} warnings.`)} ${tail}`;
  }
  return `${L('Tu optimización tiene una zona estable.', 'Your optimization has a stable zone.')} ${tail}`;
}

/** La n.º 1 de MT5: la de mayor Result en el periodo optimizado, como la ordena el probador. */
export function mt5Top(a) {
  let at = null;
  let top = -Infinity;
  a.records.forEach((r, i) => { if (Number.isFinite(r.criterionIs) && r.criterionIs > top) { top = r.criterionIs; at = i; } });
  return at;
}

/**
 * Cabecera compacta de las pestañas que no son el veredicto: el nivel y la pasada en una
 * línea, en vez del titular de tres líneas que empujaba cada pestaña ~285 px hacia abajo.
 * El titular completo sigue en el h1 (oculto a la vista, no al lector de pantalla).
 */
export function compactSummary(a) {
  const level = displayVerdictLevel(a);
  const name = levelName(level);
  const pill = `<span class="rc-level" style="--s:var(--lv-${LEVEL_ORDER.indexOf(level) + 1})"><span class="rc-dot" aria-hidden="true"></span>${esc(L(`Evidencia ${name.toLowerCase()}`, `${name} evidence`))}</span>`;
  const best = a.plateaus[0];
  const pick = best
    ? `<span class="rc-pass">${L('Pasada', 'Pass')} <b>${esc(best.record.id)}</b></span>`
    : a.fallback
      ? `<span class="rc-pass">${L('Orientativa: pasada', 'Tentative: pass')} <b>${esc(a.fallback.record.id)}</b></span>`
      : `<span class="rc-pass">${esc(L('Ninguna configuración con garantías', 'No configuration you can rely on'))}</span>`;
  return pill + pick;
}

/** La acción principal de la cabecera compacta: la misma que el botón lima del veredicto. */
export function compactAction(a) {
  if (!a.plateaus[0]) return null;
  return deployableSet(a, a.plateaus[0])
    ? { kind: 'set', label: L('Descargar .set', 'Download .set') }
    : { kind: 'refine', label: L('Descargar rango', 'Download range') };
}

/** Medidor de cinco tramos: dónde está este análisis y cuánto le falta. */
function evidenceMeter(level) {
  const at = LEVEL_ORDER.indexOf(level);
  const n = LEVEL_ORDER.length;
  return `<div class="vx-meter" role="img" aria-label="${esc(L(`Fiabilidad: ${levelName(level)} (${at + 1} de ${n})`, `Reliability: ${levelName(level)} (${at + 1} of ${n})`))}">
    ${LEVEL_ORDER.map((lv, i) => `<div class="vx-seg${i <= at ? ' is-on' : ''}${i === at ? ' is-here' : ''}">
      <span class="vx-seg-bar"></span>
      <span class="vx-seg-name">${esc(levelName(lv))}</span>
    </div>`).join('')}
  </div>`;
}

/**
 * Tres hechos que resumen por qué fiarse (o no) de la configuración elegida, contados con
 * palabras. La única nota de la tarjeta es la fiabilidad: la robustez (/100) y la calidad
 * (0-1) se quedan en Mesetas, donde se explican, para que no parezcan la misma cifra.
 */
function keyFacts(a, best) {
  if (!best) return '';
  const nb = best.neighborhood;
  const val = best.oosValidation;
  const st = a.stats && a.stats.stabilityCheck;
  const fact = (value, text) => `<div class="vx-stat"><strong>${value}</strong><span class="vx-stat-note">${text}</span></div>`;
  const of = L('de', 'of');
  const items = [];
  if (nb) {
    items.push(fact(`${int(nb.passing)}<small> ${of} ${int(nb.observed)}</small>`,
      esc(L('vecinas también pasan tus mínimos', 'neighbors also clear your minimums'))));
  }
  if (a.meta.hasForward && val && val.withForward) {
    const passed = Math.round(val.passFrac * val.withForward);
    items.push(fact(pct(val.passFrac, 0),
      esc(L(`de la meseta sigue cumpliendo tus mínimos en el forward (${int(passed)} de ${int(val.withForward)})`,
        `of the plateau still clears your minimums on the forward (${int(passed)} of ${int(val.withForward)})`))));
  } else {
    items.push(fact('—', esc(L('Sin forward: no se ha podido validar fuera del periodo optimizado.', 'No forward: it could not be validated beyond the optimized period.'))));
  }
  if (st && st.draws && Number.isFinite(st.regionRate)) {
    items.push(fact(`${int(Math.round(st.regionRate * st.draws))}<small> ${of} ${int(st.draws)}</small>`,
      esc(L('veces gana la misma zona al mover nuestros propios umbrales', 'times the same zone wins when we move our own thresholds'))));
  }
  return `<div class="vx-stats">${items.join('')}</div>`;
}

/**
 * El terreno de la optimización: el mapa de los dos parámetros que más influyen (el mismo de
 * Parámetros) con la elegida y la n.º 1 de MT5 señaladas. Enseña de un vistazo lo que hace
 * Orometra: meseta frente a pico. Con menos de dos parámetros variables no hay mapa.
 */
function terrainMap(a, best) {
  if ((a.sensitivity || []).filter((x) => !x.constant).length < 2) return '';
  const pair = topInfluentialPair(a.sensitivity);
  if (!pair) return '';
  const top = mt5Top(a);
  const pickIdx = best ? best.representative : null;
  const marks = [];
  if (best) marks.push({ index: pickIdx, kind: 'pick', label: L(`la elegida (pasada ${best.record.id})`, `the chosen one (pass ${best.record.id})`) });
  if (top !== null && top !== pickIdx) marks.push({ index: top, kind: 'mt5', label: L(`n.º 1 de MT5 (pasada ${a.records[top].id})`, `MT5’s #1 (pass ${a.records[top].id})`) });
  const topId = top !== null ? a.records[top].id : '';
  let reading = '';
  if (top !== null && top === pickIdx) {
    reading = L(`La elegida es también la n.º 1 de MT5 (pasada ${topId}): aquí la cabeza de la tabla está en terreno firme.`,
      `The chosen one is also MT5’s #1 (pass ${topId}): here the top of the table stands on firm ground.`);
  } else if (top !== null && best && (best.indices || []).includes(top)) {
    reading = L(`La n.º 1 de MT5 (pasada ${topId}) está dentro de la misma meseta: la cabeza de la tabla está en terreno firme.`,
      `MT5’s #1 (pass ${topId}) is inside the same plateau: the top of the table stands on firm ground.`);
  } else if (top !== null && best) {
    reading = L(`La n.º 1 de MT5 (pasada ${topId}) queda fuera de la meseta elegida.`, `MT5’s #1 (pass ${topId}) lies outside the chosen plateau.`);
  } else if (top !== null) {
    reading = L(`No hay ninguna zona continua por encima del resto: la n.º 1 de MT5 (pasada ${topId}) es un punto suelto.`,
      `No continuous zone stands above the rest: MT5’s #1 (pass ${topId}) is an isolated point.`);
  }
  const legend = [
    best ? `<span class="vx-map-key"><i class="vx-key-pick" aria-hidden="true"></i>${esc(L('La elegida', 'The chosen one'))}</span>` : '',
    top !== null && top !== pickIdx ? `<span class="vx-map-key"><i class="vx-key-mt5" aria-hidden="true">✕</i>${esc(L('La n.º 1 de MT5', 'MT5’s #1'))}</span>` : '',
  ].join('');
  return `<div class="vx-map">
    <div class="vx-map-chart">${plateauHeatmap(a, pair[0], pair[1], { marks, thin: 5 })}</div>
    <div class="vx-map-text">
      <span class="vx-label">${esc(L('El terreno de tu optimización', 'The terrain of your optimization'))}</span>
      ${reading ? `<p class="vx-map-reading">${esc(reading)}</p>` : ''}
      ${legend ? `<div class="vx-map-legend">${legend}</div>` : ''}
      <p class="vx-fine">${esc(L('Cada casilla es la calidad mediana de todas las configuraciones con esos dos valores, en los dos parámetros que más influyen. Cuanto más intensa, mejor. Una zona intensa y continua es una meseta; una casilla sola, un pico. Las casillas con menos de 5 pasadas salen atenuadas.',
    'Each cell is the median quality of every configuration with those two values, on the two most influential parameters. The stronger, the better. A strong continuous zone is a plateau; a lone cell, a peak. Cells with fewer than 5 passes are dimmed.'))}</p>
    </div>
  </div>`;
}

/**
 * «Qué hacer ahora»: pasos numerados en el caso habitual (hay meseta y forward, falta el
 * periodo no visto). En el resto, el texto del motor o del periodo no visto, que ya está
 * escrito para cada situación.
 */
/**
 * Cuántos parámetros lleva DE VERDAD el .set (js/export.js#buildSetFile): con el .set de la
 * optimización cargado lleva también los no optimizados, y el paso 1 no puede decir otra
 * cifra que la nota de la tarjeta.
 */
function setCounts(a, best) {
  const names = a.meta.paramNames;
  const merged = mergeSetValues(names, names.map((_, j) => String(best.record.params[j])), state.searchSet);
  return { total: merged.entries.length, optimized: merged.optimized, complete: merged.complete };
}
const setCountEs = (a, best) => {
  const c = setCounts(a, best);
  return c.complete ? `los ${c.total} parámetros del EA (${c.optimized} optimizados)` : `los ${c.optimized} parámetros que optimizaste`;
};
const setCountEn = (a, best) => {
  const c = setCounts(a, best);
  return c.complete ? `all ${c.total} EA parameters (${c.optimized} optimized)` : `the ${c.optimized} parameters you optimized`;
};

function nextSteps(a, best, hold) {
  const hasF = a.meta.hasForward;
  const step = (n, title, body, extra = '') => `<li class="vx-step">
    <span class="vx-step-n" aria-hidden="true">${n}</span>
    <div><strong>${title}</strong><p>${body}</p>${extra}</div>
  </li>`;
  let steps;
  if (best && hold.done && hold.against) {
    // El periodo no visto va en contra: opciones, no un «revisa antes de dar ningún paso más».
    steps = againstOptions().map(([title, body], i) => step(i + 1, esc(title), esc(body),
      i === 1 ? `<button class="text-btn vx-step-cta" data-goto="unseen">${L('Ir al periodo no visto &rarr;', 'Go to unseen period &rarr;')}</button>` : ''));
  } else if (best && forwardUntested(a, best)) {
    // Hay forward, pero MT5 no llevó ahí ninguna configuración de esta meseta: está tan
    // sin validar como sin archivo forward, y su .set de despliegue no se ofrece.
    steps = [
      step(1, esc(L('Ninguna configuración de esta meseta llegó al forward', 'No configuration in this plateau reached the forward')),
        esc(L('MT5 no pasó ninguna al forward (cuando no las pasa todas, pasa solo las mejores del periodo optimizado), así que de momento solo se ha medido en el periodo optimizado.',
          'MT5 sent none of them to the forward (when it does not send them all, it sends only the best of the optimized period), so for now it has only been measured on the optimized period.'))),
      step(2, esc(L('Vuelve a optimizar este rango con forward', 'Re-optimize this range with a forward')),
        esc(L('Descarga el rango para reoptimizar y lánzalo en MT5 con Forward activado.', 'Download the range to re-optimize and run it in MT5 with Forward enabled.'))),
      step(3, esc(L('Suéltalo aquí', 'Drop it here')),
        esc(L('Con forward en la meseta, se podrá medir si aguanta fuera del periodo optimizado.', 'With a forward on the plateau, it can be measured whether it holds beyond the optimized period.'))),
    ];
  } else if (best && hasF && !hold.done) {
    steps = [
      step(1, esc(L('Descarga el .set', 'Download the .set')),
        esc(L(`Lleva ${setCountEs(a, best)} de la pasada ${best.record.id}. En el probador de MT5, pestaña de parámetros de entrada («Inputs»): clic derecho sobre la tabla → «Cargar» («Load») y elige el archivo.`,
          `It carries ${setCountEn(a, best)} of pass ${best.record.id}. In the MT5 tester's “Inputs” tab, right-click the table → “Load” and choose the file.`))),
      step(2, esc(L('Pruébala en un periodo que no hayas usado', 'Test it on a period you have not used')),
        esc(L('Ni para optimizar ni para validar: por ejemplo, los meses posteriores a tu forward. Decide antes qué resultado darás por bueno.',
          'Neither for optimizing nor for validating: for example, the months after your forward. Decide beforehand what result you will accept.'))),
      step(3, esc(L('Compruébalo aquí', 'Check it here')),
        esc(L('Suelta el informe de ese backtest y Orometra te dirá si el resultado es normal para esta configuración.',
          'Drop that backtest report and Orometra will tell you whether the result is normal for this configuration.')),
        `<button class="text-btn vx-step-cta" data-goto="unseen">${L('Ir al periodo no visto &rarr;', 'Go to unseen period &rarr;')}</button>`),
    ];
  } else if (best && !hasF) {
    steps = [
      step(1, esc(L('Vuelve a optimizar con forward', 'Re-optimize with a forward')),
        esc(L('En el probador de MT5 activa Forward (por ejemplo, 1/3). Puedes acotar la búsqueda con el rango para reoptimizar.',
          'In the MT5 tester enable Forward (for example, 1/3). You can narrow the search with the range to re-optimize.'))),
      step(2, esc(L('Exporta las dos pestañas', 'Export both tabs')),
        esc(L('La de resultados y la de forward, cada una a XML.', 'The results tab and the forward tab, each to XML.'))),
      step(3, esc(L('Suéltalas aquí', 'Drop them here')),
        esc(L('Con el periodo de validación, la evidencia puede pasar de débil.', 'With the validation period, the evidence can go beyond weak.'))),
    ];
  } else if (!best) {
    // Sin zona estable el motor solo dice «refina la optimización»: aquí, cómo.
    const insufficient = a.verdict.level === 'insufficient';
    steps = [
      step(1, esc(L('Mira qué falla', 'See what fails')),
        esc(L('El diagnóstico muestra qué mínimos dejan fuera a la mayoría de configuraciones.', 'Diagnostics shows which minimums rule out most configurations.')),
        `<button class="text-btn vx-step-cta" data-goto="diagnostics">${L('Ir al diagnóstico &rarr;', 'Go to diagnostics &rarr;')}</button>`),
      step(2, esc(L('Ajusta la optimización', 'Adjust the optimization')),
        esc(insufficient
          ? L('Amplía el rango de los parámetros o añade valores intermedios; si tus mínimos son muy exigentes, relájalos.', 'Widen the parameter ranges or add intermediate values; if your minimums are very demanding, relax them.')
          : L('Amplía el rango o afina el paso de los parámetros: una meseta necesita configuraciones vecinas que también funcionen.', 'Widen the range or refine the parameter step: a plateau needs neighboring configurations that also work.'))),
      step(3, esc(L('Vuelve a analizar', 'Analyze again')),
        esc(L('Exporta de nuevo los resultados y suéltalos aquí.', 'Export the results again and drop them here.'))),
    ];
  }
  const body = steps
    ? `<ol class="vx-steps">${steps.join('')}</ol>`
    : `<p class="vx-next-text">${esc(nextStepText(a, hold))}</p>`;
  // Si antes se comparó otro backtest del periodo no visto, se dice aquí: el nivel solo
  // refleja el último (js/ui-history.js#unseenTriesNote).
  const tries = api.unseenTriesNote ? api.unseenTriesNote() : '';
  return `<div class="vx-next">
    <h3 class="vx-label">${esc(L('Qué hacer ahora', 'What to do now'))}</h3>
    ${tries ? `<div class="inline-warn vx-tries">${esc(tries)}</div>` : ''}
    ${body}
  </div>`;
}

/**
 * Al cruzar el ancho de móvil (girar la pantalla, redimensionar), vuelve a dibujar solo los
 * dos gráficos SVG del veredicto con el formato que toca, sin repintar la pestaña: así el
 * desplegable donde están no se cierra.
 */
export function refreshCompactCharts(a) {
  document.querySelectorAll('[data-chart="scatter"]').forEach((el) => { el.innerHTML = scatterIsOos(a); });
  document.querySelectorAll('[data-chart="degradation"]').forEach((el) => { el.innerHTML = degradationChart(a); });
}

/** La tarjeta principal: qué configuración usar, su fiabilidad y qué hacer ahora. */
/**
 * «Qué esperar»: el beneficio por operación de la recomendada descontada la selección
 * (core/shrink.js), junto a la cifra cruda del forward con la que se suele planificar.
 */
export function expectationHtml(a, best) {
  const s = a.stats && a.stats.shrinkage;
  if (!best || !s || !s.usable) return '';
  const pr = (s.predictions || []).find((p) => p.index === best.representative);
  if (!pr || !Number.isFinite(pr.expected)) return '';
  const raw = Number.isFinite(pr.observedOos)
    ? L(`, no los ${num(pr.observedOos, 2)} del forward`, `, not the ${num(pr.observedOos, 2)} of the forward`)
    : '';
  return `<p class="vx-expect"><span class="vx-label">${gloss('expectation', esc(L('Qué esperar', 'What to expect')))}</span>
    ${L('Unos', 'About')} <b>${num(pr.expected, 2)}</b> ${esc(L('por operación', 'per trade'))}${esc(raw)}.
    ${esc(pr.ownLo > 0
    ? L('Se distingue de una configuración cualquiera de las que cumplen tus mínimos.', 'It stands out from any configuration that meets your minimums.')
    : L('No se distingue de una configuración cualquiera de las que cumplen tus mínimos.', 'It does not stand out from any configuration that meets your minimums.'))}</p>`;
}

/** «Búscala en MT5 por sus cifras», en una línea. La letra pequeña va con las de los botones. */
function findShort(rec, hasF) {
  const figures = mt5Figures(rec);
  if (!figures) return '';
  const where = hasF
    ? L('En los resultados de la optimización de MT5 (no en los del forward) se busca por', 'In MT5’s optimization results (not the forward ones), look for')
    : L('En los resultados de la optimización de MT5 se busca por', 'In MT5’s optimization results, look for');
  return `<p class="vx-find">${where} ${figures}.</p>`;
}

/** Lo que hay que saber para encontrarla en MT5, sin ocupar el sitio de la respuesta. */
function findFine(rec) {
  const n = rec.twins || 0;
  const twins = n === 1
    ? L(' Hay otra configuración con esas mismas cifras: para cargar exactamente esta, usa sus parámetros.', ' Another configuration has the same figures: to load exactly this one, use its parameters.')
    : n > 1
      ? L(` Hay ${n} configuraciones más con esas mismas cifras: para cargar exactamente esta, usa sus parámetros.`, ` ${n} more configurations have the same figures: to load exactly this one, use its parameters.`)
      : '';
  return L('El número de pasada es el de tu archivo exportado: MT5 no lo guarda al cerrarse y puede enseñar otro.', 'The pass number is the one in your exported file: MT5 does not keep it after closing and may show a different one.') + twins;
}

/**
 * Sin meseta, la respuesta es «no»: la pantalla lo dice con su propia forma. Primero qué
 * significa, luego lo que más pesa en contra y, aparte y rotulada, la sugerencia orientativa.
 */
function renderNoAnswer(a, dv) {
  const meaning = dv.level === 'insufficient'
    ? a.verdict.summary
    : L('Lo que destaca en tu tabla de MT5 se puede explicar por la suerte. No dice que tu EA sea malo: dice que esta optimización no lo demuestra. Y te ahorra probar con dinero algo que no se sostiene.',
      'What stands out in your MT5 table can be explained by luck. It does not say your EA is bad: it says this optimization does not show it. And it saves you from testing with money something that does not hold up.');
  // Lo que pesa en el nivel primero (críticos, luego avisos sobre la meseta, luego los del orden
  // de la tabla). El contraste del Sharpe se queda en «Por qué este nivel»: aquí va lo que se
  // entiende sin saber estadística.
  const weight = (f) => (f.severity === 'critical' ? 0 : f.scope === 'table' ? 2 : 1);
  const causes = (a.verdict.findings || [])
    .filter((f) => (f.severity === 'critical' || f.severity === 'warn') && !/Sharpe/.test(f.title))
    .map((f, i) => ({ f, i })).sort((x, y) => weight(x.f) - weight(y.f) || x.i - y.i).map((x) => x.f)
    .slice(0, 3);
  const causesHtml = causes.length
    ? `<span class="vx-label">${esc(L('Lo que más pesa', 'What weighs most'))}</span>
      <ul class="vx-causes">${causes.map((f) => `<li>${esc(f.title)}</li>`).join('')}</ul>
      <p class="vx-fine">${esc(L('Cada una, explicada en «Por qué este nivel», más abajo.', 'Each one is explained under “Why this level”, below.'))}</p>`
    : '';
  return `<span class="vx-label">${esc(L('Qué significa', 'What it means'))}</span>
    <p class="vx-meaning">${esc(meaning)}</p>
    ${causesHtml}`;
}

function renderFallbackBox(a) {
  if (!a.fallback) return '';
  return `<div class="vx-quiet">
    <strong>${esc(L('Si aun así quieres seguir explorando', 'If you still want to keep exploring'))}</strong>
    <p><b class="mono">${L('Pasada', 'Pass')} ${esc(a.fallback.record.id)}</b>. ${fallbackNote(a)}</p>
    ${findShort(a.fallback.record, a.meta.hasForward)}
  </div>`;
}

function renderDecision(a, dv, best, hold) {
  const c = verdictCopy(dv.level);
  const hasF = a.meta.hasForward;
  let pick;
  if (best) {
    // Sin forward en la meseta (no hay archivo, o MT5 no pasó ahí ninguna de sus
    // configuraciones) no hay .set de despliegue (ver doExport): se ofrece el rango de
    // refinamiento, que sí tiene sentido.
    const deploy = deployableSet(a, best);
    const actions = `<div class="vx-actions">
      ${deploy
    ? `<button class="primary-btn" data-export="set" data-plateau-index="${best.rank - 1}">${L('Descargar .set', 'Download .set')}</button>`
    : `<button class="primary-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('Descargar rango para reoptimizar', 'Download range to re-optimize')}</button>`}
      <button class="ghost-btn" data-copy="${best.rank - 1}">${L('Copiar parámetros', 'Copy parameters')}</button>
    </div>`;
    const fine = [findFine(best.record), deploy ? setCoverageNote(a, best, state.searchSet) : ''].filter(Boolean).join(' ');
    pick = `<span class="vx-label">${esc(L('Lleva esto', 'Take this'))}</span>
      <div class="vx-pass">${L('Pasada', 'Pass')} <b>${esc(best.record.id)}</b></div>
      <div class="t3-param-chips vx-params" role="group" aria-label="${esc(L('Valores recomendados', 'Recommended values'))}">
        ${a.meta.paramNames.map((n, j) => `<span>${esc(n)} <b>${paramHtml(best.record.params[j])}</b></span>`).join('')}
      </div>
      ${findShort(best.record, hasF)}
      <p class="vx-pass-note">${esc(deploy
    ? L(`Elegida dentro de una meseta de ${int(best.size)} configuraciones parecidas, por su buen puesto en el periodo optimizado y en el forward (promediado con sus vecinas).`,
      `Chosen within a plateau of ${int(best.size)} similar configurations, for ranking well on both the optimized period and the forward (averaged with its neighbors).`)
    : L(`Elegida dentro de una meseta de ${int(best.size)} configuraciones parecidas, por su buen puesto en el periodo optimizado (promediado con sus vecinas).`,
      `Chosen within a plateau of ${int(best.size)} similar configurations, for ranking well on the optimized period (averaged with its neighbors).`))}</p>
      ${expectationHtml(a, best)}
      ${actions}
      <p class="vx-fine">${esc(fine)}</p>`;
  } else {
    pick = renderNoAnswer(a, dv);
  }
  return `<section class="vx ${c.cls}${best ? '' : ' vx-no'}" aria-label="${esc(L('Veredicto', 'Verdict'))}">
    <h2 class="sr-only">${esc(answerLine(a))}</h2>
    <div class="vx-main">
      <div class="vx-pick">${pick}</div>
      <div class="vx-trust">
        <span class="vx-label">${esc(L('Fiabilidad', 'Reliability'))}</span>
        ${evidenceMeter(dv.level)}
        <p class="vx-trust-line">${esc(trustLine(a, dv.level))}</p>
        ${keyFacts(a, best)}
      </div>
    </div>
    ${terrainMap(a, best)}
    ${best ? '' : renderFallbackBox(a)}
    ${nextSteps(a, best, hold)}
  </section>`;
}

export function renderVerdict(a) {
  const v = a.verdict;
  const dv = displayVerdictCopy(a);
  const best = a.plateaus[0];
  const hold = holdoutFact(a);
  // Dos ejemplos sintéticos (js/demo.js): uno con una meseta real y otro sin ninguna ventaja.
  // Cada uno enlaza con el otro.
  const noEdgeDemo = Boolean(state.demoTruth && state.demoTruth.kind === 'noedge');
  const demoNote = !state.isDemo ? ''
    : noEdgeDemo
      ? `<div class="demo-note">${L(
        'Estos datos son <strong>sintéticos</strong> y aquí <strong>no hay ninguna ventaja real</strong>: cada operación es puro ruido, y lo que destaca en la tabla de MT5 es suerte del periodo optimizado. Así se ve el informe cuando no hay nada que respaldar.',
        'These data are <strong>synthetic</strong> and there is <strong>no real edge</strong> here: every trade is pure noise, and what stands out in the MT5 table is luck in the optimized period. This is what the report looks like when there is nothing to back.',
      )} <button class="text-btn" type="button" data-demo="good">${L('Ver el ejemplo con una meseta real →', 'See the example with a real plateau →')}</button></div>`
      : `<div class="demo-note">${L(
        `Estos datos son <strong>sintéticos</strong>, generados por la aplicación para que puedas ver el flujo completo. La meseta real está plantada en: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
        `These data are <strong>synthetic</strong>, generated by the app so you can see the full flow. The real plateau is planted at: ${esc(Object.entries(state.demoTruth.center).map(([k, val]) => `${k}=${val}`).join(', '))}.`,
      )} <button class="text-btn" type="button" data-demo="noedge">${L('¿Y cuando no hay nada? Ver un ejemplo sin ventaja real →', 'And when there is nothing? See an example with no real edge →')}</button></div>`;

  const src = state.source;
  const stamp = src
    // Los nombres de archivo ya estan justo encima, en la ficha plegada de carga.
    ? `<div class="run-stamp">
        <span>${esc(configsLabel(a))}</span>
        <span class="run-sep">·</span>
        <span>${esc(L('analizado', 'analyzed'))} ${esc(src.at.toLocaleString(localeTag(), { dateStyle: 'short', timeStyle: 'short' }))}</span>
        <span class="run-sep">·</span>
        <span title="${esc(L('Mínimos exigidos en este análisis: factor de beneficio, drawdown máximo y operaciones', 'Minimums required in this analysis: profit factor, maximum drawdown and trades'))}">${esc(L('Mínimos', 'Minimums'))}: PF ≥ ${num(a.meta.policy.gates.minProfitFactor, 2)} · ${esc(L('drawdown', 'drawdown'))} ≤ ${num(a.meta.policy.gates.maxDrawdownPct, 0)}${pctSign()} · ${int(a.meta.minTradesIs)} ${esc(L('operaciones', 'trades'))}${a.meta.hasForward ? ` (${int(a.meta.minTradesOos)} ${esc(L('en el forward', 'on the forward'))})` : ''}</span>
        <span class="run-sep">·</span>
        <span class="run-holdout" title="${esc(hold.note)}">${esc(hold.short)}</span>
      </div>`
    : '';

  // "Por qué" abre con los primeros 4 pros y 4 contras. Del resto de hallazgos: los que
  // ya tienen una tabla propia en Diagnostico/Parametros (Sharpe, cobertura, estabilidad
  // interna...) se muestran alli, junto al numero que narran, no aqui otra vez; los que
  // no tienen tabla en ningun sitio quedan en "Más hallazgos". "plateau" no se muestra en
  // ningun sitio aparte: el aviso de la tarjeta de la meseta ya lo explica con mas
  // contexto (que parametro exacto, en que configuracion).
  const highlights = whyGradeHighlights(a);
  const shown = new Set([...highlights.pros, ...highlights.cons]);
  const restFindings = v.findings.filter((f) => !shown.has(f) && !categorizeFinding(f));

  // Debajo de la tarjeta principal, en este orden: el porqué (en lenguaje llano), las
  // alternativas si las hay y, plegado, el detalle técnico para quien lo quiera.
  const details = [
    detailPanel(L('Qué demuestran estos datos', 'What these data demonstrate'),
      L('Meseta, cobertura, vecinas, validación, bordes y periodo no visto, cifra a cifra.', 'Plateau, coverage, neighbors, validation, edges and unseen period, figure by figure.'),
      renderEvidenceSheet(a, best)),
    best ? detailPanel(L('Dónde volver a optimizar', 'Where to re-optimize'),
      L('El rango de cada parámetro dentro de la meseta y el sugerido para afinar.', 'Each parameter\'s range inside the plateau and the one suggested to refine.'),
      renderStableRanges(a, best)) : '',
    restFindings.length ? detailPanel(L('Más hallazgos del motor', 'More engine findings'),
      L(`${restFindings.length} ${restFindings.length === 1 ? 'observación' : 'observaciones'} más del análisis.`, `${restFindings.length} more ${restFindings.length === 1 ? 'observation' : 'observations'} from the analysis.`),
      `<ul class="findings">
        ${restFindings.map((f) => `<li class="finding f-${f.severity === 'critical' ? 'block' : f.severity}">
          <div class="finding-mark" aria-hidden="true"></div>
          <div><strong>${esc(f.title)}</strong><p>${rich(f.detail)}</p></div>
        </li>`).join('')}
      </ul>`) : '',
    a.meta.hasForward ? detailPanel(L('Gráficos: optimización frente a validación', 'Charts: optimization vs validation'),
      L('Cuánto se degrada cada configuración y qué les pasa a tus mejores.', 'How much each configuration degrades and what happens to your best ones.'),
      `<div class="grid-secondary chart-pair">
        <div>
          <h3>${L('Calidad en la optimización frente a la validación', 'Quality in optimization vs validation')}</h3>
          <div data-chart="scatter">${scatterIsOos(a)}</div>
          <p class="chart-note">${L(
            'Cada punto es una configuración. La diagonal marca &laquo;no se degrada&raquo;. Los puntos por debajo pierden calidad fuera de la muestra. Cuanto más intenso el tono, mejor: las que forman meseta van en el más intenso.',
            'Each point is a configuration. The diagonal marks &ldquo;no degradation&rdquo;. Points below lose quality out of sample. The stronger the shade, the better: those that form a plateau get the strongest.',
          )}</p>
        </div>
        <div>
          <h3>${L('Qué les pasa a tus mejores', 'What happens to your best ones')}</h3>
          <div data-chart="degradation">${degradationChart(a)}</div>
          <p class="chart-note">${L(
            'Las configuraciones, en diez grupos según su puesto en la optimización (D10 = tu 10\u00A0% mejor). Si D10 no destaca en la validación, el orden de MT5 no predice nada.',
            'Configurations in ten groups by their optimization rank (D10 = your best 10%). If D10 does not stand out on validation, the MT5 order predicts nothing.',
          )}</p>
        </div>
      </div>`) : '',
  ].filter(Boolean).join('');

  // El título de la página ya dice el nivel: la tarjeta va primero y los datos del
  // análisis (pasadas, fecha, mínimos), que son contexto, justo debajo.
  // Sin meseta, el titular y la tarjeta del «no» ya lo dicen: el aviso «Sin meseta estable»
  // de encima repetía lo mismo. Los demás avisos (nada cumple tus mínimos, pocos datos) siguen.
  const banner = !best && outcomeFromAnalysis(a).code === CODE.NO_PLATEAU ? '' : renderOutcomeBanner(a);
  return `${banner}
  ${renderDecision(a, dv, best, hold)}
  ${stamp}
  ${demoNote}
  ${api.renderHistoryCompare ? api.renderHistoryCompare(a) : ''}
  ${renderWhyGrade(a, highlights, dv.summary)}
  ${renderTop3(a)}
  ${details ? `<h2 class="vx-section-title">${L('Detalle técnico', 'Technical detail')}</h2>${details}` : ''}`;
}

/** Bloque plegable del detalle técnico: cerrado por defecto, con una línea de qué hay dentro. */
function detailPanel(title, hint, body) {
  return `<details class="panel vx-detail">
    <summary class="panel-head compact"><div><h2>${title}</h2><p class="vx-detail-hint">${hint}</p></div></summary>
    <div class="panel-body">${body}</div>
  </details>`;
}

export function samplingLabel(sampling) {
  return {
    grid: L('probaste todas las configuraciones', 'you tested every configuration'),
    partial: L('probaste una parte de las configuraciones', 'you tested part of the configurations'),
    sparse: L('probaste una muestra (optimización genética)', 'you tested a sample (genetic optimization)'),
  }[sampling] || sampling;
}

export function renderOutcomeBanner(a) {
  const outcome = outcomeFromAnalysis(a);
  if (outcome.code === CODE.ANALYSIS_SUCCESS) return '';
  const copy = errorCopy(outcome.code, L);
  const cls = {
    [CODE.NO_QUALIFYING_CONFIGS]: 'outcome-no-qualifying',
    [CODE.INSUFFICIENT_DATA]: 'outcome-insufficient',
    [CODE.NO_PLATEAU]: 'outcome-no-plateau',
  }[outcome.code] || 'outcome-other';
  return `<section class="outcome-banner ${cls}" role="status">
    <strong>${esc(copy.title)}</strong>
    <p>${esc(copy.hint)}</p>
  </section>`;
}

export function renderEvidenceSheet(a, best) {
  const hasF = a.meta.hasForward;
  const cov = a.meta.coverage;
  const sc = a.meta.searchCoverage;
  let covTxt = Number.isFinite(cov)
    ? `${shareText(cov)} · ${samplingLabel(a.meta.sampling)}`
    : '—';
  if (sc && sc.usable && Number.isFinite(sc.coverageSearch)) {
    covTxt += ` · .set ${shareText(sc.coverageSearch)}`;
  }

  const covNote = sc && sc.usable && Number.isFinite(sc.coverageSearch)
    ? L(
      'Primero: fracción de la malla de niveles vistos en el archivo. Segundo (.set): fracción del espacio que pediste en MT5. Un genético puede subir el primero y dejar el segundo muy bajo.',
      'First: fraction of the seen-level grid in the file. Second (.set): fraction of the space you asked MT5 for. A genetic search can inflate the first while leaving the second very low.',
    )
    : L(
      'Fracción del espacio de niveles vistos en tus archivos — no del rango del .set. Suelta el .set de la optimización para contrastarlo.',
      'Fraction of the seen-level space in your files — not the .set range. Drop the optimization .set to check it against the range you asked for.',
    );
  const nb = best && best.neighborhood;
  let neighborsVal = '—';
  let neighborsNote = L('Sin meseta seleccionada', 'No plateau selected');
  if (nb) {
    neighborsVal = `${int(nb.passing)} / ${int(nb.observed)}`;
    const bits = [
      a.meta.hasForward && a.meta.selectionMode !== 'joint'
        ? L(`${int(nb.passing)} cumplen tus mínimos en el periodo optimizado`, `${int(nb.passing)} clear your minimums on the optimized period`)
        : L(`${int(nb.passing)} pasan mínimos`, `${int(nb.passing)} pass minimums`),
      L(`${int(nb.failing)} fallan`, `${int(nb.failing)} fail`),
    ];
    if (nb.slotsComplete && Number.isFinite(nb.gaps)) {
      bits.push(L(`${int(nb.gaps)} huecos no observados (de ${int(nb.slots)})`, `${int(nb.gaps)} unobserved gaps (of ${int(nb.slots)})`));
    } else {
      bits.push(L('huecos no estimables en este muestreo', 'gaps not estimable for this sampling'));
    }
    neighborsNote = bits.join(' · ');
  }

  const retentionVal = best && Number.isFinite(best.medianRetention)
    ? pct(best.medianRetention, 0)
    : (best && hasF && Number.isFinite(best.record.retention) ? pct(best.record.retention, 0) : '—');
  const retentionNote = hasF
    ? L('Mediana de la meseta: calidad en el forward ÷ calidad en el periodo optimizado', 'Plateau median: forward quality ÷ optimized-period quality')
    : L('Sin archivo forward', 'No forward file');

  const boundaryVal = best
    ? (best.boundary.length
      ? L(`Sí · ${best.boundary.map((b) => b.name).join(', ')}`, `Yes · ${best.boundary.map((b) => b.name).join(', ')}`)
      : L('No', 'No'))
    : '—';
  const boundaryNote = L(
    'Si toca el borde, la meseta podría continuar fuera del rango que optimizaste.',
    'If it touches the edge, the plateau may continue outside the range you optimized.',
  );

  const hold = holdoutFact(a);
  const holdoutVal = hold.value;
  const holdoutNote = hold.note;

  const plateauVal = best
    ? L(`Encontrada · ${int(best.size)} configuraciones parecidas`, `Found · ${int(best.size)} similar configurations`)
    : L('No encontrada', 'Not found');

  const rows = [
    [L('Meseta', 'Plateau'), plateauVal, L('Configuraciones vecinas que también funcionan, no un pico aislado.', 'Neighboring configurations that also work, not an isolated peak.')],
    [L('Cobertura de la optimización', 'Optimization coverage'), covTxt, covNote],
    [L('Vecinas que cumplen (de las observadas)', 'Neighbors that pass (of those observed)'), neighborsVal, neighborsNote],
    [L('Se mantiene al validar', 'Holds on validation'), retentionVal, retentionNote],
    [L('Toca el borde del rango', 'Touches the range edge'), boundaryVal, boundaryNote],
    [L('Periodo no visto', 'Unseen period'), holdoutVal, holdoutNote],
  ];

  return `<div class="panel-evidence-sheet" aria-label="${esc(L('Hoja de evidencia', 'Evidence sheet'))}">
    <div class="evidence-sheet">
      ${rows.map(([label, value, note]) => `<div class="evidence-sheet-row" title="${esc(note)}">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <em>${esc(note)}</em>
      </div>`).join('')}
    </div>
    <p class="chart-note">${a.meta.hasForward ? L(
      'El forward ya se usó para validar y ordenar las mesetas. Una meseta es estabilidad en tus datos, no una promesa de beneficio futuro.',
      'The forward was already used to validate and rank plateaus. A plateau is stability in your data, not a promise of future profit.',
    ) : L(
      'Sin forward, todo está medido sobre los datos con los que se optimizó. Una meseta es estabilidad en tus datos, no una promesa de beneficio futuro.',
      'Without a forward, everything is measured on the data used to optimize. A plateau is stability in your data, not a promise of future profit.',
    )}</p>
  </div>`;
}

/** Primeros 4 pros y 4 contras: lo que abre "Why this evidence grade". Se calcula
 * aparte para poder excluirlos de "Engine findings" y no repetir el mismo texto dos
 * veces en la misma pestana. */
export function whyGradeHighlights(a) {
  const findings = a.verdict.findings || [];
  // Solo lo que de verdad juega a favor: las notas informativas («la meseta se busca en el
  // periodo optimizado…») no son un punto a favor y se quedan en la lista de hallazgos.
  const pros = findings.filter((f) => f.severity === 'ok').slice(0, 4);
  // Primero lo que pesa en el nivel (críticos y avisos sobre la meseta) y después los
  // avisos sobre el orden de la tabla, que no lo bajan: con una «sólida» no puede parecer
  // que lo de arriba de «En contra» la contradice.
  const weight = (f) => (f.severity === 'critical' ? 0 : f.scope === 'table' ? 2 : 1);
  const cons = findings.filter((f) => f.severity === 'warn' || f.severity === 'critical')
    .map((f, i) => ({ f, i })).sort((x, y) => weight(x.f) - weight(y.f) || x.i - y.i).map((x) => x.f).slice(0, 4);
  return { pros, cons };
}

export function renderWhyGrade(a, highlights, summary = '') {
  const { pros, cons } = highlights;
  if (!pros.length && !cons.length && !summary) return '';
  const item = (f, mark) => `<li><span class="why-mark" aria-hidden="true">${mark}</span><div><strong>${esc(f.title)}</strong><span>${rich(f.detail)}</span></div></li>`;
  const col = (title, items, cls, mark) => `<div class="why-col ${cls}">
    <h3>${esc(title)}</h3>
    <ul>${items.map((f) => item(f, mark)).join('')}</ul>
  </div>`;
  // Sin puntos en contra (o a favor) no se reserva media pantalla vacía: una línea basta.
  const emptyLine = (title) => `<p class="why-none"><strong>${esc(title)}:</strong> ${L('nada destacado', 'nothing notable')}.</p>`;
  // Sin meseta, lo que sale bien no es «a favor» de nada que se pueda usar: se cuenta como
  // lo que sí hay, sin marcas de visto, para que un «no» no se lea como un «sí».
  const noPlateau = !a.plateaus.length;
  const proTitle = noPlateau ? L('Lo que sí hay', 'What there is') : L('A favor', 'In favor');
  const proCls = noPlateau ? 'why-pros why-neutral' : 'why-pros';
  const proMark = noPlateau ? '·' : '✓';
  const conTitle = L('En contra / límites', 'Against / limits');
  const grid = !pros.length && !cons.length
    ? ''
    : !cons.length
      ? `${col(proTitle, pros, proCls, proMark)}${emptyLine(conTitle)}`
      : !pros.length
        ? `${col(conTitle, cons, 'why-cons', '!')}${emptyLine(proTitle)}`
        : noPlateau
          ? `${col(conTitle, cons, 'why-cons', '!')}${col(proTitle, pros, proCls, proMark)}`
          : `${col(proTitle, pros, proCls, proMark)}${col(conTitle, cons, 'why-cons', '!')}`;
  return `<section class="panel panel-why">
    <div class="panel-head compact">
      <div>
        <h2>${L('Por qué este nivel', 'Why this level')}</h2>
      </div>
    </div>
    ${summary ? `<p class="why-summary">${esc(summary)}</p>` : ''}
    ${grid ? `<div class="why-grid${pros.length && cons.length ? '' : ' why-grid-one'}">${grid}</div>` : ''}
  </section>`;
}

export function renderStableRanges(a, best) {
  const sens = a.sensitivity || [];
  const rows = (best.refinement || []).filter((r) => !r.constant && !r.fixed && !r.categorical && r.levels > 1);
  const spanOf = (name) => {
    const j = a.meta.paramNames.indexOf(name);
    const sp = j >= 0 && best.paramSpan ? best.paramSpan[j] : null;
    if (!sp) return '—';
    return sp.min === sp.max ? paramHtml(sp.min) : `${paramHtml(sp.min)} – ${paramHtml(sp.max)}`;
  };
  if (!rows.length) return '';
  // Posicion RELATIVA, no "Alta/Media/Baja" absolutos: la medida combinada sale alta
  // tambien con ruido puro (en un dataset aleatorio daba 0,78-0,94 a todos), asi que un
  // umbral fijo ponia "Alta" a todos los parametros y no informaba de nada.
  const ranked = [...sens]
    .filter((x) => !x.constant && Number.isFinite(x.effective ?? x.sensitivity))
    .sort((x, y) => (y.effective ?? y.sensitivity) - (x.effective ?? x.sensitivity))
    .map((x) => x.name);
  const sensLabel = (name) => {
    const k = ranked.indexOf(name);
    if (k < 0) return '—';
    return L(`${k + 1}.º de ${ranked.length}`, `${k + 1} of ${ranked.length}`);
  };
  return `<div class="panel-ranges">
    <div class="vx-detail-actions">
      <button class="ghost-btn" data-export="refine" data-plateau-index="${best.rank - 1}">${L('Descargar .set de refinamiento', 'Download refinement .set')}</button>
    </div>
    <p class="chart-note">${L(
      'Centro = configuración recomendada. «Meseta» es lo que ocupan de verdad sus configuraciones; «Refinamiento», el rango sugerido para volver a optimizar alrededor del centro (el del .set de refinamiento). Ninguno de los dos es un intervalo de confianza.',
      'Center = recommended configuration. "Plateau" is what its configurations actually cover; "Refinement" is the suggested range to re-optimize around the center (the one in the refinement .set). Neither is a confidence interval.',
    )}</p>
    <div class="range-table-wrap">
      <table class="range-table">
        <thead>
          <tr>
            <th>${L('Parámetro', 'Parameter')}</th>
            <th>${L('Centro', 'Center')}</th>
            <th>${L('Meseta', 'Plateau')}</th>
            <th>${L('Refinamiento', 'Refinement')}</th>
            <th>${L('Influencia (puesto)', 'Influence (rank)')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.name)}</td>
            <td class="mono">${paramHtml(r.center)}</td>
            <td class="mono">${spanOf(r.name)}</td>
            <td class="mono">${paramHtml(r.start)} – ${paramHtml(r.stop)}</td>
            <td>${sensLabel(r.name)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/**
 * Las tres mejores configuraciones, una al lado de otra y con TODOS sus parametros.
 *
 * Se comparan en columnas a propósito: cuando tres mesetas independientes coinciden
 * en el valor de un parámetro, ese valor es una conclusión solida del analisis. Y
 * donde discrepan, es que ese parámetro no decide el resultado, así que puedes
 * elegirlo por criterios operativos y dejar de afinarlo.
 */
export function renderTop3(a) {
  // La recomendada ya está arriba, en la tarjeta principal, con su .set. Aquí solo se
  // muestran las alternativas (otras regiones estables independientes) y la comparación
  // de las tres, si las hay. Sin meseta, la tarjeta principal ya explica qué falta.
  const top = a.plateaus.slice(0, 3);
  if (top.length < 2) return '';
  const names = a.meta.paramNames;
  const agree = names.map((_, j) => {
    const vals = top.map((p) => p.record.params[j]);
    return vals.every((v) => v === vals[0]);
  });
  const agreeCount = agree.filter(Boolean).length;
  const WORD = {
    2: L('dos', 'two'),
    3: L('tres', 'three'),
  };
  const word = WORD[top.length] || String(top.length);
  const hasF = a.meta.hasForward;
  const alts = top.slice(1);
  const zone = (p) => L(`Meseta ${p.rank}`, `Plateau ${p.rank}`);

  const flagBadges = (p) => {
    const flags = [];
    if (p.invertedRisk && p.invertedRisk.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Usa un valor que gana en el periodo optimizado, pero no en el forward', 'It uses a value that wins on the optimized period, but not on the forward'))}">${L('valor que cambia', 'value that shifts')}</span>`);
    }
    if (p.boundary.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Pegada al borde del rango probado', 'Stuck to the edge of the tested range'))}">${L('borde', 'edge')}</span>`);
    }
    // La configuracion elegida puede fallar tus minimos en el forward: la meseta se
    // descubre en el in-sample. Que el chip diga "sin avisos" en ese caso era mentir.
    if (hasF && p.record.failsOos && p.record.failsOos.length) {
      flags.push(`<span class="badge warn" title="${esc(L('Esta configuración no cumple tus mínimos en el forward', 'This configuration does not meet your minimums on the forward'))}">${L('falla al validar', 'fails on validation')}</span>`);
    }
    // Sin ninguna configuración en el forward no hay nada «frágil»: no se pudo validar.
    if (forwardUntested(a, p)) {
      flags.push(`<span class="badge warn" title="${esc(L('MT5 no pasó al forward ninguna configuración de esta meseta: solo se ha medido en el periodo optimizado', 'MT5 sent no configuration of this plateau to the forward: it has only been measured on the optimized period'))}">${L('sin forward', 'no forward')}</span>`);
    } else if (p.oosValidation && p.oosValidation.passFrac < 0.5) {
      flags.push(`<span class="badge warn" title="${esc(L('Menos de la mitad de la meseta cumple tus mínimos en el forward', 'Less than half of the plateau meets your minimums on the forward'))}">${L('frágil al validar', 'fragile on validation')}</span>`);
    }
    return flags.join(' ') || `<span class="badge ok">${L('sin avisos', 'no warnings')}</span>`;
  };

  const altCards = `<div class="t3-alts">
    ${alts.map((p, i) => `<article class="t3-alt">
      <div class="t3-rank">${L(`Alternativa ${i + 1}`, `Alternative ${i + 1}`)} · ${zone(p)}</div>
      <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
      <div class="t3-score t3-score-sm">${num(p.robust, 0)}<small>${L('de 100 · robustez', 'of 100 · robustness')}</small></div>
      <div class="t3-flags">${flagBadges(p)}</div>
      <p class="t3-alt-meta">${int(p.size)} ${L('configuraciones', 'configurations')} · ${int(p.stability.support)} ${L('vecinas', 'neighbors')}${hasF && p.oosValidation && p.oosValidation.withForward ? ` · ${L(`el ${pct(p.oosValidation.passFrac, 0)} cumple en el forward`, `${pct(p.oosValidation.passFrac, 0)} pass on the forward`)}` : ''}</p>
      <div class="t3-alt-actions">
        ${deployableSet(a, p) ? `<button class="ghost-btn t3-btn-inline" data-export="set" data-plateau-index="${p.rank - 1}">${L('Descargar .set', 'Download .set')}</button>` : ''}
        <button class="text-btn t3-btn-inline" data-plateau="${p.rank - 1}">${L('Detalle →', 'Detail →')}</button>
      </div>
    </article>`).join('')}
  </div>`;

  const header = top.map((p, i) => `<th class="t3-col ${i === 0 ? 't3-best' : ''}">
      <div class="t3-rank">${i === 0 ? L('Recomendada', 'Recommended') : L(`Alternativa ${i}`, `Alternative ${i}`)}</div>
      <div class="t3-pass">${L('Pasada', 'Pass')} ${esc(p.record.id)}</div>
    </th>`).join('');

  const metricRow = (label, fn, cls = '') => `<tr class="${cls}">
    <th class="t3-label">${label}</th>
    ${top.map((p, i) => `<td class="t3-col ${i === 0 ? 't3-best' : ''}">${fn(p)}</td>`).join('')}
  </tr>`;

  const paramRows = names.map((n, j) => `<tr class="${agree[j] ? 't3-agree' : ''}">
    <th class="t3-label mono">${esc(n)}${agree[j] ? `<span class="t3-tick" title="${esc(L(`Coinciden las ${word}`, `The ${word} agree`))}">✓</span>` : ''}</th>
    ${top.map((p, i) => `<td class="t3-col t3-value ${i === 0 ? 't3-best' : ''}">${paramHtml(p.record.params[j])}</td>`).join('')}
  </tr>`).join('');

  return `<section class="panel t3-panel">
    <div class="panel-head">
      <div>
        <h2>${L('Otras mesetas', 'Other plateaus')}</h2>
      </div>
      <div class="t3-consensus">
        <strong>${L(`${agreeCount} de ${names.length}`, `${agreeCount} of ${names.length}`)}</strong>
        <span>${L(`parámetros en los que coinciden las ${word}`, `parameters where the ${word} agree`)}</span>
      </div>
    </div>
    <p class="panel-intro">${L(
      'Mesetas independientes de la recomendada: útiles si esa choca con algún criterio tuyo. Las filas con <span class="t3-tick">✓</span> son lo más sólido del análisis: las mesetas coinciden en ese valor.',
      'Plateaus independent of the recommended one: useful if it clashes with a criterion of yours. Rows with <span class="t3-tick">✓</span> are the most solid part of the analysis: the plateaus agree on that value.',
    )}</p>
    ${altCards}
    <div class="table-wrap t3-compare-wrap">
      <table class="t3-table">
        <thead><tr><th class="t3-label">${L('Comparación', 'Comparison')}</th>${header}</tr></thead>
        <tbody>
          ${metricRow(L('Meseta', 'Plateau'), (p) => `${zone(p)} · ${int(p.size)}`)}
          ${metricRow(gloss('quality', L('Calidad al optimizar', 'Quality when optimizing')), (p) => `${num(p.record.qualityIs, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityIs))}</em>`)}
          ${hasF ? metricRow(L('Cumplen tus mínimos en el forward', 'Clear your minimums on the forward'), (p) => forwardHoldHtml(p, a.meta.plateauForwardCritical)) : ''}
          ${hasF ? metricRow(L('Calidad al validar', 'Quality on validation'), (p) => `${num(p.record.qualityOos, 2)} <em class="t3-tag">${esc(qualityLabel(p.record.qualityOos))}</em>`) : ''}
          ${hasF ? metricRow(L('Al validar · PF / drawdown / operaciones', 'On validation · PF / drawdown / trades'), (p) => `${num(p.record.oos.profitFactor, 2)} / ${num(p.record.oos.drawdown, 1)}${pctSign()} / ${int(p.record.oos.trades)}`) : ''}
          ${metricRow(L('Beneficio al optimizar (como en MT5)', 'Profit when optimizing (as in MT5)'), (p) => `<span class="mono">${mt5Figure(p.record.is.profit)}</span>`)}
          ${metricRow(L('Al optimizar · PF / drawdown / operaciones', 'When optimizing · PF / drawdown / trades'), (p) => `${num(p.record.is.profitFactor, 2)} / ${num(p.record.is.drawdown, 1)}${pctSign()} / ${int(p.record.is.trades)}`)}
          <tr class="t3-params-head"><th class="t3-label" colspan="${top.length + 1}">${L('Parámetros de entrada', 'Input parameters')}</th></tr>
          ${paramRows}
        </tbody>
      </table>
    </div>
  </section>`;
}
