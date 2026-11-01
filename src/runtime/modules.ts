import {
  internalArray,
  internalRecord,
  strings,
  ownDescriptor,
} from '../shared/primordials.ts';
import {
  children,
  node,
  nodes,
  parseProgram,
  record,
  type SyntaxNode,
} from '../shared/module-source.ts';
import { Parser } from 'acorn';
import importPhases from 'acorn-import-phases';
import { hasModuleReferences } from '../shared/module-references.ts';

interface ModuleResources {
  mapURL(input: unknown): string;
  isInstalledURL(input: unknown): boolean;
}

const NativeURL = URL;
const href = ownDescriptor(NativeURL.prototype, 'href')!.get!;
const apply = Reflect.apply;
const stringify = JSON.stringify;
const ModuleParser = Parser.extend(importPhases());
const parseModule = ModuleParser.parse.bind(ModuleParser);

function specifier(source: SyntaxNode): string | undefined {
  if (source.type === 'Literal' && typeof source.value === 'string') return source.value;
  if (source.type !== 'TemplateLiteral' || nodes(source.expressions).length) return;
  const quasis = nodes(source.quasis);
  const cooked = quasis.length === 1 ? record(quasis[0].value)?.cooked : undefined;
  return typeof cooked === 'string' ? cooked : undefined;
}

/** Relocate literal imports to admitted resources without evaluating publisher code. */
export function relocateRuntimeModule(
  code: string,
  base: string,
  resources: ModuleResources,
  localDynamicImports = false,
): string {
  if (!hasModuleReferences(code)) return code;
  try {
    const edits = internalArray<{ start: number; end: number; text: string }>();
    const visit = (current: SyntaxNode): void => {
      if (
        current.type === 'ImportDeclaration' ||
        current.type === 'ExportNamedDeclaration' ||
        current.type === 'ExportAllDeclaration' ||
        current.type === 'ImportExpression'
      ) {
        const source = node(current.source);
        const value = source && specifier(source);
        if (source && value)
          if (/^(?:\.\.?\/|\/|https?:\/\/)/.test(value)) {
            try {
              const original: string = apply(href, new NativeURL(value, base), []);
              const mapped = resources.mapURL(original);
              if (resources.isInstalledURL(mapped) && mapped !== value)
                edits.push(
                  internalRecord({
                    start: source.start,
                    end: source.end,
                    text: stringify(mapped),
                  }),
                );
            } catch {
              // A Blob-relative failure must not discard other valid imports.
            }
          }
        if (
          localDynamicImports &&
          current.type === 'ImportExpression' &&
          current.phase === undefined &&
          source
        ) {
          // A dynamically constructed accessor has global scope, so application
          // locals named self/globalThis/Function cannot shadow the adapter.
          const body = `return globalThis.privacyHost.importModule(value, options, ${stringify(base)})`;
          const accessor = `(()=>{}).constructor("value","options",${stringify(body)})`;
          edits.push(
            internalRecord({
              start: current.start,
              end: current.start + 6,
              text: accessor,
            }),
          );
        }
      }
      for (const child of children(current)) visit(child);
    };
    visit(parseProgram(code, parseModule));
    for (const item of edits.sort((left, right) => right.start - left.start)) {
      code =
        strings.slice(code, 0, item.start) + item.text + strings.slice(code, item.end);
    }
  } catch {
    // Invalid syntax and unresolved Blob-relative imports keep native behavior.
  }
  return code;
}
