import { strings, internalRecord, internalArray, internalSet } from './primordials.ts';
import { parse } from 'acorn';
import { hasModuleReferences } from './module-references.ts';

const isArray = Array.isArray;
const objectValues = Object.values;
const stringify = JSON.stringify;
const NativeError = Error;
const ownKeys = Reflect.ownKeys;
const getPrototype = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const descriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;

function ownValue(object: object, key: PropertyKey): unknown {
  const property = descriptor(object, key);
  return property && hasOwn(property, 'value') ? property.value : undefined;
}

/** Parser nodes contain publisher syntax; detach their optional-field lookups. */
function protectSyntaxTree(value: unknown): void {
  const seen = internalSet<object>();
  const visit = (current: unknown): void => {
    if (current === null || typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    if (isArray(current)) internalArray(current);
    else {
      const syntaxNode =
        typeof ownValue(current, 'type') === 'string' &&
        typeof ownValue(current, 'start') === 'number' &&
        typeof ownValue(current, 'end') === 'number';
      if (!syntaxNode && getPrototype(current) !== objectPrototype) return;
      internalRecord(current);
    }
    for (const key of ownKeys(current)) {
      const property = descriptor(current, key);
      if (property && hasOwn(property, 'value')) visit(property.value);
    }
  };
  visit(value);
}

export interface SyntaxNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function node(value: unknown): SyntaxNode | undefined {
  const candidate = record(value);
  return candidate &&
    typeof candidate.type === 'string' &&
    typeof candidate.start === 'number' &&
    typeof candidate.end === 'number'
    ? (candidate as SyntaxNode)
    : undefined;
}
export function nodes(value: unknown): SyntaxNode[] {
  return isArray(value) ? value.flatMap((value) => node(value) ?? []) : [];
}
export function children(parent: SyntaxNode): SyntaxNode[] {
  return objectValues(parent).flatMap((value) =>
    isArray(value) ? nodes(value) : (node(value) ?? []),
  );
}
export function name(value: unknown): string | undefined {
  const identifier = node(value);
  return identifier?.type === 'Identifier' && typeof identifier.name === 'string'
    ? identifier.name
    : undefined;
}
export function memberName(member: SyntaxNode): string | undefined {
  if (member.type !== 'MemberExpression') return;
  if (!member.computed) return name(member.property);
  const property = node(member.property);
  return property?.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}
export function parseProgram(code: string, parser: typeof parse = parse): SyntaxNode {
  let parsed: unknown;
  try {
    parsed = parser(
      code,
      internalRecord({ ecmaVersion: 'latest', sourceType: 'module' }),
    );
  } catch {
    parsed = parser(
      code,
      internalRecord({ ecmaVersion: 'latest', sourceType: 'script' }),
    );
  }
  protectSyntaxTree(parsed);
  const program = node(parsed);
  if (!program) throw new NativeError('JavaScript parser returned an invalid program');
  return program;
}
function importMeta(value: unknown): boolean {
  const expression = node(value);
  return (
    expression?.type === 'MetaProperty' &&
    name(expression.meta) === 'import' &&
    name(expression.property) === 'meta'
  );
}
function importMetaURL(value: unknown): boolean {
  const expression = node(value);
  return (
    !!expression && memberName(expression) === 'url' && importMeta(expression.object)
  );
}
export function mutableModuleMetadata(program: SyntaxNode): boolean {
  let mutable = false;
  const visit = (current: SyntaxNode, parent?: SyntaxNode): void => {
    if (
      importMeta(current) &&
      !(parent?.type === 'MemberExpression' && parent.object === current)
    )
      mutable = true;
    if (
      current.type === 'MemberExpression' &&
      importMeta(current.object) &&
      (memberName(current) === 'url' || memberName(current) === undefined) &&
      parent &&
      ((parent.type === 'AssignmentExpression' && parent.left === current) ||
        parent.type === 'UpdateExpression' ||
        (parent.type === 'UnaryExpression' && parent.operator === 'delete'))
    )
      mutable = true;
    for (const child of children(current)) visit(child, current);
  };
  visit(program);
  return mutable;
}

/** Keep asset URL construction tied to the publisher module after resource relocation. */
export function relocateImportMeta(code: string, moduleURL: string): string {
  if (!hasModuleReferences(code)) return code;
  let program: SyntaxNode;
  try {
    program = parseProgram(code);
  } catch {
    return code;
  }
  if (mutableModuleMetadata(program)) return code;
  const replacements: SyntaxNode[] = [];
  const visit = (current: SyntaxNode): void => {
    if (importMetaURL(current)) replacements.push(current);
    else for (const child of children(current)) visit(child);
  };
  visit(program);
  for (const replacement of replacements.sort((left, right) => right.start - left.start))
    code =
      strings.slice(code, 0, replacement.start) +
      '(' +
      stringify(moduleURL) +
      ')' +
      strings.slice(code, replacement.end);
  return code;
}
