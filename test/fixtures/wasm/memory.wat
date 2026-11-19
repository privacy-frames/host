;; Rebuild with wabt wat2wasm --enable-threads. No production dependency on wabt.
(module
  (import "env" "memory" (memory 1 3))
  (import "env" "callback" (func $callback (param i32) (result i32)))
  (func (export "read") (param i32) (result i32) local.get 0 i32.load)
  (func (export "roundtrip") (param i32) (result i32)
    i32.const 0 i32.const 10 i32.store
    local.get 0 call $callback
    i32.const 0 i32.load i32.add)
  (func (export "twice") (param i32) (result i32)
    i32.const 0 i32.const 10 i32.store
    local.get 0 call $callback drop
    i32.const 0 i32.const 11 i32.store
    local.get 0 call $callback)
  (func (export "grow") (param i32) (result i32) local.get 0 memory.grow))
