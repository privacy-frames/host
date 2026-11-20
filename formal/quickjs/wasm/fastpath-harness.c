static void access_contract(bool setter) {
    JSContext context = {0};
    JSIndexedProxyAccess access = {0};
    JSProxyData data = { .indexed = nondet_bool() ? &access : NULL,
                         .is_revoked = nondet_bool() };
    JSObject object = { .class_id = JS_CLASS_PROXY, .proxy = &data };
    JSObject typed_view = { .class_id = JS_CLASS_UINT8_ARRAY };
    JSValue rooted_view = { .tag = JS_TAG_OBJECT, .object = &typed_view };
    JSValue proxy = { .tag = JS_TAG_OBJECT, .object = &object };
    JSObject other = {0};
    JSValue receiver = { .tag = nondet_int(),
                         .object = nondet_bool() ? &object : &other };
    JSValue value = { .tag = nondet_int(), .object = &other };
    JSAtom atom = nondet_uint();
    access.enabled = nondet_bool();
    access.length = nondet_uint();
    access.offset = nondet_uint();
    access.shift = nondet_uint();
    access.kind = nondet_uint();
    __CPROVER_assume(access.shift <= 3 && access.kind <= 2);
    access.view = nondet_bool() ? &rooted_view : NULL;
    access.read = &native_read;
    access.write = &native_write;
    conversion_error = nondet_bool();
    shadow_result = nondet_int();
    __CPROVER_assume(shadow_result >= -1 && shadow_result <= 1);
    bool admitted = !data.is_revoked && data.indexed && access.enabled &&
                    (atom & 0x80000000u) != 0 && (atom & 0x7fffffffu) < access.length;
    if (setter) {
        admitted = admitted && receiver.tag == JS_TAG_OBJECT && receiver.object == &object &&
                   value.tag != JS_TAG_OBJECT && value.tag != JS_TAG_SYMBOL;
        js_proxy_set(&context, proxy, atom, value, receiver, 0);
    } else {
        js_proxy_get(&context, proxy, atom, receiver);
    }
    unsigned native_calls = reads + writes;
    unsigned shadow_calls = shadow_reads + shadow_writes;
    __CPROVER_assert(!native_calls || admitted, "native access requires every production admission guard");
    __CPROVER_assert(!shadow_calls || admitted, "borrowed view access requires every production admission guard");
    __CPROVER_assert(native_calls + shadow_calls <= 1, "one proxy operation performs at most one indexed access");
    __CPROVER_assert(!native_calls || (!access.view &&
                      last_address == access.offset + ((atom & 0x7fffffffu) << access.shift)),
                     "native access uses exactly the registered mode and address");
    __CPROVER_assert(!shadow_calls || (access.view == &rooted_view && last_view == &typed_view),
                     "shadow access uses exactly the rooted caller view");
    if (setter && !access.view) {
        __CPROVER_assert(!writes || (!conversion_error &&
                          value.tag != JS_TAG_BIG_INT && value.tag != JS_TAG_SHORT_BIG_INT),
                         "native writes require successful primitive conversion and exclude BigInt");
    }
    __CPROVER_assert(!access.dirty || (setter && shadow_writes == 1 && shadow_result > 0),
                     "dirty is published only after successful borrowed-view write");
}

int main(void) {
    access_contract(nondet_bool());
    return 0;
}
