'use strict';
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) =>
    function __require() {
      try {
        return (
          mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
          mod.exports
        );
      } catch (e) {
        throw ((mod = 0), e);
      }
    };

  // node_modules/webidl-conversions/lib/index.js
  var require_lib = __commonJS({
    'node_modules/webidl-conversions/lib/index.js'(exports) {
      'use strict';
      function makeException(ErrorType, message, options) {
        if (options.globals) {
          ErrorType = options.globals[ErrorType.name];
        }
        return new ErrorType(
          `${options.context ? options.context : 'Value'} ${message}.`,
        );
      }
      function toNumber(value, options) {
        if (typeof value === 'bigint') {
          throw makeException(
            TypeError,
            'is a BigInt which cannot be converted to a number',
            options,
          );
        }
        if (!options.globals) {
          return Number(value);
        }
        return options.globals.Number(value);
      }
      function evenRound(x) {
        if (
          (x > 0 && x % 1 === 0.5 && (x & 1) === 0) ||
          (x < 0 && x % 1 === -0.5 && (x & 1) === 1)
        ) {
          return censorNegativeZero(Math.floor(x));
        }
        return censorNegativeZero(Math.round(x));
      }
      function integerPart(n) {
        return censorNegativeZero(Math.trunc(n));
      }
      function sign(x) {
        return x < 0 ? -1 : 1;
      }
      function modulo(x, y) {
        const signMightNotMatch = x % y;
        if (sign(y) !== sign(signMightNotMatch)) {
          return signMightNotMatch + y;
        }
        return signMightNotMatch;
      }
      function censorNegativeZero(x) {
        return x === 0 ? 0 : x;
      }
      function createIntegerConversion(bitLength, { unsigned }) {
        let lowerBound, upperBound;
        if (unsigned) {
          lowerBound = 0;
          upperBound = 2 ** bitLength - 1;
        } else {
          lowerBound = -(2 ** (bitLength - 1));
          upperBound = 2 ** (bitLength - 1) - 1;
        }
        const twoToTheBitLength = 2 ** bitLength;
        const twoToOneLessThanTheBitLength = 2 ** (bitLength - 1);
        return (value, options = {}) => {
          let x = toNumber(value, options);
          x = censorNegativeZero(x);
          if (options.enforceRange) {
            if (!Number.isFinite(x)) {
              throw makeException(TypeError, 'is not a finite number', options);
            }
            x = integerPart(x);
            if (x < lowerBound || x > upperBound) {
              throw makeException(
                TypeError,
                `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
                options,
              );
            }
            return x;
          }
          if (!Number.isNaN(x) && options.clamp) {
            x = Math.min(Math.max(x, lowerBound), upperBound);
            x = evenRound(x);
            return x;
          }
          if (!Number.isFinite(x) || x === 0) {
            return 0;
          }
          x = integerPart(x);
          if (x >= lowerBound && x <= upperBound) {
            return x;
          }
          x = modulo(x, twoToTheBitLength);
          if (!unsigned && x >= twoToOneLessThanTheBitLength) {
            return x - twoToTheBitLength;
          }
          return x;
        };
      }
      function createLongLongConversion(bitLength, { unsigned }) {
        const upperBound = Number.MAX_SAFE_INTEGER;
        const lowerBound = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
        const asBigIntN = unsigned ? BigInt.asUintN : BigInt.asIntN;
        return (value, options = {}) => {
          let x = toNumber(value, options);
          x = censorNegativeZero(x);
          if (options.enforceRange) {
            if (!Number.isFinite(x)) {
              throw makeException(TypeError, 'is not a finite number', options);
            }
            x = integerPart(x);
            if (x < lowerBound || x > upperBound) {
              throw makeException(
                TypeError,
                `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
                options,
              );
            }
            return x;
          }
          if (!Number.isNaN(x) && options.clamp) {
            x = Math.min(Math.max(x, lowerBound), upperBound);
            x = evenRound(x);
            return x;
          }
          if (!Number.isFinite(x) || x === 0) {
            return 0;
          }
          let xBigInt = BigInt(integerPart(x));
          xBigInt = asBigIntN(bitLength, xBigInt);
          return Number(xBigInt);
        };
      }
      exports.any = (value) => {
        return value;
      };
      exports.undefined = () => {
        return void 0;
      };
      exports.boolean = (value) => {
        return Boolean(value);
      };
      exports.byte = createIntegerConversion(8, { unsigned: false });
      exports.octet = createIntegerConversion(8, { unsigned: true });
      exports.short = createIntegerConversion(16, { unsigned: false });
      exports['unsigned short'] = createIntegerConversion(16, { unsigned: true });
      exports.long = createIntegerConversion(32, { unsigned: false });
      exports['unsigned long'] = createIntegerConversion(32, { unsigned: true });
      exports['long long'] = createLongLongConversion(64, { unsigned: false });
      exports['unsigned long long'] = createLongLongConversion(64, { unsigned: true });
      exports.double = (value, options = {}) => {
        const x = toNumber(value, options);
        if (!Number.isFinite(x)) {
          throw makeException(TypeError, 'is not a finite floating-point value', options);
        }
        return x;
      };
      exports['unrestricted double'] = (value, options = {}) => {
        const x = toNumber(value, options);
        return x;
      };
      exports.float = (value, options = {}) => {
        const x = toNumber(value, options);
        if (!Number.isFinite(x)) {
          throw makeException(TypeError, 'is not a finite floating-point value', options);
        }
        if (Object.is(x, -0)) {
          return x;
        }
        const y = Math.fround(x);
        if (!Number.isFinite(y)) {
          throw makeException(
            TypeError,
            'is outside the range of a single-precision floating-point value',
            options,
          );
        }
        return y;
      };
      exports['unrestricted float'] = (value, options = {}) => {
        const x = toNumber(value, options);
        if (isNaN(x)) {
          return x;
        }
        if (Object.is(x, -0)) {
          return x;
        }
        return Math.fround(x);
      };
      exports.DOMString = (value, options = {}) => {
        if (options.treatNullAsEmptyString && value === null) {
          return '';
        }
        if (typeof value === 'symbol') {
          throw makeException(
            TypeError,
            'is a symbol, which cannot be converted to a string',
            options,
          );
        }
        const StringCtor = options.globals ? options.globals.String : String;
        return StringCtor(value);
      };
      exports.ByteString = (value, options = {}) => {
        const x = exports.DOMString(value, options);
        if (/[^\x00-\xFF]/.test(x)) {
          throw makeException(TypeError, 'is not a valid ByteString', options);
        }
        return x;
      };
      exports.USVString = (value, options = {}) => {
        return exports.DOMString(value, options).toWellFormed();
      };
      exports.object = (value, options = {}) => {
        if (
          value === null ||
          (typeof value !== 'object' && typeof value !== 'function')
        ) {
          throw makeException(TypeError, 'is not an object', options);
        }
        return value;
      };
      var abByteLengthGetter = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype,
        'byteLength',
      ).get;
      var sabByteLengthGetter = Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        'byteLength',
      ).get;
      function isNonSharedArrayBuffer(value) {
        try {
          abByteLengthGetter.call(value);
          return true;
        } catch {
          return false;
        }
      }
      function isSharedArrayBuffer(value) {
        try {
          sabByteLengthGetter.call(value);
          return true;
        } catch {
          return false;
        }
      }
      var abResizableGetter = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype,
        'resizable',
      ).get;
      var sabGrowableGetter = Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        'growable',
      ).get;
      function isNonSharedArrayBufferResizable(value) {
        try {
          return abResizableGetter.call(value);
        } catch {
          return false;
        }
      }
      function isSharedArrayBufferGrowable(value) {
        try {
          return sabGrowableGetter.call(value);
        } catch {
          return false;
        }
      }
      function isArrayBufferDetached(value) {
        try {
          new Uint8Array(value);
          return false;
        } catch {
          return true;
        }
      }
      exports.ArrayBuffer = (value, options = {}) => {
        if (!isNonSharedArrayBuffer(value)) {
          throw makeException(TypeError, 'is not an ArrayBuffer', options);
        }
        if (!options.allowResizable && isNonSharedArrayBufferResizable(value)) {
          throw makeException(TypeError, 'is a resizable ArrayBuffer', options);
        }
        if (isArrayBufferDetached(value)) {
          throw makeException(TypeError, 'is a detached ArrayBuffer', options);
        }
        return value;
      };
      exports.SharedArrayBuffer = (value, options = {}) => {
        if (!isSharedArrayBuffer(value)) {
          throw makeException(TypeError, 'is not a SharedArrayBuffer', options);
        }
        if (!options.allowResizable && isSharedArrayBufferGrowable(value)) {
          throw makeException(TypeError, 'is a growable SharedArrayBuffer', options);
        }
        return value;
      };
      var dvByteLengthGetter = Object.getOwnPropertyDescriptor(
        DataView.prototype,
        'byteLength',
      ).get;
      exports.DataView = (value, options = {}) => {
        try {
          dvByteLengthGetter.call(value);
        } catch {
          throw makeException(TypeError, 'is not a DataView', options);
        }
        return exports.ArrayBufferView(value, options);
      };
      var typedArrayNameGetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(Uint8Array).prototype,
        Symbol.toStringTag,
      ).get;
      [
        Int8Array,
        Int16Array,
        Int32Array,
        Uint8Array,
        Uint16Array,
        Uint32Array,
        Uint8ClampedArray,
        Float32Array,
        Float64Array,
      ].forEach((func) => {
        const { name } = func;
        const article = /^[AEIOU]/u.test(name) ? 'an' : 'a';
        exports[name] = (value, options = {}) => {
          if (!ArrayBuffer.isView(value) || typedArrayNameGetter.call(value) !== name) {
            throw makeException(TypeError, `is not ${article} ${name} object`, options);
          }
          return exports.ArrayBufferView(value, options);
        };
      });
      exports.ArrayBufferView = (value, options = {}) => {
        if (!ArrayBuffer.isView(value)) {
          throw makeException(
            TypeError,
            'is not a view on an ArrayBuffer or SharedArrayBuffer',
            options,
          );
        }
        if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
          throw makeException(
            TypeError,
            'is a view on a SharedArrayBuffer, which is not allowed',
            options,
          );
        }
        if (!options.allowResizable) {
          if (isNonSharedArrayBufferResizable(value.buffer)) {
            throw makeException(
              TypeError,
              'is a view on a resizable ArrayBuffer, which is not allowed',
              options,
            );
          } else if (isSharedArrayBufferGrowable(value.buffer)) {
            throw makeException(
              TypeError,
              'is a view on a growable SharedArrayBuffer, which is not allowed',
              options,
            );
          }
        }
        if (isArrayBufferDetached(value.buffer)) {
          throw makeException(TypeError, 'is a view on a detached ArrayBuffer', options);
        }
        return value;
      };
      exports.BufferSource = (value, options = {}) => {
        if (ArrayBuffer.isView(value)) {
          return exports.ArrayBufferView(value, options);
        }
        if (isNonSharedArrayBuffer(value)) {
          return exports.ArrayBuffer(value, options);
        } else if (options.allowShared && isSharedArrayBuffer(value)) {
          return exports.SharedArrayBuffer(value, options);
        }
        if (options.allowShared) {
          throw makeException(
            TypeError,
            'is not an ArrayBuffer, SharedArrayBuffer, or a view on one',
            options,
          );
        } else {
          throw makeException(
            TypeError,
            'is not an ArrayBuffer or a view on one',
            options,
          );
        }
      };
      exports.DOMTimeStamp = exports['unsigned long long'];
    },
  });

  // generated/utils.js
  var require_utils = __commonJS({
    'generated/utils.js'(exports, module) {
      'use strict';
      var conversions = require_lib();
      function isObject(value) {
        return (
          (typeof value === 'object' && value !== null) || typeof value === 'function'
        );
      }
      var call = Function.call.bind(Function.call);
      function define(target, source) {
        for (const key of Reflect.ownKeys(source)) {
          const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
          if (descriptor && !Reflect.defineProperty(target, key, descriptor)) {
            throw new TypeError(`Cannot redefine property: ${String(key)}`);
          }
        }
      }
      function newObjectInRealm(globalObject, object) {
        const ctorRegistry = initCtorRegistry(globalObject);
        return Object.defineProperties(
          Object.create(ctorRegistry['%Object.prototype%']),
          Object.getOwnPropertyDescriptors(object),
        );
      }
      var wrapperSymbol = /* @__PURE__ */ Symbol('wrapper');
      var sameObjectCaches = /* @__PURE__ */ Symbol('SameObject caches');
      var ctorRegistrySymbol = /* @__PURE__ */ Symbol.for(
        '[webidl2js] constructor registry',
      );
      var AsyncIteratorPrototype = Object.getPrototypeOf(
        Object.getPrototypeOf(async function* () {}).prototype,
      );
      function initCtorRegistry(globalObject) {
        if (Object.hasOwn(globalObject, ctorRegistrySymbol)) {
          return globalObject[ctorRegistrySymbol];
        }
        const ctorRegistry = /* @__PURE__ */ Object.create(null);
        ctorRegistry['%Object.prototype%'] = globalObject.Object.prototype;
        ctorRegistry['%Array.prototype%'] = globalObject.Array.prototype;
        ctorRegistry['%IteratorPrototype%'] = Object.getPrototypeOf(
          Object.getPrototypeOf(new globalObject.Array()[Symbol.iterator]()),
        );
        try {
          ctorRegistry['%AsyncIteratorPrototype%'] = Object.getPrototypeOf(
            Object.getPrototypeOf(globalObject.eval('(async function* () {})').prototype),
          );
        } catch {
          ctorRegistry['%AsyncIteratorPrototype%'] = AsyncIteratorPrototype;
        }
        globalObject[ctorRegistrySymbol] = ctorRegistry;
        return ctorRegistry;
      }
      function getSameObject(wrapper, prop, creator) {
        if (!wrapper[sameObjectCaches]) {
          wrapper[sameObjectCaches] = /* @__PURE__ */ Object.create(null);
        }
        if (prop in wrapper[sameObjectCaches]) {
          return wrapper[sameObjectCaches][prop];
        }
        wrapper[sameObjectCaches][prop] = creator();
        return wrapper[sameObjectCaches][prop];
      }
      function createInterfaceDescriptor(getParent) {
        const descriptor = {
          get inclusiveInheritedInterfaces() {
            const interfaces = getParent
              ? [...getParent().inclusiveInheritedInterfaces, descriptor]
              : [descriptor];
            Object.defineProperties(descriptor, {
              inclusiveInheritedInterfaces: { value: interfaces },
              inheritanceDepth: { value: interfaces.length - 1 },
            });
            return interfaces;
          },
          get inheritanceDepth() {
            return descriptor.inclusiveInheritedInterfaces.length - 1;
          },
        };
        return descriptor;
      }
      var ReturnValue = class {
        constructor(value) {
          return value;
        }
      };
      var WrapperData = class _WrapperData extends ReturnValue {
        #impl;
        #interfaceDescriptor;
        constructor(wrapper, impl, interfaceDescriptor) {
          super(wrapper);
          this.#impl = impl;
          this.#interfaceDescriptor = interfaceDescriptor;
        }
        static registerWrapper(wrapper, impl, interfaceDescriptor) {
          return new _WrapperData(wrapper, impl, interfaceDescriptor);
        }
        static implForWrapper(wrapper) {
          if (!isObject(wrapper) || !(#impl in wrapper)) {
            return null;
          }
          return wrapper.#impl;
        }
        static implForWrapperWithInterface(wrapper, interfaceDescriptor) {
          if (!isObject(wrapper) || !(#impl in wrapper)) {
            return null;
          }
          if (
            wrapper.#interfaceDescriptor?.inclusiveInheritedInterfaces[
              interfaceDescriptor.inheritanceDepth
            ] !== interfaceDescriptor
          ) {
            return null;
          }
          return wrapper.#impl;
        }
      };
      var { registerWrapper, implForWrapper, implForWrapperWithInterface } = WrapperData;
      function requireImplForWrapper(
        wrapper,
        interfaceDescriptor,
        globalObject,
        interfaceName,
        context,
      ) {
        const impl = implForWrapperWithInterface(wrapper, interfaceDescriptor);
        if (impl === null) {
          throw new globalObject.TypeError(
            `'${context}' called on an object that is not a valid instance of ${interfaceName}.`,
          );
        }
        return impl;
      }
      function wrapperForImpl(impl) {
        return impl?.[wrapperSymbol] ?? null;
      }
      function tryWrapperForImpl(impl) {
        const wrapper = wrapperForImpl(impl);
        return wrapper !== null ? wrapper : impl;
      }
      function tryImplForWrapper(wrapper) {
        const impl = implForWrapper(wrapper);
        return impl !== null ? impl : wrapper;
      }
      var iterInternalSymbol = /* @__PURE__ */ Symbol('internal');
      function isArrayIndexPropName(P) {
        if (typeof P !== 'string') {
          return false;
        }
        const i = P >>> 0;
        if (i === 2 ** 32 - 1) {
          return false;
        }
        const s = `${i}`;
        if (P !== s) {
          return false;
        }
        return true;
      }
      function createObservableArraySymbolFactory(algorithm) {
        const symbols = /* @__PURE__ */ new Map();
        return (name) => {
          if (!symbols.has(name)) {
            symbols.set(
              name,
              /* @__PURE__ */ Symbol(`${name} observable array ${algorithm}`),
            );
          }
          return symbols.get(name);
        };
      }
      var observableArraySet = createObservableArraySymbolFactory('set');
      var observableArrayDelete = createObservableArraySymbolFactory('delete');
      var observableArrays = /* @__PURE__ */ new WeakMap();
      var ObservableArrayHandler = class {
        #backingList;
        // https://webidl.spec.whatwg.org/#creating-an-observable-array-exotic-object
        constructor(impl, globalObject, name, convert) {
          this.impl = impl;
          this.globalObject = globalObject;
          this.name = name;
          this.convert = convert;
          this.setSymbol = observableArraySet(name);
          this.deleteSymbol = observableArrayDelete(name);
          const target = Object.setPrototypeOf(
            [],
            initCtorRegistry(globalObject)['%Array.prototype%'],
          );
          this.proxy = new Proxy(target, this);
        }
        get backingList() {
          this.#backingList ??= this.impl[this.name];
          return this.#backingList;
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-defineProperty
        defineProperty(target, property, descriptor) {
          if (property === 'length') {
            if (isAccessorDescriptor(descriptor)) {
              return false;
            }
            if (descriptor.configurable === true) {
              return false;
            }
            if (descriptor.enumerable === true) {
              return false;
            }
            if (descriptor.writable === false) {
              return false;
            }
            if (Object.hasOwn(descriptor, 'value')) {
              return this.setLength(descriptor.value);
            }
            return true;
          }
          if (isArrayIndexPropName(property)) {
            if (isAccessorDescriptor(descriptor)) {
              return false;
            }
            if (descriptor.configurable === false) {
              return false;
            }
            if (descriptor.enumerable === false) {
              return false;
            }
            if (descriptor.writable === false) {
              return false;
            }
            if (Object.hasOwn(descriptor, 'value')) {
              return this.setIndexedValue(property, descriptor.value);
            }
            return true;
          }
          return Reflect.defineProperty(target, property, descriptor);
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-deleteProperty
        deleteProperty(target, property) {
          if (property === 'length') {
            return false;
          }
          if (isArrayIndexPropName(property)) {
            const list = this.backingList;
            const index = Number(property);
            if (index !== list.length - 1) {
              return false;
            }
            this.impl[this.deleteSymbol]?.(list[index], index);
            list.pop();
            return true;
          }
          return Reflect.deleteProperty(target, property);
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-get
        get(target, property, receiver) {
          if (property === 'length') {
            return this.backingList.length;
          }
          if (isArrayIndexPropName(property)) {
            const list = this.backingList;
            const index = Number(property);
            return index < list.length ? tryWrapperForImpl(list[index]) : void 0;
          }
          return Reflect.get(target, property, receiver);
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-getOwnPropertyDescriptor
        getOwnPropertyDescriptor(target, property) {
          if (property === 'length') {
            return {
              value: this.backingList.length,
              writable: true,
              enumerable: false,
              configurable: false,
            };
          }
          if (isArrayIndexPropName(property)) {
            const list = this.backingList;
            const index = Number(property);
            if (index >= list.length) {
              return void 0;
            }
            return {
              value: tryWrapperForImpl(list[index]),
              writable: true,
              enumerable: true,
              configurable: true,
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, property);
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-has
        has(target, property) {
          if (property === 'length') {
            return true;
          }
          if (isArrayIndexPropName(property)) {
            return Number(property) < this.backingList.length;
          }
          return Reflect.has(target, property);
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-ownKeys
        ownKeys(target) {
          const keys = [];
          const { length } = this.backingList;
          for (let index = 0; index < length; ++index) {
            keys.push(String(index));
          }
          return keys.concat(Reflect.ownKeys(target));
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-preventExtensions
        preventExtensions() {
          return false;
        }
        // https://webidl.spec.whatwg.org/#es-observable-array-set
        set(target, property, value, receiver) {
          if (property === 'length') {
            return this.setLength(value);
          }
          if (isArrayIndexPropName(property)) {
            return this.setIndexedValue(property, value);
          }
          return Reflect.set(target, property, value, receiver);
        }
        // https://webidl.spec.whatwg.org/#observable-array-exotic-object-set-the-length
        setLength(value) {
          const options = { globals: this.globalObject };
          const uint32Len = conversions['unsigned long'](value, options);
          const numberLen = conversions['unrestricted double'](value, options);
          if (uint32Len !== numberLen) {
            throw new this.globalObject.RangeError('Invalid array length');
          }
          const list = this.backingList;
          if (uint32Len > list.length) {
            return false;
          }
          for (let index = list.length - 1; index >= uint32Len; --index) {
            this.impl[this.deleteSymbol]?.(list[index], index);
            list.pop();
          }
          return true;
        }
        // https://webidl.spec.whatwg.org/#observable-array-exotic-object-set-the-indexed-value
        setIndexedValue(property, value) {
          const list = this.backingList;
          const oldLen = list.length;
          const index = Number(property);
          if (index > oldLen) {
            return false;
          }
          const idlValue = this.convert(value);
          if (index < oldLen) {
            this.impl[this.deleteSymbol]?.(list[index], index);
          }
          this.impl[this.setSymbol]?.(idlValue, index);
          if (index === oldLen) {
            list.push(idlValue);
          } else {
            list[index] = idlValue;
          }
          return true;
        }
        // https://webidl.spec.whatwg.org/#dfn-attribute-setter
        replace(values) {
          this.setLength(0);
          let index = 0;
          for (const value of values) {
            this.impl[this.setSymbol]?.(value, index);
            this.backingList.push(value);
            ++index;
          }
        }
      };
      Object.setPrototypeOf(ObservableArrayHandler.prototype, null);
      function initObservableArray(impl, globalObject, name, convert) {
        if (!observableArrays.has(impl)) {
          observableArrays.set(impl, /* @__PURE__ */ new Map());
        }
        observableArrays
          .get(impl)
          .set(name, new ObservableArrayHandler(impl, globalObject, name, convert));
      }
      function getObservableArray(impl, name) {
        return observableArrays.get(impl).get(name).proxy;
      }
      function setObservableArray(impl, name, values) {
        observableArrays.get(impl).get(name).replace(values);
      }
      var arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype,
        'byteLength',
      ).get;
      function isArrayBuffer(value) {
        try {
          arrayBufferByteLengthGetter.call(value);
          return true;
        } catch {
          return false;
        }
      }
      var sharedArrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        'byteLength',
      ).get;
      function isSharedArrayBuffer(value) {
        try {
          sharedArrayBufferByteLengthGetter.call(value);
          return true;
        } catch {
          return false;
        }
      }
      function iteratorResult([key, value], kind) {
        let result;
        switch (kind) {
          case 'key':
            result = key;
            break;
          case 'value':
            result = value;
            break;
          case 'key+value':
            result = [key, value];
            break;
        }
        return { value: result, done: false };
      }
      function ordinarySetWithOwnDescriptor(target, property, value, receiver, ownDesc) {
        if (ownDesc === void 0) {
          const parent = Reflect.getPrototypeOf(target);
          if (parent !== null) {
            return Reflect.set(parent, property, value, receiver);
          }
          ownDesc = {
            writable: true,
            enumerable: true,
            configurable: true,
            value: void 0,
          };
        }
        if (isDataDescriptor(ownDesc)) {
          if (!ownDesc.writable) {
            return false;
          }
          if (!isObject(receiver)) {
            return false;
          }
          const existingDesc = Reflect.getOwnPropertyDescriptor(receiver, property);
          if (existingDesc !== void 0) {
            if (isAccessorDescriptor(existingDesc)) {
              return false;
            }
            if (existingDesc.writable === false) {
              return false;
            }
            const valueDesc = { value };
            return Reflect.defineProperty(receiver, property, valueDesc);
          }
          return Reflect.defineProperty(receiver, property, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
        const setter = ownDesc.set;
        if (setter === void 0) {
          return false;
        }
        call(setter, receiver, value);
        return true;
      }
      function isDataDescriptor(desc) {
        return Object.hasOwn(desc, 'value') || Object.hasOwn(desc, 'writable');
      }
      function isAccessorDescriptor(desc) {
        return Object.hasOwn(desc, 'get') || Object.hasOwn(desc, 'set');
      }
      function getMethod(value, property, errPrefix = 'The provided value') {
        const func = value[property];
        if (func === void 0 || func === null) {
          return void 0;
        }
        if (typeof func !== 'function') {
          throw new TypeError(`${errPrefix}'s ${property} property is not a function.`);
        }
        return func;
      }
      function createAsyncFromSyncIterator(syncIterator) {
        const syncIterable = {
          [Symbol.iterator]: () => syncIterator,
        };
        const asyncIterator = (async function* () {
          return yield* syncIterable;
        })();
        return asyncIterator;
      }
      function convertAsyncSequence(
        object,
        itemConverter,
        errPrefix = 'The provided value',
      ) {
        if (!isObject(object)) {
          throw new TypeError(`${errPrefix} is not an object.`);
        }
        let method = getMethod(object, Symbol.asyncIterator, errPrefix);
        let type = 'async';
        if (method === void 0) {
          method = getMethod(object, Symbol.iterator, errPrefix);
          if (method === void 0) {
            throw new TypeError(`${errPrefix} is not an async iterable object.`);
          }
          type = 'sync';
        }
        return {
          object,
          method,
          type,
          // The wrapperSymbol ensures that if the async sequence is used as a return value,
          // that it exposes the original JavaScript value.
          // https://webidl.spec.whatwg.org/#js-async-iterable
          [wrapperSymbol]: object,
          // Implement the async iterator protocol, so users can iterate
          // the async sequence directly (e.g. with for await...of)
          // instead of needing to call a separate helper function to open the async sequence.
          // https://webidl.spec.whatwg.org/#async-sequence-open
          [Symbol.asyncIterator]() {
            return openAsyncSequence(
              object,
              method,
              type,
              itemConverter,
              `${errPrefix}'s iterator`,
            );
          },
        };
      }
      function openAsyncSequence(
        object,
        method,
        type,
        itemConverter,
        errPrefix = 'The provided value',
      ) {
        let iterator = call(method, object);
        if (!isObject(iterator)) {
          throw new TypeError(`${errPrefix}'s method must return an object`);
        }
        if (type === 'sync') {
          iterator = createAsyncFromSyncIterator(iterator);
        }
        const nextMethod = iterator.next;
        return {
          async next() {
            const nextResult = await call(nextMethod, iterator);
            if (!isObject(nextResult)) {
              throw new TypeError(`${errPrefix}'s next method must return an object`);
            }
            const { done, value } = nextResult;
            if (done) {
              return { done: true, value: void 0 };
            }
            return { done: false, value: itemConverter(value) };
          },
          async return(reason) {
            const returnMethod = getMethod(iterator, 'return', errPrefix);
            if (returnMethod === void 0) {
              return { done: true, value: void 0 };
            }
            const returnResult = await call(returnMethod, iterator, reason);
            if (!isObject(returnResult)) {
              throw new TypeError(`${errPrefix}'s return method must return an object`);
            }
            return { done: true, value: void 0 };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      }
      var supportsPropertyIndex = /* @__PURE__ */ Symbol('supports property index');
      var supportedPropertyIndices = /* @__PURE__ */ Symbol('supported property indices');
      var supportsPropertyName = /* @__PURE__ */ Symbol('supports property name');
      var supportedPropertyNames = /* @__PURE__ */ Symbol('supported property names');
      var indexedGet = /* @__PURE__ */ Symbol('indexed property get');
      var indexedSetNew = /* @__PURE__ */ Symbol('indexed property set new');
      var indexedSetExisting = /* @__PURE__ */ Symbol('indexed property set existing');
      var namedGet = /* @__PURE__ */ Symbol('named property get');
      var namedSetNew = /* @__PURE__ */ Symbol('named property set new');
      var namedSetExisting = /* @__PURE__ */ Symbol('named property set existing');
      var namedDelete = /* @__PURE__ */ Symbol('named property delete');
      var asyncIteratorNext = /* @__PURE__ */ Symbol(
        'async iterator get the next iteration result',
      );
      var asyncIteratorReturn = /* @__PURE__ */ Symbol('async iterator return steps');
      var asyncIteratorInit = /* @__PURE__ */ Symbol(
        'async iterator initialization steps',
      );
      var asyncIteratorEOI = /* @__PURE__ */ Symbol('async iterator end of iteration');
      module.exports = exports = {
        isObject,
        define,
        newObjectInRealm,
        wrapperSymbol,
        createInterfaceDescriptor,
        registerWrapper,
        getSameObject,
        ctorRegistrySymbol,
        initCtorRegistry,
        wrapperForImpl,
        implForWrapper,
        implForWrapperWithInterface,
        requireImplForWrapper,
        tryWrapperForImpl,
        tryImplForWrapper,
        iterInternalSymbol,
        isArrayBuffer,
        isSharedArrayBuffer,
        isArrayIndexPropName,
        observableArraySet,
        observableArrayDelete,
        initObservableArray,
        getObservableArray,
        setObservableArray,
        getMethod,
        convertAsyncSequence,
        supportsPropertyIndex,
        supportedPropertyIndices,
        supportsPropertyName,
        supportedPropertyNames,
        indexedGet,
        indexedSetNew,
        indexedSetExisting,
        namedGet,
        namedSetNew,
        namedSetExisting,
        namedDelete,
        asyncIteratorNext,
        asyncIteratorReturn,
        asyncIteratorInit,
        asyncIteratorEOI,
        iteratorResult,
        ordinarySetWithOwnDescriptor,
      };
    },
  });

  // impls/StudyNode-impl.js
  var require_StudyNode_impl = __commonJS({
    'impls/StudyNode-impl.js'(exports) {
      'use strict';
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
        appendChild(node2) {
          globalThis.nativeAppend(this.handle, node2.handle);
          return node2;
        }
      };
    },
  });

  // generated/StudyNode.js
  var require_StudyNode = __commonJS({
    'generated/StudyNode.js'(exports) {
      'use strict';
      var conversions = require_lib();
      var utils = require_utils();
      var ctorRegistrySymbol = utils.ctorRegistrySymbol;
      var interfaceName = 'StudyNode';
      var $interfaceDescriptor = utils.createInterfaceDescriptor();
      exports.interfaceDescriptor = $interfaceDescriptor;
      function $requireImpl(wrapper, globalObject, context) {
        return utils.requireImplForWrapper(
          wrapper,
          $interfaceDescriptor,
          globalObject,
          interfaceName,
          context,
        );
      }
      exports.is = (value) => {
        return utils.implForWrapperWithInterface(value, $interfaceDescriptor) !== null;
      };
      exports.isImpl = (value) => {
        return utils.isObject(value) && value instanceof Impl.implementation;
      };
      exports.convert = (
        globalObject,
        value,
        { context = 'The provided value' } = {},
      ) => {
        const impl = utils.implForWrapperWithInterface(value, $interfaceDescriptor);
        if (impl !== null) {
          return impl;
        }
        throw new globalObject.TypeError(`${context} is not of type 'StudyNode'.`);
      };
      function makeWrapper(globalObject, newTarget) {
        let proto;
        if (newTarget !== void 0) {
          proto = newTarget.prototype;
        }
        if (!utils.isObject(proto)) {
          proto = globalObject[ctorRegistrySymbol]['StudyNode'].prototype;
        }
        return Object.create(proto);
      }
      exports.create = (globalObject, constructorArgs, privateData) => {
        const wrapper = makeWrapper(globalObject);
        return exports.setup(wrapper, globalObject, constructorArgs, privateData);
      };
      exports.createImpl = (globalObject, constructorArgs, privateData) => {
        const wrapper = exports.create(globalObject, constructorArgs, privateData);
        return utils.implForWrapper(wrapper);
      };
      exports._internalSetup = (wrapper, globalObject) => {};
      exports.setup = (wrapper, globalObject, constructorArgs = [], privateData = {}) => {
        privateData.wrapper = wrapper;
        exports._internalSetup(wrapper, globalObject);
        const impl = new Impl.implementation(globalObject, constructorArgs, privateData);
        utils.registerWrapper(wrapper, impl, $interfaceDescriptor);
        impl[utils.wrapperSymbol] = wrapper;
        if (Impl.init) {
          Impl.init(impl);
        }
        return wrapper;
      };
      exports.new = (globalObject, newTarget) => {
        const wrapper = makeWrapper(globalObject, newTarget);
        exports._internalSetup(wrapper, globalObject);
        const impl = Object.create(Impl.implementation.prototype);
        utils.registerWrapper(wrapper, impl, $interfaceDescriptor);
        impl[utils.wrapperSymbol] = wrapper;
        if (Impl.init) {
          Impl.init(impl);
        }
        return impl;
      };
      var exposed = /* @__PURE__ */ new Set(['Window']);
      exports.install = (globalObject, globalNames) => {
        if (!globalNames.some((globalName) => exposed.has(globalName))) {
          return;
        }
        const ctorRegistry = utils.initCtorRegistry(globalObject);
        class StudyNode {
          constructor() {
            throw new globalObject.TypeError('Illegal constructor');
          }
          appendChild(node2) {
            const $impl = $requireImpl(this ?? globalObject, globalObject, 'appendChild');
            if (arguments.length < 1) {
              throw new globalObject.TypeError(
                `Failed to execute 'appendChild' on 'StudyNode': 1 argument required, but only ${arguments.length} present.`,
              );
            }
            const args = [];
            {
              let curArg = arguments[0];
              curArg = exports.convert(globalObject, curArg, {
                context: `Failed to execute 'appendChild' on 'StudyNode': parameter 1`,
              });
              args.push(curArg);
            }
            return utils.tryWrapperForImpl($impl.appendChild(...args));
          }
          get nodeName() {
            const $impl = $requireImpl(
              this ?? globalObject,
              globalObject,
              'get nodeName',
            );
            return $impl['nodeName'];
          }
          get textContent() {
            const $impl = $requireImpl(
              this ?? globalObject,
              globalObject,
              'get textContent',
            );
            return $impl['textContent'];
          }
          set textContent(V) {
            const $impl = $requireImpl(
              this ?? globalObject,
              globalObject,
              'set textContent',
            );
            V = conversions['DOMString'](V, {
              context: `Failed to set the 'textContent' property on 'StudyNode': The provided value`,
              globals: globalObject,
            });
            $impl['textContent'] = V;
          }
          get parentNode() {
            const $impl = $requireImpl(
              this ?? globalObject,
              globalObject,
              'get parentNode',
            );
            return utils.tryWrapperForImpl($impl['parentNode']);
          }
        }
        Object.defineProperties(StudyNode.prototype, {
          appendChild: { enumerable: true },
          nodeName: { enumerable: true },
          textContent: { enumerable: true },
          parentNode: { enumerable: true },
          [Symbol.toStringTag]: { value: 'StudyNode', configurable: true },
        });
        ctorRegistry[interfaceName] = StudyNode;
        Object.defineProperty(globalObject, interfaceName, {
          configurable: true,
          writable: true,
          value: StudyNode,
        });
      };
      var Impl = require_StudyNode_impl();
    },
  });

  // guest.cjs
  var require_guest = __commonJS({
    'guest.cjs'() {
      var StudyNode = require_StudyNode();
      var utils = require_utils();
      StudyNode.install(globalThis, ['Window']);
      var nodes = /* @__PURE__ */ new Map();
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
    },
  });
  require_guest();
})();
