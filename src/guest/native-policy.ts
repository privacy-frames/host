export type NativeEffect =
  | 'local-data'
  | 'local-rendering'
  | 'local-resource'
  | 'guest-code'
  | 'context'
  | 'export'
  | 'management';

export interface NativePolicyOptions {
  /** Exact ownership check supplied by the engine, never a structural guess. */
  isGuestValue?(value: object): boolean;
}

export interface NativeContract {
  /** Aliases may share an ID only when they implement the same reviewed contract. */
  readonly id: string;
  readonly effect: NativeEffect;
  readonly result: 'data' | 'reference' | 'callable' | 'guest' | 'none';
  readonly callbacks: 'none' | 'guest' | 'prepared-context';
}

export interface NativeReadOperation {
  readonly receiver: object;
  readonly key: PropertyKey;
  readonly descriptor: Readonly<PropertyDescriptor>;
}
export interface NativeWriteOperation extends NativeReadOperation {
  readonly value: unknown;
}
export interface NativeCallOperation {
  readonly target: Function;
  readonly receiver: unknown;
  readonly arguments: readonly unknown[];
}
export interface NativeReadRule {
  readonly contract: NativeContract;
  read(operation: NativeReadOperation): unknown;
}
export interface NativeWriteRule {
  readonly contract: NativeContract;
  write(operation: NativeWriteOperation): boolean;
}
export interface NativeCallRule {
  readonly contract: NativeContract;
  /** Free functions ignore guest-provided this and receive undefined. */
  readonly receiver?: 'family' | 'ignored';
  call(operation: NativeCallOperation): unknown;
}
export interface NativeConstructRule {
  readonly contract: NativeContract;
  construct(target: Function, arguments_: readonly unknown[]): object;
}
export interface NativeConstructor {
  readonly kind: 'native-constructor';
  readonly contract: NativeContract;
}
export interface NativeMemberRule {
  readonly key: PropertyKey;
  readonly read?: NativeReadRule;
  readonly write?: NativeWriteRule;
  readonly call?: NativeCallRule;
}
export interface NativeNamedRule {
  readonly contract: NativeContract;
  /** Reviewed native indexed/named semantics, not an arbitrary property fallback. */
  matches(key: PropertyKey): boolean;
  read?(receiver: object, key: PropertyKey): unknown;
  write?(receiver: object, key: PropertyKey, value: unknown): boolean;
}
export interface NativeSchema {
  readonly name: string;
  readonly members: readonly NativeMemberRule[];
  readonly named?: readonly NativeNamedRule[];
  /** A reviewed brand guard. It must not probe unclassified native getters. */
  accepts?(receiver: object): boolean;
}

/** Tokens carry no native function reference. Only their creating registry can use them. */
export interface NativeCallable {
  readonly kind: 'native-callable';
  readonly contract: NativeContract;
}
export type NativeResult =
  | { readonly kind: 'value'; readonly value: unknown; readonly contract: NativeContract }
  | {
      readonly kind: 'callable';
      readonly callable: NativeCallable;
      readonly construct?: NativeConstructor;
    }
  | { readonly kind: 'constructor'; readonly construct: NativeConstructor };
export interface NativeDescriptor {
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly writable?: boolean;
  readonly value?: NativeResult;
  readonly get?: NativeCallable;
  readonly set?: NativeCallable;
}

export class NativePolicyError extends Error {
  constructor(
    readonly operation: string,
    readonly family: string,
    readonly key: PropertyKey | undefined,
    reason: string,
  ) {
    super(
      `Native ${operation} refused for ${family}${key === undefined ? '' : '.' + String(key)}: ${reason}`,
    );
    this.name = 'NativePolicyError';
  }
}

