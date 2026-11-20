import type { QuickJSHandle } from 'quickjs-emscripten-core';
import type { IndexedEmscriptenModule } from '../../vendor/quickjs/generated/engine.mjs';
import { memoryAccessors } from './wasm-accessors.ts';

const typed = Object.getPrototypeOf(Uint8Array.prototype);
const lengthOf = Object.getOwnPropertyDescriptor(typed, 'length')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typed, 'byteOffset')!.get!;
const nameOf = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag)!.get!;
const byteLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;

type IndexedModule = Pick<
  IndexedEmscriptenModule,
  'cwrap' | 'addFunction' | 'removeFunction'
>;

interface IndexedView {
  pointer: number;
  proxy: QuickJSHandle;
  buffer: ArrayBuffer;
  owner?: QuickJSHandle;
  direct: boolean;
  active: boolean;
}

/** Host-only control records live in the private engine heap. Guest code receives
 * neither their pointers nor the accessor functions installed in its private table. */
export class IndexedAccess {
  private readonly views = new Map<object, IndexedView>();
  private readonly memories = new WeakMap<ArrayBufferLike, object>();
  private readonly accessors = new WeakMap<
    object,
    Map<string, { read: number; write: number; kind: number }>
  >();
  private readonly slots: number[] = [];
  private readonly activeShadows = new Set<IndexedView>();
  private readonly directBuffers = new Map<ArrayBuffer, Set<IndexedView>>();
  private pendingDirty = new Set<ArrayBuffer>();
  private readonly create: (proxy: number) => number;
  private readonly setView: (access: number, view: number, length: number) => number;
  private readonly setMemory: (
    access: number,
    read: number,
    write: number,
    offset: number,
    length: number,
    kind: number,
  ) => void;
  private readonly disable: (access: number) => void;
  private readonly markDirty: (access: number) => void;
  private readonly takeDirty: (access: number) => number;
  private readonly free: (proxy: number, access: number) => void;

  constructor(private readonly module: IndexedModule) {
    this.create = module.cwrap('QTS_NewIndexedProxyAccess', 'number', ['number']);
    this.setView = module.cwrap('QTS_SetIndexedProxyView', 'number', [
      'number',
      'number',
      'number',
    ]);
    this.setMemory = module.cwrap('QTS_SetIndexedProxyMemory', null, [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ]);
    this.disable = module.cwrap('QTS_DisableIndexedProxyAccess', null, ['number']);
    this.markDirty = module.cwrap('QTS_MarkIndexedProxyDirty', null, ['number']);
    this.takeDirty = module.cwrap('QTS_TakeIndexedProxyDirty', 'number', ['number']);
    this.free = module.cwrap('QTS_FreeIndexedProxyAccess', null, ['number', 'number']);
  }

  rememberMemory(memory: object, buffer: ArrayBufferLike): void {
    this.memories.set(buffer, memory);
  }

  hasMemory(buffer: ArrayBufferLike): boolean {
    return this.memories.has(buffer);
  }

  private entry(target: object, proxy: QuickJSHandle, buffer: ArrayBuffer): IndexedView {
    const previous = this.views.get(target);
    if (previous) return previous;
    // Root first: a failing duplicate must not leave an attached C allocation.
    const retained = proxy.dup();
    let pointer = 0;
    let entry: IndexedView | undefined;
    try {
      pointer = this.create(retained.value);
      if (!pointer) throw new Error('Cannot allocate indexed proxy access');
      entry = {
        pointer,
        proxy: retained,
        buffer,
        owner: undefined,
        direct: false,
        active: false,
      };
      this.views.set(target, entry);
      return entry;
    } catch (error) {
      if (entry && this.views.get(target) === entry) this.views.delete(target);
      if (pointer) this.free(retained.value, pointer);
      retained.dispose();
      throw error;
    }
  }

