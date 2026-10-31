# Same-scope update and unregister ordering

The native fixture observes a narrower boundary than cancellation of all browser
work. In nine samples, an unregister operation remained pending while an earlier
same-scope update response was held. After release, unregistration succeeded and
the update queued behind it failed without another script request. Without
unregistration, a second update produced another request.

Run the fixture with:

```sh
node formal/runtime-verification/registration-fence.ts
```

The [receipt](registration-fence.json) records Chromium 153, Firefox 155 and
Firefox with its forced-stale update preference, each with three schedules.
The independent loopback HTTP server holds a response only after receiving its
request. Playwright does not intercept or suppress requests. The first request
has already reached the receiver before the response gate is established.

| Schedule                                                   | Requests observed | Result                                                        |
| ---------------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| Await unregister, then update                              | 0                 | Unregister succeeds; update fails                             |
| Hold update response; queue unregister and update; release | 1                 | Unregister waits; earlier update succeeds; later update fails |
| Hold update response; release; update again                | 2                 | Both updates succeed                                          |

The page retains the old worker reference. Its per-global identity remains the
same after unregistration; removal of the registration does not imply termination
of that worker. The fixture observes the held interval for 500 milliseconds and
final traffic for one second. It stores operation outcomes, timestamps,
registrations and request arrivals, together with runner, profile, package-lock
and worker-script hashes. Failure leaves a partial receipt with `completed: false`.

## Checked queue property

Run `node formal/runtime-verification/registration-lifetime-check.ts` with the
pinned Lean 4.35.0 release. It checks both the earlier prefix model and
[RegistrationQueue.lean](RegistrationQueue.lean), then writes separate receipts.

The queue model represents one registered scope, pending update/unregister jobs,
an active update, an unregister acknowledgment and a request count. Starting an
update counts its request; response completion releases the queue. An unregister
job removes the registration and acknowledges only when it reaches the front of
the idle queue. Registration replacement is excluded.

Nine checked theorems establish queue blocking, invariant preservation and no
additional modeled requests after acknowledgment for arbitrary finite sequences
of queued jobs and completions. Concrete cases preserve the earlier request and
produce two requests without unregistration. Six theorems use `propext`; three
concrete cases are axiom-free. The checker requires the exact named axiom reports.
Removing queue blocking or retaining the registration fails proof checking.
Replacing preservation with an unchecked proof is rejected through its `sorryAx`
report, even when compiler warnings are removed.

The [queue receipt](registration-queue.json) pins the model, checked input,
runner, Lean executable, output and three faulty inputs. These checks establish
the abstract queue property; native observations support selected correspondences.
They do not prove the browser implementation refines the model.

## Production obligations

The specification's [job scheduling](https://w3c.github.io/ServiceWorker/#schedule-job),
[update](https://w3c.github.io/ServiceWorker/#update-algorithm) and
[unregister](https://w3c.github.io/ServiceWorker/#unregister-algorithm) algorithms
are the correspondence targets. An update promise settling, a job finishing and
all worker lifecycle activity ending must be reviewed separately.

The native fixture uses an unchanged worker script. Changed-script installation,
activation, extended events, other queues and native soft-update triggers remain
outside its tested schedules. A launch must also prevent covering registrations
from returning while private execution survives, as demonstrated by the
[overlap experiment](registration-overlap.md). Neither acknowledgment nor a fresh
scope name alone establishes those premises.

No production unregistration or bootstrap change is made by this experiment.
The maintenance counterexample remains unresolved, including local delivery and
new-context behavior when interception is lost.