interface Member {
  readonly key: PropertyKey;
  readonly owner: object;
  readonly descriptor: Readonly<PropertyDescriptor>;
  readonly read?: NativeReadRule;
  readonly write?: NativeWriteRule;
  readonly callable?: NativeCallable;
  readonly getter?: NativeCallable;
  readonly setter?: NativeCallable;
}
interface Registration {
  readonly target: object;
  readonly name: string;
  readonly exact: boolean;
  readonly accepts?: (receiver: object) => boolean;
  readonly members: Map<PropertyKey, Member>;
  readonly named: readonly NativeNamedRule[];
}
interface CallBinding {
  readonly receiver?: 'family' | 'ignored';
  readonly call: (operation: NativeCallOperation) => unknown;
  readonly adapter: Function;
  readonly registration: Registration;
  readonly member: Member;
}
interface CallableRecord {
  readonly target: Function;
  readonly bindings: CallBinding[];
}
interface ConstructorRecord {
  readonly target: Function;
  readonly construct: NativeConstructRule['construct'];
  readonly prototype: PropertyDescriptor | undefined;
}
interface PendingCallable extends CallBinding {
  readonly target: Function;
  readonly contract: NativeContract;
  readonly field: 'callable' | 'getter' | 'setter';
}
interface Resolution {
  readonly registration: Registration;
  readonly member?: Member;
  readonly named?: NativeNamedRule;
  readonly descriptor: Readonly<PropertyDescriptor>;
}

const object = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function');
const snapshotContract = (contract: NativeContract): NativeContract =>
  Object.freeze({
    id: contract.id,
    effect: contract.effect,
    result: contract.result,
    callbacks: contract.callbacks,
  });
const sameContract = (left: NativeContract, right: NativeContract): boolean =>
  left.id === right.id &&
  left.effect === right.effect &&
  left.result === right.result &&
  left.callbacks === right.callbacks;

/** Registers reviewed native authority. Adapters and brand guards are trusted
 * production code with separate effect contracts; metadata does not authorize them. */
export class NativePolicy {
  private readonly isGuestValue?: (value: object) => boolean;
  private readonly prototypes = new Map<object, Registration>();
  private readonly facades = new WeakMap<object, Registration>();
  private readonly admitted = new WeakMap<object, readonly Registration[]>();
  private readonly callables = new WeakMap<NativeCallable, CallableRecord>();
  private readonly functions = new WeakMap<Function, NativeCallable>();
  private readonly constructors = new WeakMap<NativeConstructor, ConstructorRecord>();
  private readonly constructorFunctions = new WeakMap<Function, NativeConstructor>();

  constructor(options: NativePolicyOptions = {}) {
    this.isGuestValue = options.isGuestValue;
  }

  registerPrototype(prototype: object, schema: NativeSchema): void {
    if (this.prototypes.has(prototype) || this.facades.has(prototype))
      throw new NativePolicyError(
        'register',
        schema.name,
        undefined,
        'prototype already registered',
      );
    const registration = this.capture(prototype, schema, false);
    this.prototypes.set(prototype, registration);
    this.admitted.set(prototype, [registration, ...this.parentRegistrations(prototype)]);
  }

  registerFacade(target: object, schema: NativeSchema): void {
    if (this.facades.has(target) || this.prototypes.has(target))
      throw new NativePolicyError(
        'register',
        schema.name,
        undefined,
        'facade already registered',
      );
    const registration = this.capture(target, schema, true);
    this.facades.set(target, registration);
    this.admitted.set(target, [registration]);
  }

  registerConstructor(target: Function, rule: NativeConstructRule): NativeConstructor {
    const previous = this.constructorFunctions.get(target);
    if (previous) {
      if (
        !sameContract(previous.contract, rule.contract) ||
        this.constructors.get(previous)!.construct !== rule.construct
      )
        throw new NativePolicyError(
          'register',
          rule.contract.id,
          undefined,
          'constructor has a different canonical contract or adapter',
        );
      return previous;
    }
    const token: NativeConstructor = Object.freeze({
      kind: 'native-constructor',
      contract: snapshotContract(rule.contract),
    });
    this.constructors.set(token, {
      target,
      construct: rule.construct,
      prototype: Object.getOwnPropertyDescriptor(target, 'prototype'),
    });
    this.constructorFunctions.set(target, token);
    return token;
  }

  construct(
    constructor: NativeConstructor,
    arguments_: readonly unknown[],
  ): NativeResult {
    const record = this.constructors.get(constructor);
    if (!record)
      throw new NativePolicyError(
        'construct',
        'unknown constructor',
        undefined,
        'token belongs to no constructor in this registry',
      );
    const current = Object.getOwnPropertyDescriptor(record.target, 'prototype');
    if (!this.sameDescriptor(current, record.prototype, true))
      throw new NativePolicyError(
        'construct',
        constructor.contract.id,
        undefined,
        'captured constructor prototype changed',
      );
    return this.result(record.construct(record.target, arguments_), constructor.contract);
  }

