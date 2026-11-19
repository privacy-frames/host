import { generate, ident, parse, walk, type CssNode } from 'css-tree';

export type GuestCSSContext = 'stylesheet' | 'declarationList' | 'value';

/** Parse before mapping so escaped syntax and quoted image candidates agree. */
export function rewriteGuestCSS(
  text: string,
  map: (url: string) => string,
  context?: GuestCSSContext,
): string {
  const mapped = (value: string) => {
    if (!value) return value;
    try {
      return map(value);
    } catch {
      return 'data:,';
    }
  };
  const contexts: readonly GuestCSSContext[] = context
    ? [context]
    : ['stylesheet', 'declarationList'];
  for (const context of contexts) {
    try {
      const ast = parse(text, {
        context,
        parseCustomProperty: true,
        // Conditions are validated by the browser and do not fetch resources.
        // Keep their grammar intact; @import is parsed explicitly below.
        parseAtrulePrelude: false,
        onParseError(error) {
          throw error;
        },
      });
      walk(ast, function (node) {
        if (
          node.type === 'Atrule' &&
          ident.decode(node.name).toLowerCase() === 'import'
        ) {
          node.name = 'import';
          let prelude: CssNode | null = node.prelude;
          if (prelude?.type === 'Raw') {
            prelude = parse(prelude.value, {
              context: 'atrulePrelude',
              atrule: 'import',
              onParseError(error) {
                throw error;
              },
            });
            if (prelude.type === 'AtrulePrelude') node.prelude = prelude;
          }
          if (prelude?.type === 'AtrulePrelude') {
            const first = prelude.children.first;
            let resource = false;
            if (first?.type === 'String' || first?.type === 'Url') {
              first.value = mapped(first.value);
              resource = true;
            } else if (
              first?.type === 'Function' &&
              ident.decode(first.name).toLowerCase() === 'url'
            ) {
              const argument = first.children.first;
              if (argument?.type === 'String' && first.children.size === 1) {
                argument.value = mapped(argument.value);
                resource = true;
              }
            }
            if (!resource) throw new SyntaxError('Invalid import resource');
          } else throw new SyntaxError('Invalid import prelude');
        }
        // URLs in namespace/supports preludes do not fetch resources.
        if (node.type === 'AtrulePrelude') return this.skip;
        if (!this.declaration && context !== 'value') return;
        if (node.type === 'Url') node.value = mapped(node.value);
        else if (node.type === 'Function') {
          const name = ident.decode(node.name).toLowerCase();
          if (name === 'url' && node.children.size === 1) {
            const argument = node.children.first;
            if (argument?.type === 'String') {
              node.name = 'url';
              argument.value = mapped(argument.value);
            }
          } else if (['image-set', '-webkit-image-set', 'image'].includes(name)) {
            for (const child of node.children)
              if (child.type === 'String') child.value = mapped(child.value);
          }
        }
      });
      return generate(ast);
    } catch {
      // Try the alternate entry grammar for an inline declaration list.
    }
  }
  // Unparsed CSS must not become a second, browser-only resource-loading grammar.
  return '';
}
