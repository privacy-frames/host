import {
  strings,
  internalArray,
  internalMap,
  internalSet,
  internalRecord,
  internalData,
} from '../../shared/primordials.ts';
import { parse } from 'acorn';
import { relocateImportMeta } from '../../shared/module-source.ts';
import { children, node, type SyntaxNode } from '../../shared/module-source.ts';
interface WorkletModuleOptions {
  baseURL: string;
  logicalURL: string;
  importsURL: string;
  aliases: readonly (readonly [string, string])[];
}
interface Edit {
  start: number;
  end: number;
  replacement?: string;
  argument?: SyntaxNode;
  options?: SyntaxNode;
}
/** Relocate guest imports; host preparation is an independent entry dependency. */
export function prepareWorkletModule(
  code: string,
  options: WorkletModuleOptions,
): string {
  const source = relocateImportMeta(code, options.logicalURL);
  let program: unknown;
  try {
    program = internalData(
      parse(source, internalRecord({ ecmaVersion: 'latest', sourceType: 'module' })),
    );
  } catch {
    throw new Error('Worklet module syntax is not supported');
  }
  const root = node(program);
  if (!root) throw new Error('Missing worklet module syntax');
  const aliases = internalMap(options.aliases);
  const edits = internalArray<Edit>();
  const identifiers = internalSet<string>();
  function mapped(input: string): string {
    const url = new URL(input, options.baseURL);
    const hash = url.hash;
    url.hash = '';
    const target = aliases.get(url.href);
    if (!target) throw new Error('Worklet dependency is not installed');
    return target + hash;
  }
  function visit(value: SyntaxNode) {
    if (value.type === 'Identifier' && typeof value.name === 'string')
      identifiers.add(value.name);
    if (
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
        value.type,
      )
    ) {
      const literal = node(value.source);
      if (literal) {
        if (typeof literal.value !== 'string') throw new Error('Invalid worklet import');
        edits.push(
          internalRecord({
            start: literal.start,
            end: literal.end,
            replacement: JSON.stringify(mapped(literal.value)),
          }),
        );
      }
    }
    if (value.type === 'ImportExpression') {
      const argument = node(value.source);
      if (!argument) throw new Error('Invalid dynamic worklet import');
      edits.push(
        internalRecord({
          start: value.start,
          end: value.end,
          argument,
          options: node(value.options),
        }),
      );
    }
    for (const child of children(value)) visit(child);
  }
  visit(root);
  let suffix = 0;
  while (identifiers.has('__privacyWorkletImport' + suffix)) suffix++;
  const binding = '__privacyWorkletImport' + suffix;
  function render(start: number, end: number): string {
    const contained = edits
      .filter((edit) => edit.start >= start && edit.end <= end)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    let text = '',
      cursor = start;
    for (const edit of contained) {
      if (edit.start < cursor) continue;
      text += strings.slice(source, cursor, edit.start);
      text +=
        edit.replacement ??
        binding +
          '(' +
          render(edit.argument!.start, edit.argument!.end) +
          (edit.options ? ', ' + render(edit.options.start, edit.options.end) : '') +
          ')';
      cursor = edit.end;
    }
    return text + strings.slice(source, cursor, end);
  }
  const prepared = render(0, source.length);
  const prefix =
    'import { rejectDynamicImport as ' +
    binding +
    ' } from ' +
    JSON.stringify(options.importsURL) +
    ';\n';
  if (strings.startsWith(prepared, '#!')) {
    const newline = strings.indexOf(prepared, '\n');
    return newline < 0
      ? prepared + '\n' + prefix
      : strings.slice(prepared, 0, newline + 1) +
          prefix +
          strings.slice(prepared, newline + 1);
  }
  return prefix + prepared;
}