  /** Called only for values supplied by a reviewed native producer. Structural
   * prototype matching alone does not establish that producer's authority. */
  admitObject(target: object): void {
    if (this.admitted.has(target)) return;
    const immediate = Object.getPrototypeOf(target);
    if (!immediate || !this.prototypes.has(immediate))
      throw new NativePolicyError(
        'admit',
        'unknown object',
        undefined,
        'unregistered immediate prototype',
      );
    const lineage = this.parentRegistrations(target);
    for (const registration of lineage)
      if (registration.accepts && !registration.accepts(target))
        this.refuse('admit', registration, undefined, 'receiver brand rejected');
    this.admitted.set(target, lineage);
  }

  private parentRegistrations(target: object): Registration[] {
    const lineage: Registration[] = [];
    const seen = new Set<object>();
    for (let current = Object.getPrototypeOf(target); current && !seen.has(current);) {
      seen.add(current);
      const registration = this.prototypes.get(current);
      if (!registration) break;
      lineage.push(registration);
      current = Object.getPrototypeOf(current);
    }
    return lineage;
  }

  read(target: object, key: PropertyKey): NativeResult {
    const resolution = this.resolve(target, key, 'get');
    if (resolution.named) {
      this.requireReceiver(resolution.registration, target, 'get', key);
      if (!resolution.named.read)
        this.refuse('get', resolution.registration, key, 'named read has no contract');
      return this.result(resolution.named.read(target, key), resolution.named.contract);
    }
    const member = resolution.member!;
    if (member.callable)
      return {
        kind: 'callable',
        callable: member.callable,
        construct: this.constructorFunctions.get(member.descriptor.value),
      };
    if (!member.read)
      this.refuse('get', resolution.registration, key, 'read has no contract');
    this.requireReceiver(resolution.registration, target, 'get', key);
    return this.result(
      member.read.read({ receiver: target, key, descriptor: resolution.descriptor }),
      member.read.contract,
    );
  }

  write(target: object, key: PropertyKey, value: unknown): boolean {
    const resolution = this.resolve(target, key, 'set');
    this.requireReceiver(resolution.registration, target, 'set', key);
    if (resolution.named) {
      if (!resolution.named.write)
        this.refuse('set', resolution.registration, key, 'named write has no contract');
      return resolution.named.write(target, key, value);
    }
    const member = resolution.member!;
    if (!member.write)
      this.refuse('set', resolution.registration, key, 'write has no contract');
    return member.write.write({
      receiver: target,
      key,
      value,
      descriptor: resolution.descriptor,
    });
  }

  call(
    callable: NativeCallable,
    receiver: unknown,
    arguments_: readonly unknown[],
  ): NativeResult {
    const record = this.callables.get(callable);
    if (!record)
      throw new NativePolicyError(
        'call',
        'unknown callable',
        undefined,
        'token belongs to no operation in this registry',
      );
    const lineage = object(receiver) ? this.admitted.get(receiver) : undefined;
    const binding = record.bindings.find(
      (item) => item.receiver === 'ignored' || lineage?.includes(item.registration),
    );
    if (!binding)
      throw new NativePolicyError(
        'call',
        callable.contract.id,
        undefined,
        'receiver belongs to another family or registry',
      );
    if (binding.receiver !== 'ignored')
      this.requireReceiver(binding.registration, receiver, 'call', binding.member.key);
    this.checkDescriptor(binding.registration, binding.member, 'call');
    return this.result(
      binding.call({
        target: record.target,
        receiver: binding.receiver === 'ignored' ? undefined : receiver,
        arguments: arguments_,
      }),
      callable.contract,
    );
  }

  descriptor(target: object, key: PropertyKey): NativeDescriptor | undefined {
    this.requireAdmission(target, 'descriptor');
    const own = Object.getOwnPropertyDescriptor(target, key);
    if (!own) return;
    const resolution = this.resolve(target, key, 'descriptor');
    const member = resolution.member;
    if (!member)
      return {
        configurable: Boolean(own.configurable),
        enumerable: Boolean(own.enumerable),
        writable: Boolean(resolution.named?.write),
        value: this.read(target, key),
      };
    if ('value' in own)
      return {
        configurable: Boolean(own.configurable),
        enumerable: Boolean(own.enumerable),
        writable: Boolean(own.writable && member.write),
        value: this.read(target, key),
      };
    return {
      configurable: Boolean(own.configurable),
      enumerable: Boolean(own.enumerable),
      get: member.getter,
      set: member.setter,
    };
  }

