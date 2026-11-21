import { createNativeHost } from './native-host.ts';
import { nativeBrand } from './native-brand.ts';
import {
  NativePolicy,
  NativePolicyError,
  type NativeContract,
  type NativeMemberRule,
} from './native-policy.ts';
import type { GuestHost } from './protocol.ts';

type GeometryKind =
  | 'SVGPoint'
  | 'SVGRect'
  | 'SVGMatrix'
  | 'DOMPointReadOnly'
  | 'DOMPoint'
  | 'DOMRectReadOnly'
  | 'DOMRect'
  | 'DOMQuad'
  | 'DOMMatrixReadOnly'
  | 'DOMMatrix'
  | 'DOMRectList';
type ResultKind = 'data' | 'point' | 'rect' | 'quad' | 'matrix' | 'rectList';
interface Declaration {
  kind: GeometryKind;
  prototype: object;
  constructor: Function;
  parent: object | null;
  fields: ReadonlyMap<PropertyKey, PropertyDescriptor>;
  statics: ReadonlyMap<PropertyKey, PropertyDescriptor>;
  arrayValues: Function;
  brand(value: unknown): value is object;
}
export interface GuestGeometryOptions {
  global: Window | WorkerGlobalScope;
  /** Prepared application identity, not an application-supplied authority token. */
  isGuestValue(value: object): boolean;
  iterator(receiver: object): unknown;
}
export interface GuestGeometryPolicy extends GuestHost {
  /** Called only after a reviewed native producer has returned this value. */
  admitProduced(value: unknown, expected: ResultKind): void;
}
const produced = new WeakMap<object, Declaration>();
const publicDeclarations = new WeakMap<object, Declaration>();
const apply = Reflect.apply;
const construct = Reflect.construct;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const point = ['x', 'y', 'z', 'w'];
const rect = ['x', 'y', 'width', 'height'];
const matrix = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  ...[1, 2, 3, 4].flatMap((column) => [1, 2, 3, 4].map((row) => `m${column}${row}`)),
];
const matrixMethods = [
  'translate',
  'scale',
  'scaleNonUniform',
  'scale3d',
  'rotate',
  'rotateFromVector',
  'rotateAxisAngle',
  'skewX',
  'skewY',
  'multiply',
  'flipX',
  'flipY',
  'inverse',
];
const matrixSelf = [
  'multiplySelf',
  'preMultiplySelf',
  'translateSelf',
  'scaleSelf',
  'scale3dSelf',
  'rotateSelf',
  'rotateFromVectorSelf',
  'rotateAxisAngleSelf',
  'skewXSelf',
  'skewYSelf',
  'invertSelf',
  'setMatrixValue',
];
const catalog: readonly [
  GeometryKind,
  string,
  readonly string[],
  readonly [string, ResultKind][],
][] = [
  ['SVGPoint', 'x', ['x', 'y'], [['matrixTransform', 'point']]],
  ['SVGRect', 'x', ['x', 'y', 'width', 'height'], []],
  [
    'SVGMatrix',
    'a',
    ['a', 'b', 'c', 'd', 'e', 'f'],
    [
      'multiply',
      'inverse',
      'translate',
      'scale',
      'scaleNonUniform',
      'rotate',
      'rotateFromVector',
      'flipX',
      'flipY',
      'skewX',
      'skewY',
    ].map((key): [string, ResultKind] => [key, 'matrix']),
  ],
  [
    'DOMPointReadOnly',
    'x',
    point,
    [
      ['matrixTransform', 'point'],
      ['toJSON', 'data'],
    ],
  ],
  ['DOMPoint', 'x', point, []],
  [
    'DOMRectReadOnly',
    'x',
    [...rect, 'top', 'right', 'bottom', 'left'],
    [['toJSON', 'data']],
  ],
  ['DOMRect', 'x', rect, []],
  [
    'DOMQuad',
    'p1',
    ['p1', 'p2', 'p3', 'p4'],
    [
      ['getBounds', 'rect'],
      ['toJSON', 'data'],
    ],
  ],
  [
    'DOMMatrixReadOnly',
    'is2D',
    [...matrix, 'is2D', 'isIdentity'],
    [
      ...matrixMethods.map((key): [string, ResultKind] => [key, 'matrix']),
      ['transformPoint', 'point'],
      ['toFloat32Array', 'data'],
      ['toFloat64Array', 'data'],
      ['toString', 'data'],
      ['toJSON', 'data'],
    ],
  ],
  ['DOMMatrix', 'a', matrix, matrixSelf.map((key) => [key, 'matrix'])],
  ['DOMRectList', 'length', ['length'], [['item', 'rect']]],
];
const family = (kind: GeometryKind): ResultKind =>
  kind.endsWith('Point') || kind.startsWith('DOMPoint')
    ? 'point'
    : kind.endsWith('Rect') || kind.startsWith('DOMRect')
      ? kind === 'DOMRectList'
        ? 'rectList'
        : 'rect'
      : kind.endsWith('Matrix') || kind.startsWith('DOMMatrix')
        ? 'matrix'
        : 'quad';

