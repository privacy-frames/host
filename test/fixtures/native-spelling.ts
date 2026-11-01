/** Runs in the installed application, through its application-visible DOM APIs. */
export function attemptSpellingChanges() {
  const field = document.querySelector('textarea');
  if (!field) throw new Error('Missing spelling field');
  const rows: Array<{ route: string; enabled: boolean; error?: string }> = [];
  function attempt(route: string, change: () => HTMLElement) {
    let element: HTMLElement = field!;
    let error: string | undefined;
    try {
      element = change();
    } catch (caught) {
      error = String(caught);
    }
    rows.push({ route, enabled: element.spellcheck, ...(error ? { error } : {}) });
  }
  attempt('initial-markup', () => field);
  attempt('IDL-property', () => {
    field.spellcheck = true;
    return field;
  });
  attempt('attribute', () => {
    field.setAttribute('spellcheck', 'true');
    return field;
  });
  attempt('attribute-namespace', () => {
    field.setAttributeNS(null, 'spellcheck', 'true');
    return field;
  });
  attempt('attribute-toggle', () => {
    field.toggleAttribute('spellcheck', false);
    return field;
  });
  for (const key of ['value', 'nodeValue', 'textContent'] as const)
    attempt('Attr.' + key, () => {
      const attribute = field.getAttributeNode('spellcheck');
      if (!attribute) throw new Error('Missing native spelling control');
      attribute[key] = 'true';
      return field;
    });
  for (const key of ['setAttributeNode', 'setAttributeNodeNS'] as const)
    attempt(key, () => {
      const attribute = document.createAttribute('spellcheck');
      attribute.value = 'true';
      field[key](attribute);
      return field;
    });
  for (const key of ['removeAttribute', 'removeAttributeNS', 'removeAttributeNode'])
    attempt(key, () => {
      if (key === 'removeAttribute') field.removeAttribute('spellcheck');
      else if (key === 'removeAttributeNS') field.removeAttributeNS(null, 'spellcheck');
      else {
        const attribute = field.getAttributeNode('spellcheck')!;
        if (field.removeAttributeNode(attribute) !== attribute || attribute.ownerElement)
          throw new Error('Attribute removal did not return the detached original');
      }
      return field;
    });
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  const markup = '<textarea spellcheck="true"></textarea>';
  attempt('innerHTML', () => {
    holder.innerHTML = markup;
    return holder.querySelector('textarea')!;
  });
  attempt('insertAdjacentHTML', () => {
    holder.insertAdjacentHTML('beforeend', markup);
    return holder.lastElementChild as HTMLTextAreaElement;
  });
  attempt('shadow-innerHTML', () => {
    const shadow = holder.attachShadow({ mode: 'open' });
    shadow.innerHTML = markup;
    return shadow.querySelector('textarea')!;
  });
  attempt('parsed-import', () => {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const imported = document.importNode(parsed.querySelector('textarea')!, true);
    document.body.appendChild(imported);
    return imported;
  });
  attempt('template-clone', () => {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const copy = template.content.cloneNode(true);
    holder.appendChild(copy);
    return holder.lastElementChild as HTMLTextAreaElement;
  });
  attempt('custom-element-callback', () => {
    let enabled: boolean | undefined;
    customElements.define(
      'spelling-fixture',
      class extends HTMLElement {
        connectedCallback() {
          enabled = this.spellcheck;
        }
      },
    );
    holder.insertAdjacentHTML('beforeend', '<spelling-fixture spellcheck="true"/>');
    if (enabled !== false) throw new Error('Custom element observed enabled spelling');
    return holder.lastElementChild as HTMLElement;
  });
  attempt('XML-data', () => {
    const xml = new DOMParser().parseFromString('<record/>', 'application/xml');
    const record = xml.documentElement;
    record.setAttribute('spellcheck', 'true');
    if (record.getAttribute('spellcheck') !== 'true')
      throw new Error('XML data attribute was changed');
    record.removeAttribute('spellcheck');
    if (record.hasAttribute('spellcheck')) throw new Error('XML data attribute retained');
    return field;
  });
  return rows;
}
