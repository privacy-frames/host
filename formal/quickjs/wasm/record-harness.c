/* Actual control functions are inserted before these callers by check-records.py. */
static double memory_read(uint32_t address) { return (double)address; }
static void memory_write(uint32_t address, double value) { (void)address; (void)value; }

static void rejection_contract(void) {
    JSIndexedProxyAccess previous = {0};
    JSProxyData data = {0};
    data.is_revoked = nondet_bool();
    data.indexed = nondet_bool() ? &previous : NULL;
    JSObject object = { .class_id = nondet_bool() ? JS_CLASS_PROXY : JS_CLASS_OBJECT,
                        .proxy = &data };
    JSValue proxy = { .tag = nondet_bool() ? JS_TAG_OBJECT : 0, .object = &object };
    bool eligible = proxy.tag == JS_TAG_OBJECT && object.class_id == JS_CLASS_PROXY &&
                    !data.is_revoked && !data.indexed;
    JSIndexedProxyAccess *before = data.indexed;
    JSIndexedProxyAccess *access = QTS_NewIndexedProxyAccess(&proxy);
    if (!eligible) {
        __CPROVER_assert(access == NULL && data.indexed == before, "rejection preserves prior record");
    } else if (access) {
        __CPROVER_assert(data.indexed == access, "successful allocation is paired with its proxy");
        __CPROVER_assert(!access->enabled && !access->dirty && !access->view,
                         "calloc starts disabled and without a borrowed view");
        QTS_FreeIndexedProxyAccess(&proxy, access);
        __CPROVER_assert(data.indexed == NULL, "paired free unlinks before storage release");
    } else {
        __CPROVER_assert(data.indexed == NULL, "allocation failure installs no record");
    }
}

static void view_contract(void) {
    JSIndexedProxyAccess access = {0};
    JSObject object = { .class_id = nondet_uint(), .oob = nondet_bool() };
    object.u.array.count = nondet_uint();
    JSValue view = { .tag = nondet_int(), .object = &object };
    uint32_t length = nondet_uint();
    bool valid = view.tag == JS_TAG_OBJECT && object.class_id >= JS_CLASS_UINT8C_ARRAY &&
                 object.class_id <= JS_CLASS_FLOAT64_ARRAY && !object.oob &&
                 length <= object.u.array.count;
    int result = QTS_SetIndexedProxyView(&access, &view, length);
    __CPROVER_assert((result == 0) == valid, "view admission matches native brand and bounds");
    if (valid) {
        __CPROVER_assert(access.view == &view && access.length == length && access.enabled,
                         "accepted view borrows exactly the rooted caller handle");
        QTS_DisableIndexedProxyAccess(&access);
        __CPROVER_assert(!access.enabled, "disable revokes borrowed-view access");
    } else {
        __CPROVER_assert(!access.view && !access.enabled, "rejected view grants no new access");
    }
}

static void memory_contract(void) {
    JSIndexedProxyAccess access = {0};
    JSValue rooted = {0};
    access.view = &rooted;
    uintptr_t read = (uintptr_t)&memory_read;
    uintptr_t write = (uintptr_t)&memory_write;
    uint32_t offset = nondet_uint(), length = nondet_uint();
    int kind = nondet_int();
    __CPROVER_assume(kind >= 0 && kind <= 11);
    QTS_SetIndexedProxyMemory(&access, read, write, offset, length, kind);
    __CPROVER_assert(!access.view && access.enabled, "memory mode clears borrowed view");
    __CPROVER_assert(access.offset == offset && access.length == length &&
                     access.shift == (kind & 3) && access.kind == (kind >> 2),
                     "memory mode retains exact trusted dimensions and kind");
    __CPROVER_assert(access.read == &memory_read && access.write == &memory_write,
                     "memory mode retains only supplied function-table entries");
    QTS_MarkIndexedProxyDirty(&access);
    __CPROVER_assert(QTS_TakeIndexedProxyDirty(&access) == 1 && !access.dirty,
                     "taking dirty consumes a recorded write");
    __CPROVER_assert(QTS_TakeIndexedProxyDirty(&access) == 0,
                     "taking dirty twice reports no extra write");
}

static void lifetime_contract(void) {
    JSProxyData data = {0};
    JSObject object = { .class_id = JS_CLASS_PROXY, .proxy = &data };
    JSValue proxy = { .tag = JS_TAG_OBJECT, .object = &object };
    JSIndexedProxyAccess *access = QTS_NewIndexedProxyAccess(&proxy);
    if (!access) return;
    /* Handles and proxy stay live throughout each synchronous C operation. */
    JSObject object_view = { .class_id = JS_CLASS_UINT8_ARRAY };
    object_view.u.array.count = nondet_uint();
    JSValue view = { .tag = JS_TAG_OBJECT, .object = &object_view };
    for (unsigned step = 0; step < 4; step++) {
        unsigned action = nondet_uint();
        __CPROVER_assume(action < 4);
        switch (action) {
            case 0: QTS_SetIndexedProxyView(access, &view, object_view.u.array.count); break;
            case 1: QTS_SetIndexedProxyMemory(access, (uintptr_t)&memory_read,
                      (uintptr_t)&memory_write, nondet_uint(), nondet_uint(), 0); break;
            case 2: QTS_DisableIndexedProxyAccess(access); break;
            case 3: data.is_revoked = 1; break;
        }
        __CPROVER_assert(data.indexed == access, "mode changes preserve record ownership");
        __CPROVER_assert(!access->enabled || !access->view || access->view == &view,
                         "enabled borrowed pointer remains rooted during the operation");
    }
    QTS_FreeIndexedProxyAccess(&proxy, access);
    __CPROVER_assert(data.indexed == NULL, "lifecycle terminal free removes the attached pointer");
}

int main(void) {
    rejection_contract();
    view_contract();
    memory_contract();
    lifetime_contract();
    return 0;
}
