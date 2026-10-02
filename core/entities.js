// Entidades XML/HTML (&amp;, &#233;, &#xE9;…): un solo decodificador para los tres
// lectores (XML de MT5, .xlsx e informe del backtest). Había tres copias y una no
// comprobaba el rango: un código como &#99999999; hacía lanzar fromCodePoint y el
// archivo fallaba con un error interno en vez de leerse.

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** `named`: entidades con nombre que se aceptan (por defecto, las cinco de XML). */
export function decodeEntities(text, named = XML_ENTITIES) {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Fuera del rango Unicode o un sustituto suelto: se deja tal cual.
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    return named[code] !== undefined ? named[code] : m;
  });
}

export { XML_ENTITIES };
