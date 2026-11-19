;; An imported externref return preserves the host fetch promise without coercion.
(module
  (import "env" "fetch" (func $fetch (param externref) (result externref)))
  (func (export "request") (param externref) (result externref) local.get 0 call $fetch))
