// Fixture classes deliberately implement only the listed operations.
export const bindings = String.raw`
const wrappers = new Map();
const listeners = new Map();
let nextListener = 1;
const invoke = (op, id, args = []) => JSON.parse(__host(op, id, JSON.stringify(args)));
class FixtureNode {
  constructor(id) { this.id = id; }
  get value() { return invoke('value', this.id); }
  set value(v) { invoke('setValue', this.id, [v]); }
  get textContent() { return invoke('text', this.id); }
  set textContent(v) { invoke('setText', this.id, [v]); }
  addEventListener(type, callback) {
    const key = nextListener++;
    listeners.set(key, callback);
    invoke('listen', this.id, [type, key]);
  }
  dispatchEvent(event) { return invoke('dispatch', this.id, [event.type, event.cancelable]); }
  fill(bytes) { return invoke('pixels', this.id, [Array.from(bytes)]); }
}
class FixtureEvent {
  constructor(type, options = {}) { this.type = type; this.cancelable = !!options.cancelable; }
}
const wrap = id => {
  if (!wrappers.has(id)) wrappers.set(id, new FixtureNode(id));
  return wrappers.get(id);
};
globalThis.document = { getElementById: id => wrap(invoke('query', 0, [id])) };
globalThis.Event = FixtureEvent;
globalThis.Element = FixtureNode;
globalThis.localStorage = {
  setItem: (key, value) => invoke('store', 0, [key, value]),
  getItem: key => invoke('load', 0, [key]),
};
globalThis.__deliver = (listener, eventId, type) => listeners.get(listener)({
  type,
  preventDefault: () => invoke('prevent', eventId),
  get defaultPrevented() { return invoke('prevented', eventId); },
});
`;

export const fixture = String.raw`
var log = [];
var button = document.getElementById('button');
var input = document.getElementById('input');
var output = document.getElementById('output');
var canvas = document.getElementById('canvas');
Element.prototype.label = function() { return 'guest:' + this.id; };
button.expando = { retained: true };
button.addEventListener('inner', event => {
  log.push('inner');
  input.value = 'nested';
  event.preventDefault();
});
button.addEventListener('outer', event => {
  log.push('outer-enter');
  const result = button.dispatchEvent(new Event('inner', { cancelable: true }));
  log.push('inner-result:' + result);
  localStorage.setItem('note', input.value);
  output.textContent = localStorage.getItem('note');
  canvas.fill(new Uint8ClampedArray([12, 34, 56, 255]));
  event.preventDefault();
  log.push('outer-exit');
});
button.addEventListener('throws', () => { throw new Error('guest-listener-failure'); });
var identity = button === document.getElementById('button');
var prototype = button.label();
var expando = document.getElementById('button').expando.retained;
var dispatched = button.dispatchEvent(new Event('outer', { cancelable: true }));
var caughtHost = '';
try { __host('fail', 0, '[]'); } catch (error) { caughtHost = error.message; }
var promiseDone = false;
Promise.resolve().then(() => { promiseDone = true; });
var persisted = 41;
`;
