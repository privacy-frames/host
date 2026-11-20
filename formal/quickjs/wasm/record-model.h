/* Review boundary: QuickJS JSValue/object ABI projections, not its implementation. */
/* Fixed wasm32 widths; avoid depending on the container's optional multilib headers. */
typedef unsigned char uint8_t;
typedef unsigned short uint16_t;
typedef unsigned int uint32_t;
typedef unsigned int uintptr_t;
typedef unsigned int size_t;
typedef _Bool bool;
#define NULL ((void *)0)
extern void *calloc(size_t count, size_t size);
extern void free(void *pointer);
_Static_assert(sizeof(uint32_t) == 4 && sizeof(void *) == 4, "wasm32 widths");
#define TRUE 1
#define FALSE 0
#define JS_TAG_OBJECT -1

typedef struct JSObject JSObject;
typedef struct JSProxyData JSProxyData;
typedef struct JSIndexedProxyAccess JSIndexedProxyAccess;
typedef struct { int tag; JSObject *object; } JSValue;
typedef JSValue JSValueConst;
struct JSObject {
    uint16_t class_id;
    bool oob;
    JSProxyData *proxy;
    union { struct { uint32_t count; } array; } u;
};
#define JS_VALUE_GET_TAG(value) ((value).tag)
#define JS_VALUE_GET_OBJ(value) ((value).object)
static void *JS_GetOpaque(JSValueConst value, int class_id) {
    if (value.tag != JS_TAG_OBJECT || value.object->class_id != class_id) return NULL;
    return value.object->proxy;
}
static bool typed_array_is_oob(JSObject *object) { return object->oob; }
extern unsigned nondet_uint(void);
extern int nondet_int(void);
extern bool nondet_bool(void);