const staticKeys = (kind: GeometryKind): readonly string[] =>
  kind.startsWith('DOMPoint')
    ? ['fromPoint']
    : kind.startsWith('DOMRect')
      ? ['fromRect']
      : kind === 'DOMQuad'
        ? ['fromRect', 'fromQuad']
        : kind.startsWith('DOMMatrix')
          ? ['fromMatrix', 'fromFloat32Array', 'fromFloat64Array']
          : [];
const snapshots = (owner: object, keys: readonly PropertyKey[]) =>
  new Map(
    keys.flatMap((key) => {
      const field = descriptor(owner, key);
      return field ? [[key, Object.freeze({ ...field })] as const] : [];
    }),
  );
function verify(
  owner: object,
  fields: ReadonlyMap<PropertyKey, PropertyDescriptor>,
): void {
  for (const [key, expected] of fields) {
    const current = descriptor(owner, key);
    if (
      !current ||
      ['value', 'get', 'set', 'writable', 'configurable', 'enumerable'].some(
        (part) => Reflect.get(current, part) !== Reflect.get(expected, part),
      )
    )
      throw new TypeError('Captured geometry declaration changed: ' + String(key));
  }
}

/** Produced instances retain only captured native declarations, never an engine
 * or application lifetime. Each receiving engine installs those exact contracts. */
