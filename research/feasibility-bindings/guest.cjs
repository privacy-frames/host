const StudyNode = require('./generated/StudyNode.js');
const utils = require('./generated/utils.js');

StudyNode.install(globalThis, ['Window']);

const nodes = new Map();
globalThis.nodeImplementation = (handle) => {
  if (!handle) return null;

  if (!nodes.has(handle)) {
    nodes.set(handle, StudyNode.create(globalThis, [], { handle }));
  }
  return utils.implForWrapper(nodes.get(handle));
};
globalThis.node = (handle) => utils.wrapperForImpl(nodeImplementation(handle));

globalThis.bindingResults = (() => {
  const parent = node(1);
  const child = node(2);

  parent.appendChild(child);
  child.textContent = { toString: () => 'converted guest text' };
  globalThis.StudyNode.prototype.describe = function () {
    return this.nodeName + ': ' + this.textContent;
  };

  let forgedReceiverRejected = false;
  try {
    globalThis.StudyNode.prototype.appendChild.call({}, child);
  } catch (error) {
    forgedReceiverRejected = error instanceof TypeError;
  }

  let wrongArgumentRejected = false;
  try {
    parent.appendChild({});
  } catch (error) {
    wrongArgumentRejected = error instanceof TypeError;
  }

  let illegalConstructorRejected = false;
  try {
    new globalThis.StudyNode();
  } catch (error) {
    illegalConstructorRejected = error instanceof TypeError;
  }

  return {
    identity: node(2) === child && child.parentNode === parent,
    appendIdentity: parent.appendChild(child) === child,
    instance: child instanceof globalThis.StudyNode,
    branding: Object.prototype.toString.call(child),
    nativeRead: child.nodeName,
    conversion: child.textContent,
    extension: child.describe(),
    forgedReceiverRejected,
    wrongArgumentRejected,
    illegalConstructorRejected,
    guestConstructor: child.describe.constructor('return typeof document')(),
  };
})();
