exports.implementation = class StudyNodeImpl {
  constructor(globalObject, args, privateData) {
    this.handle = privateData.handle;
  }

  get nodeName() {
    return globalThis.nativeRead(this.handle, 'nodeName');
  }

  get textContent() {
    return globalThis.nativeRead(this.handle, 'textContent');
  }

  set textContent(value) {
    globalThis.nativeWrite(this.handle, 'textContent', value);
  }

  get parentNode() {
    return globalThis.nodeImplementation(globalThis.nativeParent(this.handle));
  }

  appendChild(node) {
    globalThis.nativeAppend(this.handle, node.handle);
    return node;
  }
};
