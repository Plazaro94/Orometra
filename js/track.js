// Contador de uso anonimo (GoatCounter, sin cookies). Solo se envia el NOMBRE de un
// evento ("analisis-is-forward", "descarga-set"...): nunca nombres de archivo,
// parametros, cifras ni nada de lo que hay dentro de tus archivos. Sirve para saber si
// la herramienta se usa de verdad, no solo si se visita.
export function track(name) {
  try {
    const gc = typeof window !== 'undefined' ? window.goatcounter : null;
    if (gc && typeof gc.count === 'function') gc.count({ path: `evento/${name}`, title: name, event: true });
  } catch {
    // Medir nunca puede romper la aplicacion (bloqueadores, modo privado...).
  }
}
