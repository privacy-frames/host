namespace RegistrationLifetime

/-- A scope is an abstract identity, not an emitted URL or finite slug. -/
abbrev Scope := Nat

structure State where
  registered : Scope → Bool
  pending : Nat
  oldClientNetwork : Bool

inductive Event where
  | register (scope : Scope)
  | unregister (scope : Scope)
  | enqueueOldClientJob
  | deliverOldClientJob

def initial : State := ⟨fun _ => false, 0, false⟩

/-- Only old-client-caused update jobs are counted. Trusted setup traffic is
outside this observation, conditional on its independence from private execution.
Jobs retain the old scope and consult the registration map at delivery. -/
def step (old : Scope) (state : State) : Event → State
  | .register scope =>
    { state with registered := fun candidate =>
        if candidate = scope then true else state.registered candidate }
  | .unregister scope =>
    { state with registered := fun candidate =>
        if candidate = scope then false else state.registered candidate }
  | .enqueueOldClientJob => { state with pending := state.pending + 1 }
  | .deliverOldClientJob =>
    if state.pending = 0 then state
    else { state with
      pending := state.pending - 1
      oldClientNetwork := state.oldClientNetwork || state.registered old }

def run (old : Scope) (state : State) : List Event → State
  | [] => state
  | event :: rest => run old (step old state event) rest

def Safe (old : Scope) (state : State) : Prop :=
  state.registered old = false ∧ state.oldClientNetwork = false

def Allowed (old : Scope) : Event → Prop
  | .register scope => scope ≠ old
  | _ => True

def AllowedTrace (old : Scope) : List Event → Prop
  | [] => True
  | event :: rest => Allowed old event ∧ AllowedTrace old rest

theorem initial_safe (old : Scope) : Safe old initial := by
  exact ⟨rfl, rfl⟩

theorem step_safe (old : Scope) (state : State) (event : Event)
    (safe : Safe old state) (allowed : Allowed old event) :
    Safe old (step old state event) := by
  cases event with
  | register scope =>
    exact ⟨(ite_eq_right (Ne.symm allowed)).trans safe.1, safe.2⟩
  | unregister scope =>
    exact ⟨if same : old = scope then ite_eq_left same
      else (ite_eq_right same).trans safe.1, safe.2⟩
  | enqueueOldClientJob => exact safe
  | deliverOldClientJob =>
    change Safe old (if state.pending = 0 then state
      else State.mk state.registered (state.pending - 1)
        (state.oldClientNetwork || state.registered old))
    have noNetwork : (state.oldClientNetwork || state.registered old) = false :=
      (congrArg (fun value => value || state.registered old) safe.2).trans
        ((congrArg (fun value => false || value) safe.1).trans rfl)
    exact if empty : state.pending = 0 then
      Eq.mpr (congrArg (Safe old) (ite_eq_left empty)) safe
    else Eq.mpr (congrArg (Safe old) (ite_eq_right empty)) ⟨safe.1, noNetwork⟩

theorem arbitrary_trace_safe (old : Scope) (events : List Event) (state : State)
    (safe : Safe old state) (allowed : AllowedTrace old events) :
    Safe old (run old state events) := by
  induction events generalizing state with
  | nil => exact safe
  | cons event rest induction =>
    exact induction (step old state event)
      (step_safe old state event safe allowed.1) allowed.2

theorem fresh_scopes_no_old_network (old : Scope) (events : List Event)
    (allowed : AllowedTrace old events) :
    (run old initial events).oldClientNetwork = false := by
  exact (arbitrary_trace_safe old events initial (initial_safe old) allowed).2

/-- An earlier unregistration does not protect a queued job from later reuse.
This is a model counterexample, not a claim of an observed browser schedule. -/
theorem scope_reuse_counterexample :
    (run 0 initial [.enqueueOldClientJob, .register 0,
      .deliverOldClientJob]).oldClientNetwork = true := by rfl

theorem unregistered_delivery_no_network :
    (run 0 initial [.enqueueOldClientJob,
      .deliverOldClientJob]).oldClientNetwork = false := by rfl

end RegistrationLifetime