  keys(target: object): readonly PropertyKey[] {
    this.requireAdmission(target, 'keys');
    return Reflect.ownKeys(target).filter((key) => {
      try {
        this.resolve(target, key, 'keys');
        return true;
      } catch (error) {
        if (error instanceof NativePolicyError) return false;
        throw error;
      }
    });
  }

  prototype(target: object): object | null {
    this.requireAdmission(target, 'prototype');
    const prototype = Object.getPrototypeOf(target);
    return prototype && this.prototypes.has(prototype) ? prototype : null;
  }

  private capture(target: object, schema: NativeSchema, exact: boolean): Registration {
    const registration: Registration = {
      target,
      name: schema.name,
      exact,
      accepts: schema.accepts,
      members: new Map(),
      named: (schema.named ?? []).map((rule) =>
        Object.freeze({
          contract: snapshotContract(rule.contract),
          matches: rule.matches,
          read: rule.read,
          write: rule.write,
        }),
      ),
    };
    const pending: PendingCallable[] = [];
    for (const rule of schema.members) {
      if (registration.members.has(rule.key))
        this.refuse('register', registration, rule.key, 'duplicate member');
      let owner: object | null = target;
      let descriptor: PropertyDescriptor | undefined;
      while (owner) {
        descriptor = Object.getOwnPropertyDescriptor(owner, rule.key);
        if (descriptor || !exact) break;
        owner = Object.getPrototypeOf(owner);
      }
      if (!owner || !descriptor)
        this.refuse('register', registration, rule.key, 'declared descriptor is absent');
      const member: Member = {
        key: rule.key,
        owner,
        descriptor: Object.freeze({ ...descriptor }),
        read:
          rule.read &&
          Object.freeze({
            read: rule.read.read,
            contract: snapshotContract(rule.read.contract),
          }),
        write:
          rule.write &&
          Object.freeze({
            write: rule.write.write,
            contract: snapshotContract(rule.write.contract),
          }),
      };
      if (rule.call) {
        if (!('value' in descriptor) || typeof descriptor.value !== 'function')
          this.refuse(
            'register',
            registration,
            rule.key,
            'call contract requires a native data function',
          );
        pending.push({
          target: descriptor.value,
          contract: rule.call.contract,
          call: rule.call.call,
          receiver: rule.call.receiver,
          adapter: rule.call.call,
          registration,
          member,
          field: 'callable',
        });
      }
      if (rule.read && descriptor.get)
        pending.push({
          target: descriptor.get,
          contract: rule.read.contract,
          adapter: rule.read.read,
          call: ({ receiver }) =>
            member.read!.read({
              receiver: receiver as object,
              key: member.key,
              descriptor: this.checkDescriptor(registration, member, 'get'),
            }),
          registration,
          member,
          field: 'getter',
        });
      if (rule.write && descriptor.set)
        pending.push({
          target: descriptor.set,
          contract: rule.write.contract,
          adapter: rule.write.write,
          call: ({ receiver, arguments: args }) => {
            member.write!.write({
              receiver: receiver as object,
              key: member.key,
              value: args[0],
              descriptor: this.checkDescriptor(registration, member, 'set'),
            });
          },
          registration,
          member,
          field: 'setter',
        });
      registration.members.set(rule.key, member);
    }
    const newFunctions = new Map<Function, PendingCallable>();
    for (const item of pending) {
      const token = this.functions.get(item.target);
      const previous = newFunctions.get(item.target);
      const contract = token?.contract ?? previous?.contract;
      const adapter = token
        ? this.callables.get(token)!.bindings[0].adapter
        : previous?.adapter;
      if (
        contract &&
        (!sameContract(contract, item.contract) ||
          adapter !== item.adapter ||
          (token
            ? this.callables.get(token)!.bindings[0].receiver
            : previous?.receiver) !== item.receiver)
      )
        this.refuse(
          'register',
          registration,
          item.member.key,
          'native callable has a different canonical contract or adapter',
        );
      newFunctions.set(item.target, item);
    }
    // Validate the entire schema before adding any callable authority.
    for (const item of pending)
      Object.assign(item.member, { [item.field]: this.callable(item) });
    return registration;
  }