export function createGuestGeometryPolicy(
  options: GuestGeometryOptions,
): GuestGeometryPolicy {
  const registry = new NativePolicy({ isGuestValue: options.isGuestValue });
  const installed = new Set<Declaration>();
  const admitted = new WeakSet<object>();
  const roots = new WeakSet<object>();
  const unrelated = new WeakSet<object>();
  const initial: Declaration[] = [];
  const nativeArray: unknown = Reflect.get(options.global, 'Array');
  const nativeValues: unknown = typeof nativeArray === 'function' ? descriptor(nativeArray.prototype, 'values')?.value : undefined;
  if (typeof nativeValues !== 'function') throw new TypeError('Native Array.values declaration unavailable');
  const legacy = new Map<string, object>();
  if ('document' in options.global) {
    const svg = options.global.document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    for (const [kind, value] of [
      ['SVGPoint', svg.createSVGPoint()],
      ['SVGRect', svg.createSVGRect()],
      ['SVGMatrix', svg.createSVGMatrix()],
    ] as const)
      legacy.set(kind, prototype(value));
  }
  for (const [kind, brandKey, attributes, methods] of catalog) {
    const legacyPrototype = legacy.get(kind);
    const constructor: unknown = legacyPrototype
      ? descriptor(legacyPrototype, 'constructor')?.value
      : Reflect.get(options.global, kind);
    if (typeof constructor !== 'function') continue;
    const owner: unknown = legacyPrototype ?? constructor.prototype;
    if (!object(owner)) continue;
    let declaration = publicDeclarations.get(owner);
    if (!declaration) {
      const getter = descriptor(owner, brandKey)?.get;
      if (!getter) throw new TypeError('Native geometry brand unavailable: ' + kind);
      declaration = {
        kind,
        prototype: owner,
        constructor,
        parent: prototype(owner),
        arrayValues: nativeValues,
        brand: nativeBrand<object>(getter),
        fields: snapshots(owner, [
          'constructor',
          Symbol.toStringTag,
          Symbol.iterator,
          ...attributes,
          ...methods.map(([key]) => key),
        ]),
        statics: snapshots(constructor, [
          'name',
          'length',
          'prototype',
          ...staticKeys(kind),
        ]),
      };
      publicDeclarations.set(owner, declaration);
      publicDeclarations.set(constructor, declaration);
    }
    initial.push(declaration);
  }
  const rule = (
    id: string,
    result: NativeContract['result'] = 'data',
  ): NativeContract => ({ id, result, effect: 'local-data', callbacks: 'none' });
  const readNative = ({
    receiver,
    descriptor: field,
  }: {
    receiver: object;
    descriptor: Readonly<PropertyDescriptor>;
  }): unknown => (field.get ? apply(field.get, receiver, []) : field.value);
  function admit(value: object): boolean {
    if (roots.has(value) || admitted.has(value)) return true;
    const definition = produced.get(value) ?? publicDeclarations.get(value);
    if (!definition) return false;
    install(definition);
    if (produced.has(value)) {
      registry.admitObject(value, definition.prototype);
      admitted.add(value);
    }
    return roots.has(value) || admitted.has(value);
  }
  function admitProduced(value: unknown, expected: ResultKind): void {
    if (expected === 'data') return;
    if (value === null && (expected === 'rect' || expected === 'matrix')) return;
    if (!object(value)) throw new TypeError('Geometry producer returned no reference');
    const known = produced.get(value);
    const declaration = known ?? publicDeclarations.get(prototype(value));
    if (
      !declaration ||
      family(declaration.kind) !== expected ||
      !declaration.brand(value)
    )
      throw new NativePolicyError(
        'return',
        'Geometry ' + expected,
        undefined,
        'unrecognized geometry producer result or realm',
      );
    produced.set(value, declaration);
    admit(value);
  }
  const host = createNativeHost({
    registry,
    name: 'Geometry',
    functionPrototype: Function.prototype,
    owns: (value) => roots.has(value) || admitted.has(value),
    admit,
    result: (value) => value,
    prototype(value) {
      const root = publicDeclarations.get(value);
      if (root) return value === root.prototype ? root.parent : Function.prototype;
      return registry.prototype(value);
    },
  });
  function validateArguments(args: readonly unknown[]): void {
    for (const value of args) {
      if (!object(value) || produced.has(value)) continue;
      for (const definition of initial)
        if (definition.brand(value))
          throw new TypeError('Native geometry argument has no producer owner');
    }
  }
  const data = (key: PropertyKey): NativeMemberRule => ({
    key,
    read: { contract: rule('Geometry.' + String(key)), read: readNative },
  });
  const methodResults = new WeakMap<Function, ResultKind>();
  const callNative = ({
    target,
    receiver,
    arguments: args,
  }: {
    target: Function;
    receiver: unknown;
    arguments: readonly unknown[];
  }) => {
    validateArguments(args);
    const value: unknown = apply(target, receiver, args);
    admitProduced(value, methodResults.get(target)!);
    return value;
  };
  function method(
    owner: object,
    key: string,
    result: ResultKind,
    ignored = false,
  ): NativeMemberRule | undefined {
    const target: unknown = descriptor(owner, key)?.value;
    if (typeof target !== 'function') return;
    const previous = methodResults.get(target);
    if (previous && previous !== result)
      throw new TypeError('Geometry alias has conflicting result contracts');
    methodResults.set(target, result);
    const id = 'Geometry.' + key;
    host.captureCallableShape(id, target);
    return {
      key,
      call: {
        contract: rule(id, result === 'data' ? 'data' : 'reference'),
        receiver: ignored ? 'ignored' : 'family',
        call: callNative,
      },
    };
  }
  function install(definition: Declaration): void {
    if (installed.has(definition)) return;
    const { kind, prototype: owner, constructor } = definition;
    verify(owner, definition.fields);
    verify(constructor, definition.statics);
    if (prototype(owner) !== definition.parent)
      throw new TypeError('Geometry prototype lineage changed');
    const parent = definition.parent && publicDeclarations.get(definition.parent);
    if (parent) install(parent);
    const row = catalog.find(([name]) => name === kind)!;
    const members: NativeMemberRule[] = [data('constructor')];
    if (definition.fields.has(Symbol.toStringTag)) members.push(data(Symbol.toStringTag));
    for (const key of row[2]) {
      const captured = definition.fields.get(key);
      if (!captured) continue;
      const id = 'Geometry.' + key;
      const result = kind === 'DOMQuad' ? 'point' : 'data';
      if (captured.get) host.captureCallableShape(id + '.get', captured.get);
      if (captured.set) host.captureCallableShape(id + '.set', captured.set);
      members.push({
        key,
        read: {
          contract: rule(id + '.get', result === 'data' ? 'data' : 'reference'),
          read(operation) {
            const value = readNative(operation);
            admitProduced(value, result);
            return value;
          },
        },
        ...(captured.set
          ? {
              write: {
                contract: rule(id + '.set', 'none'),
                write({
                  receiver,
                  descriptor: field,
                  value,
                }: {
                  receiver: object;
                  descriptor: Readonly<PropertyDescriptor>;
                  value: unknown;
                }) {
                  apply(field.set!, receiver, [value]);
                  return true;
                },
              },
            }
          : {}),
      });
    }
    for (const [key, result] of row[3]) {
      const member = method(owner, key, result);
      if (member) members.push(member);
    }
    if (kind === 'DOMRectList' && definition.fields.has(Symbol.iterator)) {
      if (definition.fields.get(Symbol.iterator)!.value !== definition.arrayValues)
        throw new TypeError('Unreviewed DOMRectList iterator');
      host.captureCallableShape(
        'Geometry.DOMRectList.iterator',
        definition.fields.get(Symbol.iterator)!.value,
      );
      members.push({
        key: Symbol.iterator,
        call: {
          contract: {
            ...rule('Geometry.DOMRectList.iterator', 'guest'),
            callbacks: 'guest',
          },
          call({ receiver }) {
            if (!object(receiver))
              throw new TypeError('Geometry iterator receiver required');
            return options.iterator(receiver);
          },
        },
      });
    }
    registry.registerPrototype(owner, {
      name: kind,
      accepts: (value) =>
        value === owner || (produced.has(value) && definition.brand(value)),
      members,
      ...(kind === 'DOMRectList'
        ? {
            named: [
              {
                contract: rule('Geometry.DOMRectList.index', 'reference'),
                matches: (key: PropertyKey) =>
                  typeof key === 'string' &&
                  /^(?:0|[1-9][0-9]*)$/.test(key) &&
                  Number(key) < 4294967295,
                read(receiver: object, key: PropertyKey) {
                  const value: unknown = apply(
                    definition.fields.get('item')!.value,
                    receiver,
                    [Number(key)],
                  );
                  admitProduced(value, 'rect');
                  return value;
                },
              },
            ],
          }
        : {}),
    });
    roots.add(owner);
    roots.add(constructor);
    installed.add(definition);
    const token = registry.registerConstructor(constructor, {
      contract: rule(kind + '.constructor', 'reference'),
      construct(target, args) {
        validateArguments(args);
        if (kind === 'DOMRectList' || kind.startsWith('SVG'))
          throw new TypeError('Illegal constructor');
        const value = construct(target, args);
        admitProduced(value, family(kind));
        return value;
      },
    });
    host.registerConstructor(constructor, token);
    const staticMembers: NativeMemberRule[] = [
      data('name'),
      data('length'),
      data('prototype'),
    ];
    for (const key of staticKeys(kind)) {
      const member = method(constructor, key, family(kind), true);
      if (member) staticMembers.push(member);
    }
    registry.registerFacade(constructor, {
      name: kind + ' constructor',
      members: staticMembers,
    });
  }
  for (const definition of initial) install(definition);
  return {
    ...host,
    admitProduced,
    owns(value) {
      if (host.owns!(value) || produced.has(value) || publicDeclarations.has(value))
        return true;
      if (unrelated.has(value)) return false;
      for (const definition of initial) if (definition.brand(value)) return true;
      unrelated.add(value);
      return false;
    },
  };
}
