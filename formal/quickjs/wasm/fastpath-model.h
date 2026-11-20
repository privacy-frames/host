/* Review boundary: effects of internal typed-array operations and primitive conversion. */
typedef int BOOL;
typedef int JS_BOOL;
typedef int int32_t;
typedef uint32_t JSAtom;
typedef struct { int unused; } JSContext;
typedef struct { int unused; } JSPropertyDescriptor;
#define JS_VALUE_GET_PTR(value) ((value).object)
static unsigned reads, writes, shadow_reads, shadow_writes;
static uint32_t last_address;
static JSObject *last_view;
static int conversion_error;
static int shadow_result;

static double native_read(uint32_t address) {
    reads++;
    last_address = address;
    return 0;
}
static void native_write(uint32_t address, double number) {
    writes++;
    last_address = address;
    (void)number;
}
static JSValue JS_NewFloat64(JSContext *ctx, double number) {
    (void)ctx; (void)number;
    return (JSValue){ .tag = JS_TAG_FLOAT64 };
}
static JSValue JS_GetPropertyInternal(JSContext *ctx, JSValueConst value,
                                      JSAtom atom, JSValueConst receiver, BOOL throw_ref_error) {
    (void)ctx; (void)atom; (void)receiver; (void)throw_ref_error;
    shadow_reads++;
    last_view = value.object;
    return (JSValue){ .tag = JS_TAG_INT };
}
static int JS_SetPropertyInternal(JSContext *ctx, JSValueConst target, JSAtom atom,
                                  JSValue value, JSValueConst receiver, int flags) {
    (void)ctx; (void)atom; (void)value; (void)receiver; (void)flags;
    shadow_writes++;
    last_view = target.object;
    return shadow_result;
}
/* Primitive conversion may fail, but cannot call application object coercions. */
static int JS_ToFloat64(JSContext *ctx, double *number, JSValueConst value) {
    (void)ctx; (void)value; *number = 0; return conversion_error;
}
static int JS_ToInt32(JSContext *ctx, int32_t *number, JSValueConst value) {
    (void)ctx; (void)value; *number = 0; return conversion_error;
}
static int JS_ToUint8ClampFree(JSContext *ctx, int32_t *number, JSValue value) {
    (void)ctx; (void)value; *number = 0; return conversion_error;
}
static JSValue JS_DupValue(JSContext *ctx, JSValueConst value) { (void)ctx; return value; }
