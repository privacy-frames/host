/** Web IDL describes interface shape; native-effect authorization is separate. */
export interface InterfaceArgument {
  name: string;
  type: string;
  optional: boolean;
  variadic: boolean;
}

interface InterfaceMemberBase {
  /** The interface or mixin which declares the member. */
  owner: string;
  name: string;
  static: boolean;
  /** Empty inherits the enclosing interface's exposure set. */
  exposed: readonly string[];
  attributes: readonly string[];
}

export interface InterfaceAttribute extends InterfaceMemberBase {
  kind: 'attribute';
  type: string;
  readonly: boolean;
  unforgeable: boolean;
  sameObject: boolean;
}

export interface InterfaceOperation extends InterfaceMemberBase {
  kind: 'operation';
  type: string;
  arguments: readonly InterfaceArgument[];
  requiredArguments: number;
  special: 'getter' | 'setter' | 'deleter' | 'stringifier' | null;
}

export interface InterfaceConstant extends InterfaceMemberBase {
  kind: 'constant';
  type: string;
  /** Source literal; native forwarding supplies its JavaScript value. */
  value: string;
}

export interface InterfaceCollection extends InterfaceMemberBase {
  kind: 'iterable' | 'maplike' | 'setlike';
  types: readonly string[];
  readonly: boolean;
  async: boolean;
}

export type InterfaceMember =
  InterfaceAttribute | InterfaceOperation | InterfaceConstant | InterfaceCollection;

export interface BrowserInterfaceDefinition {
  name: string;
  kind: 'interface' | 'namespace' | 'callback';
  parent: string | null;
  exposed: readonly string[];
  global: readonly string[];
  /** Null means no public constructor was declared. */
  constructorArguments: number | null;
  legacyAliases: readonly string[];
  hasInterfaceObject: boolean;
  attributes: readonly string[];
  members: readonly InterfaceMember[];
  sources: readonly string[];
}

export interface BrowserBindingManifest {
  webrefVersion: string;
  parserVersion: string;
  sourceHash: string;
  interfaces: readonly BrowserInterfaceDefinition[];
}

/** The runtime provisions properties through native Web IDL operations. */
export interface RuntimeInterfaceMember {
  name: string;
  kind: InterfaceMember['kind'];
  static: boolean;
  exposed: readonly string[];
  attributes: readonly string[];
  readonly?: boolean;
}

export interface RuntimeInterfaceDefinition {
  name: string;
  kind: BrowserInterfaceDefinition['kind'];
  parent: string | null;
  exposed: readonly string[];
  global: readonly string[];
  hasInterfaceObject: boolean;
  constructable: boolean;
  /** Only global-interface members are needed to provision this projection. */
  members: readonly RuntimeInterfaceMember[];
}