  attachMemory(target: object, proxy: QuickJSHandle, buffer: ArrayBuffer): void {
    const memory = this.memories.get(buffer);
    if (!memory) return;
    const name: string = Reflect.apply(nameOf, target, []);
    const length: number = Reflect.apply(lengthOf, target, []);
    const offset: number = Reflect.apply(offsetOf, target, []);
    if (!length || length > 0xffffffff || offset > 0xffffffff) return;
    let types = this.accessors.get(memory);
    if (!types) this.accessors.set(memory, (types = new Map()));
    let access = types.get(name);
    if (!access) {
      const native = memoryAccessors(memory, name);
      if (!native) return;
      const previousSlots = this.slots.length;
      const read = this.module.addFunction(native.read, 'di');
      let write: number | undefined;
      try {
        write = this.module.addFunction(native.write, 'vid');
        access = { read, write, kind: native.kind };
        this.slots.push(read, write);
        types.set(name, access);
      } catch (error) {
        types.delete(name);
        this.slots.length = previousSlots;
        if (write !== undefined) this.module.removeFunction(write);
        this.module.removeFunction(read);
        throw error;
      }
    }
    const entry = this.entry(target, proxy, buffer);
    this.deactivate(entry);
    entry.direct = true;
    this.setMemory(entry.pointer, access.read, access.write, offset, length, access.kind);
    entry.owner?.dispose();
    entry.owner = undefined;
    entry.active = true;
    let views = this.directBuffers.get(buffer);
    if (!views) this.directBuffers.set(buffer, (views = new Set()));
    views.add(entry);
  }

  attachShadow(
    target: object,
    proxy: QuickJSHandle,
    view: QuickJSHandle,
    buffer: ArrayBuffer,
  ): void {
    const owner = view.dup();
    let entry: IndexedView | undefined;
    try {
      entry = this.entry(target, proxy, buffer);
      this.deactivate(entry);
      const length: number = Reflect.apply(lengthOf, target, []);
      // Acquire tracking before enabling the borrowed pointer in C.
      this.activeShadows.add(entry);
      if (this.setView(entry.pointer, owner.value, length) < 0)
        throw new TypeError('Indexed cache requires a real typed-array view');
    } catch (error) {
      if (entry) {
        this.disable(entry.pointer);
        entry.active = false;
        this.activeShadows.delete(entry);
      }
      owner.dispose();
      throw error;
    }
    const previous = entry.owner;
    entry.owner = owner;
    entry.direct = false;
    entry.active = true;
    previous?.dispose();
  }

  dirty(target: object): void {
    const entry = this.views.get(target);
    if (entry) this.markDirty(entry.pointer);
  }

  releaseShadow(buffer: ArrayBuffer): void {
    for (const entry of this.views.values()) {
      if (entry.direct || entry.buffer !== buffer) continue;
      this.deactivate(entry);
      entry.owner?.dispose();
      entry.owner = undefined;
    }
  }

  private deactivate(entry: IndexedView): void {
    if (!entry.active) return;
    if (entry.direct) {
      const views = this.directBuffers.get(entry.buffer);
      views?.delete(entry);
      if (!views?.size) this.directBuffers.delete(entry.buffer);
    } else {
      if (this.takeDirty(entry.pointer)) this.pendingDirty.add(entry.buffer);
      this.activeShadows.delete(entry);
    }
    this.disable(entry.pointer);
    entry.active = false;
  }

  dirtyBuffers(): Set<ArrayBuffer> {
    const dirty = this.pendingDirty;
    this.pendingDirty = new Set();
    for (const entry of this.activeShadows)
      if (this.takeDirty(entry.pointer)) dirty.add(entry.buffer);
    return dirty;
  }

  invalidate(): void {
    for (const entry of this.activeShadows) this.deactivate(entry);
    for (const [buffer, entries] of this.directBuffers) {
      if (Reflect.apply(byteLength, buffer, []) !== 0) continue;
      for (const entry of entries) this.deactivate(entry);
    }
  }

  dispose(): void {
    for (const entry of this.views.values()) {
      this.free(entry.proxy.value, entry.pointer);
      entry.owner?.dispose();
      entry.proxy.dispose();
    }
    this.views.clear();
    this.activeShadows.clear();
    this.directBuffers.clear();
    this.pendingDirty.clear();
    for (const slot of this.slots) this.module.removeFunction(slot);
    this.slots.length = 0;
  }
}
