import type { GuestGeometryPolicy } from './geometry-policy.ts';

export interface GeometryProducerOptions {
  global: Window | WorkerGlobalScope;
  application: string;
  generation: string;
  geometry: GuestGeometryPolicy;
  active(): boolean;
  isDOMReceiver(value: object): boolean;
  recognizesCallable(value: unknown): value is Function;
}
type GeometryResult = 'point' | 'rect' | 'quad' | 'matrix' | 'rectList';
type Produced =
  GeometryResult | { role: string; nullable?: boolean } | { sequence: GeometryResult };
interface Producer {
  accepts(value: object): boolean;
  result: Produced;
}
interface PreparedProducer { application: string; generation: string; rules: readonly Producer[]; enroll(value: unknown, result: Produced): void; }
const preparedGetters = new WeakMap<Function, PreparedProducer>();
const preparedMethods = new WeakMap<Function, PreparedProducer>();
const apply = Reflect.apply;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/** Selective producer enrollment does not make Element/Canvas/Observer objects
 * geometry-owned. Unselected members remain the surrounding host's obligation. */
export function createGeometryProducers(options: GeometryProducerOptions) {
  const opaque = new WeakMap<object, string>();
  const getters = new Map<Function, Producer[]>();
  const methods = new Map<Function, Producer[]>();
  const observerConstructors = new Map<Function, string>();
  const getPrototype = (name: string): object | undefined => {
    const target: unknown = Reflect.get(options.global, name);
    return typeof target === 'function' ? target.prototype : undefined;
  };
  const node = (value: object) => options.active() && options.isDOMReceiver(value);
  const role = (name: string) => (value: object) =>
    options.active() && opaque.get(value) === name;
  function enroll(value: unknown, result: Produced): void {
    if (!options.active()) throw new TypeError('Geometry producer owner is closed');
    if (typeof result === 'string') {
      options.geometry.admitProduced(value, result);
      return;
    }
    if ('sequence' in result) {
      if (!Array.isArray(value)) throw new TypeError('Native geometry sequence required');
      for (const item of value) options.geometry.admitProduced(item, result.sequence);
    } else {
      if (value === null && result.nullable) return;
      if (!object(value))
        throw new TypeError('Native geometry producer reference required');
      opaque.set(value, result.role);
    }
  }
  function capture(
    name: string,
    key: PropertyKey,
    accepts: Producer['accepts'],
    result: Produced,
    getter = false,
  ): void {
    const owner = getPrototype(name);
    const field = owner && descriptor(owner, key);
    const target: unknown = getter ? field?.get : field?.value;
    if (typeof target !== 'function') return;
    const table = getter ? getters : methods;
    const rules = table.get(target) ?? [];
    rules.push({ accepts, result });
    table.set(target, rules);
  }
  const rangeGetter = getPrototype('Range');
  const commonAncestor =
    rangeGetter && descriptor(rangeGetter, 'commonAncestorContainer')?.get;
  const range = (value: object) => {
    if (!commonAncestor || !options.active()) return false;
    try {
      const node: unknown = apply(commonAncestor, value, []);
      return object(node) && options.isDOMReceiver(node);
    } catch {
      return false;
    }
  };
  for (const [name, accepts] of [
    ['Element', node],
    ['Range', range],
  ] as const) {
    capture(name, 'getBoundingClientRect', accepts, 'rect');
    capture(name, 'getClientRects', accepts, 'rectList');
  }
  for (const name of ['Element', 'Text', 'Document']) {
    capture(name, 'getBoxQuads', node, { sequence: 'quad' });
    for (const [key, result] of [
      ['convertQuadFromNode', 'quad'],
      ['convertRectFromNode', 'quad'],
      ['convertPointFromNode', 'point'],
    ] as const)
      capture(name, key, node, result);
  }
  for (const name of [
    'SVGGraphicsElement',
    'SVGGeometryElement',
    'SVGTextContentElement',
    'SVGSVGElement',
  ]) {
    for (const key of ['getBBox', 'getExtentOfChar', 'createSVGRect'])
      capture(name, key, node, 'rect');
    for (const key of ['getCTM', 'getScreenCTM', 'createSVGMatrix'])
      capture(name, key, node, 'matrix');
    for (const key of [
      'getPointAtLength',
      'getStartPositionOfChar',
      'getEndPositionOfChar',
      'createSVGPoint',
    ])
      capture(name, key, node, 'point');
  }
  capture('SVGSVGElement', 'currentTranslate', node, 'point', true);
  for (const name of [
    'SVGSVGElement',
    'SVGSymbolElement',
    'SVGMarkerElement',
    'SVGPatternElement',
    'SVGViewElement',
  ])
    capture(name, 'viewBox', node, { role: 'SVGAnimatedRect' }, true);
  for (const key of ['baseVal', 'animVal'])
    capture('SVGAnimatedRect', key, role('SVGAnimatedRect'), 'rect', true);
  capture(
    'SVGGraphicsElement',
    'transform',
    node,
    { role: 'SVGAnimatedTransformList' },
    true,
  );
  for (const key of ['baseVal', 'animVal'])
    capture(
      'SVGAnimatedTransformList',
      key,
      role('SVGAnimatedTransformList'),
      { role: 'SVGTransformList' },
      true,
    );
  for (const key of [
    'getItem',
    'initialize',
    'insertItemBefore',
    'replaceItem',
    'removeItem',
    'appendItem',
    'consolidate',
  ])
    capture('SVGTransformList', key, role('SVGTransformList'), {
      role: 'SVGTransform',
      nullable: key === 'consolidate',
    });
  capture('SVGSVGElement', 'createSVGTransform', node, { role: 'SVGTransform' });
  capture('SVGSVGElement', 'createSVGTransformFromMatrix', node, {
    role: 'SVGTransform',
  });
  capture('SVGTransform', 'matrix', role('SVGTransform'), 'matrix', true);
  for (const name of ['SVGPolylineElement', 'SVGPolygonElement'])
    for (const key of ['points', 'animatedPoints'])
      capture(name, key, node, { role: 'SVGPointList' }, true);
  for (const key of [
    'getItem',
    'initialize',
    'insertItemBefore',
    'replaceItem',
    'removeItem',
    'appendItem',
  ])
    capture('SVGPointList', key, role('SVGPointList'), 'point');
  const canvas = (name: string, value: object) => {
    const owner = getPrototype(name);
    const getter = owner && descriptor(owner, 'canvas')?.get;
    if (!getter || !options.active()) return false;
    try {
      const target: unknown = apply(getter, value, []);
      return (
        object(target) &&
        (options.isDOMReceiver(target) || opaque.get(target) === 'OffscreenCanvas')
      );
    } catch {
      return false;
    }
  };
  for (const name of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D'])
    capture(name, 'getTransform', (value) => canvas(name, value), 'matrix');
  capture('HTMLCanvasElement', 'transferControlToOffscreen', node, {
    role: 'OffscreenCanvas',
  });
  for (const [name, fields] of [
    ['ResizeObserverEntry', ['contentRect']],
    [
      'IntersectionObserverEntry',
      ['rootBounds', 'boundingClientRect', 'intersectionRect'],
    ],
  ] as const)
    for (const key of fields) capture(name, key, role(name), 'rect', true);
  for (const name of ['ResizeObserver', 'IntersectionObserver']) {
    const target: unknown = Reflect.get(options.global, name);
    if (typeof target === 'function') observerConstructors.set(target, name + 'Entry');
  }
  for (const [target, rules] of getters) preparedGetters.set(target, {application: options.application, generation: options.generation, rules, enroll});
  for (const [target, rules] of methods) preparedMethods.set(target, {application: options.application, generation: options.generation, rules, enroll});
  function select(target: Function, receiver: object, local: Map<Function, Producer[]>, shared: WeakMap<Function, PreparedProducer>) {
    const known = local.get(target)?.find((rule) => rule.accepts(receiver));
    if (known) return { rule: known, enroll };
    const prepared = shared.get(target);
    if (!prepared || prepared.application !== options.application || prepared.generation !== options.generation) return;
    const rule = prepared.rules.find((rule) => rule.accepts(receiver));
    return rule ? { rule, enroll: prepared.enroll } : undefined;
  }
  return {
    read(target: object, key: PropertyKey): { value: unknown } | undefined {
      const list = opaque.get(target);
      if ((list === 'SVGPointList' || list === 'SVGTransformList') && typeof key === 'string' && /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < 4294967295) {
        const owner = getPrototype(list)!;
        const count = descriptor(owner, 'numberOfItems')!.get!;
        if (Number(key) >= apply(count, target, [])) return { value: undefined };
        const field = descriptor(target, key);
        if (field && !('value' in field)) throw new TypeError('Unreviewed SVG indexed accessor');
        const value: unknown = apply(descriptor(owner, 'getItem')!.value, target, [Number(key)]);
        enroll(value, list === 'SVGPointList' ? 'point' : { role: 'SVGTransform' });
        return { value };
      }

      let field: PropertyDescriptor | undefined;
      for (let owner: object | null = target; owner; owner = prototype(owner)) {
        field = descriptor(owner, key);
        if (field) break;
      }
      if (!field?.get) return;
      const producer = select(field.get, target, getters, preparedGetters);
      if (!producer) return;
      const value: unknown = apply(field.get, target, []);
      producer.enroll(value, producer.rule.result);
      return { value };
    },
    call(target: Function, receiver: unknown): ((value: unknown) => void) | undefined {
      if (!object(receiver)) return;
      const producer = select(target, receiver, methods, preparedMethods);
      return producer ? (value) => producer.enroll(value, producer.rule.result) : undefined;
    },
    construct(target: Function, args: unknown[]): unknown[] {
      const kind = observerConstructors.get(target);
      const callback = args[0];
      if (!kind || typeof callback !== 'function') return args;
      const forwarded = [...args];
      forwarded[0] = function (this: unknown, ...delivered: unknown[]) {
        if (!options.active() || !options.recognizesCallable(callback)) return;
        if (!Array.isArray(delivered[0]))
          throw new TypeError('Native observer entry sequence required');
        for (const entry of delivered[0]) {
          if (!object(entry)) throw new TypeError('Native observer entry required');
          opaque.set(entry, kind);
        }
        return apply(callback, this, delivered);
      };
      return forwarded;
    },
    constructed(target: Function, value: object): void {
      if (target === Reflect.get(options.global, 'OffscreenCanvas'))
        opaque.set(value, 'OffscreenCanvas');
    },
  };
}
