;; Rebuild with wabt wat2wasm. The start calls a host-supplied Wasm function.
(module
  (type $callback (func (param i32) (result i32)))
  (import "env" "table" (table 1 funcref))
  (func $start
    i32.const 5 i32.const 0 call_indirect (type $callback) drop)
  (start $start))
