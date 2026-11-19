;; The same module/name pair is imported as both a function and an externref.
(module
  (import "env" "item" (func $item (param i32) (result i32)))
  (import "env" "item" (global $reference externref))
  (func (export "call") (param i32) (result i32) local.get 0 call $item)
  (func (export "reference") (result externref) global.get $reference))
