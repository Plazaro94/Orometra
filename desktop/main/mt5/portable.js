// Modo portátil de MT5 dedicado a Orometra (/portable).
//
// Copiar todo MetaTrader puede ocupar varios GB: no lo hacemos por defecto.
// El usuario puede apuntar a una instalación portátil ya existente.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function explainPortableCopy(locale = 'es') {
  if (locale === 'en') {
    return {
      title: 'Dedicated portable MT5 (recommended)',
      body: [
        'Orometra can launch MetaTrader with /portable so the tester does not touch the terminal where you trade.',
        'A full copy of MT5 can be several gigabytes. We do not copy the whole install automatically.',
        'Best options: (1) point Orometra to an existing portable folder, or (2) copy MT5 yourself into a folder under Documents\\Orometra\\MT5-Portable and select that terminal64.exe.',
        'If the chosen terminal is already open, close it first (or use the portable copy).',
      ].join('\n\n'),
    };
  }
  return {
    title: 'Terminal portátil dedicado (recomendado)',
    body: [
      'Orometra puede arrancar MetaTrader con /portable para que el probador no interfiera con el terminal donde operas.',
      'Una copia completa de MT5 puede ocupar varios gigabytes. No copiamos toda la instalación automáticamente.',
      'Opciones: (1) indica una carpeta portátil que ya tengas, o (2) copia tú MT5 a Documentos\\Orometra\\MT5-Portable y elige ese terminal64.exe.',
      'Si el terminal elegido está abierto, ciérralo antes (o usa la copia portátil).',
    ].join('\n\n'),
  };
}

/** Ruta sugerida para una instalación portátil de Orometra. */
export function suggestPortablePath(env = process.env) {
  const docs = env['USERPROFILE']
    ? path.join(env['USERPROFILE'], 'Documents')
    : path.join(os.homedir(), 'Documents');
  return path.join(docs, 'Orometra', 'MT5-Portable');
}

/**
 * Comprueba de forma superficial si un directorio parece MT5 (terminal64.exe presente).
 * No copia nada.
 */
export function shallowCheckMt5Dir(dir, existsSync = fs.existsSync) {
  if (!dir) return { ok: false, reason: 'Sin ruta' };
  const exe = path.join(dir, 'terminal64.exe');
  if (!existsSync(exe)) {
    return { ok: false, reason: 'No se encuentra terminal64.exe en esa carpeta', terminalPath: null };
  }
  return {
    ok: true,
    reason: 'Parece una instalación MT5',
    terminalPath: exe,
    metaEditor: existsSync(path.join(dir, 'metaeditor64.exe'))
      ? path.join(dir, 'metaeditor64.exe')
      : null,
  };
}

/**
 * Pista para copiar (no ejecuta la copia masiva).
 * Si `sourceDir` y `destDir` se pasan, solo valida y describe el comando / pasos.
 */
export function copyPortableHint({ sourceDir = null, destDir = null, locale = 'es' } = {}) {
  const dest = destDir || suggestPortablePath();
  const check = sourceDir ? shallowCheckMt5Dir(sourceDir) : { ok: false, reason: 'Sin origen' };
  const stepsEs = [
    `Crea la carpeta destino: ${dest}`,
    sourceDir
      ? `Copia el contenido de «${sourceDir}» a esa carpeta (explorador o robocopy). Puede tardar y ocupar varios GB.`
      : 'Copia tu instalación de MT5 (carpeta que contiene terminal64.exe) a esa ruta.',
    'En Orometra, elige ese terminal64.exe y marca «portable».',
    'No hace falta que Orometra copie los archivos por ti; solo apunta a la carpeta portátil.',
  ];
  const stepsEn = [
    `Create destination folder: ${dest}`,
    sourceDir
      ? `Copy contents of “${sourceDir}” there (Explorer or robocopy). It can take time and several GB.`
      : 'Copy your MT5 install (folder with terminal64.exe) to that path.',
    'In Orometra, select that terminal64.exe and enable “portable”.',
    'Orometra does not need to copy files for you; just point to the portable folder.',
  ];
  return {
    dest,
    sourceOk: check.ok,
    sourceCheck: check,
    steps: locale === 'en' ? stepsEn : stepsEs,
    message: locale === 'en'
      ? 'Full MT5 copy is optional and large — use an existing portable path when possible.'
      : 'La copia completa de MT5 es opcional y pesada: preferible apuntar a un portátil ya existente.',
  };
}
