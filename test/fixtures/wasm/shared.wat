;; Rebuild with wabt wat2wasm --enable-threads. No production dependency on wabt.
(module
  (import "env" "memory" (memory 1 3 shared))
  (func (export "add") (param i32) (result i32)
    i32.const 0 local.get 0 i32.atomic.rmw.add)
  (func (export "read") (result i32) i32.const 0 i32.atomic.load))