  private callable(item: PendingCallable): NativeCallable {
    let token = this.functions.get(item.target);
    if (!token) {
      token = Object.freeze({
        kind: 'native-callable',
        contract: snapshotContract(item.contract),
      });
      this.callables.set(token, { target: item.target, bindings: [] });
      this.functions.set(item.target, token);
    }
    this.callables.get(token)!.bindings.push(item);
    return token;
  }

  private result(value: unknown, contract: NativeContract): NativeResult {
    if (contract.result === 'guest') {
      if (object(value) && !this.isGuestValue?.(value))
        throw new NativePolicyError(
          'return',
          contract.id,
          undefined,
          'value has no recorded guest owner',
        );
      return { kind: 'value', value, contract };
    }
    if (typeof value === 'function') {
      const callable = this.functions.get(value);
      const construct = this.constructorFunctions.get(value);
      if (callable) return { kind: 'callable', callable, construct };
      if (construct) return { kind: 'constructor', construct };
      throw new NativePolicyError(
        'return',
        contract.id,
        undefined,
        'returned native function has no registered contract',
      );
    }
    return { kind: 'value', value, contract };
  }

  private requireAdmission(target: object, operation: string): readonly Registration[] {
    const registrations = this.admitted.get(target);
    if (!registrations)
      throw new NativePolicyError(
        operation,
        'unknown object',
        undefined,
        'native object has not been admitted',
      );
    return registrations;
  }

  private requireReceiver(
    registration: Registration,
    receiver: unknown,
    operation: string,
    key?: PropertyKey,
  ): asserts receiver is object {
    if (!object(receiver) || !this.admitted.get(receiver)?.includes(registration))
      this.refuse(
        operation,
        registration,
        key,
        'receiver belongs to another family or registry',
      );
    if (registration.exact && receiver !== registration.target)
      this.refuse(
        operation,
        registration,
        key,
        'facade requires its exact registered instance',
      );
    if (registration.accepts && !registration.accepts(receiver))
      this.refuse(operation, registration, key, 'receiver brand rejected');
  }

  private checkDescriptor(
    registration: Registration,
    member: Member,
    operation: string,
  ): Readonly<PropertyDescriptor> {
    const current = Object.getOwnPropertyDescriptor(member.owner, member.key);
    const captured = member.descriptor;
    if (
      !current ||
      !this.sameDescriptor(
        current,
        captured,
        Boolean(member.callable || typeof captured.value === 'function'),
      )
    )
      this.refuse(
        operation,
        registration,
        member.key,
        'captured descriptor identity changed',
      );
    return current;
  }

  private sameDescriptor(
    current: PropertyDescriptor | undefined,
    captured: Readonly<PropertyDescriptor> | undefined,
    fixedValue: boolean,
  ): boolean {
    if (!current || !captured) return current === captured;
    return (
      current.get === captured.get &&
      current.set === captured.set &&
      current.configurable === captured.configurable &&
      current.enumerable === captured.enumerable &&
      current.writable === captured.writable &&
      (!fixedValue || current.value === captured.value)
    );
  }

  private resolve(target: object, key: PropertyKey, operation: string): Resolution {
    const lineage = this.requireAdmission(target, operation);
    for (const registration of lineage) {
      const member = registration.members.get(key);
      if (!member) continue;
      if (!registration.exact) {
        for (
          let current: object | null = target;
          current && current !== member.owner;
          current = Object.getPrototypeOf(current)
        )
          if (Object.hasOwn(current, key))
            this.refuse(
              operation,
              registration,
              key,
              'unreviewed descriptor shadows native member',
            );
      }
      return {
        registration,
        member,
        descriptor: this.checkDescriptor(registration, member, operation),
      };
    }
    for (const registration of lineage) {
      const named = registration.named.find((rule) => rule.matches(key));
      if (named) {
        return { registration, named, descriptor: Object.freeze({}) };
      }
    }
    this.refuse(operation, lineage[0], key, 'member has no reviewed contract');
  }

  private refuse(
    operation: string,
    registration: Registration,
    key: PropertyKey | undefined,
    reason: string,
  ): never {
    throw new NativePolicyError(operation, registration.name, key, reason);
  }
}
