/** Member identity is interface shape, never native effect authorization. */
export interface NativeMemberIdentity {
  readonly owner: string;
  /** Null denotes an anonymous named/indexed operation, not a property named ''. */
  readonly name: string | null;
  readonly kind: 'attribute' | 'operation' | 'constant';
  readonly static: boolean;
  readonly readonly?: boolean;
  readonly unforgeable?: true;
  readonly symbol?: 'iterator' | 'asyncIterator';
  readonly special?: 'getter' | 'setter' | 'deleter' | 'stringifier';
  readonly propertyKind?: 'indexed' | 'named' | 'unclassified';
  readonly firstArgumentType?: string;
  readonly collection?: 'iterable' | 'async-iterable' | 'maplike' | 'setlike';
  /** The attribute supplying an implicit stringifier's value. */
  readonly sourceAttribute?: string;
}

export interface NativeInterfaceMembers {
  readonly name: string;
  readonly kind: 'interface' | 'namespace' | 'callback';
  readonly parent: string | null;
  readonly members: readonly NativeMemberIdentity[];
}

export interface NativeMemberManifest {
  readonly webrefVersion: string;
  readonly parserVersion: string;
  readonly sourceHash: string;
  readonly interfaces: readonly NativeInterfaceMembers[];
}

export interface NativeMemberResolution {
  /** The native interface onto which the declaration or mixin was installed. */
  readonly interface: string;
  readonly member: NativeMemberIdentity;
}
