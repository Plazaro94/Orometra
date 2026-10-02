// Teclado de los grupos role="radiogroup" (idioma y tema), según el patrón de ARIA: el
// grupo es una sola parada de Tab (la opción marcada) y las flechas cambian la opción.
// Sin esto, el lector de pantalla anunciaba un grupo de radios que no respondía a las
// flechas.

const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function sync(group) {
  const items = [...group.querySelectorAll('[role="radio"]')];
  const checked = items.find((b) => b.getAttribute('aria-checked') === 'true') || items[0];
  items.forEach((b) => b.setAttribute('tabindex', b === checked ? '0' : '-1'));
}

export function enhanceRadioGroups(root = document) {
  root.querySelectorAll('[role="radiogroup"]').forEach((group) => {
    if (group.dataset.radioReady) return;
    group.dataset.radioReady = '1';
    sync(group);
    // La opción marcada cambia también al hacer clic: se sigue con el atributo.
    new MutationObserver(() => sync(group)).observe(group, { attributes: true, subtree: true, attributeFilter: ['aria-checked'] });
    group.addEventListener('keydown', (e) => {
      const items = [...group.querySelectorAll('[role="radio"]')];
      const at = items.indexOf(document.activeElement);
      if (at < 0) return;
      let next;
      if (e.key in KEYS) next = (at + KEYS[e.key] + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else return;
      e.preventDefault();
      items[next].focus();
      items[next].click();
    });
  });
}
