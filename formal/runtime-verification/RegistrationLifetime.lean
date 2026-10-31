import Init.Data.List.Sublist

namespace RegistrationLifetime

/-- Serialized URL symbols. This is not a URL parser or the production allocator. -/
abbrev Address := List Nat
abbrev Scope := Address

/-- Neither scope may cover a URL inside the other scope's subtree. -/
def Separated (left right : Scope) : Prop :=
  ¬left <+: right ∧ ¬right <+: left

structure State where
  registered : List Scope
  pending : List Address
  authorized : Nat
  oldClientNetwork : Bool

inductive Event where
  | register (scope : Scope)
  | unregister (scope : Scope)
  | enqueueOldClientJob (clientURL : Address)
  | authorizeOldClientJob
  | deliverOldClientJob

def initial : State := ⟨[], [], 0, false⟩

/-- Authorization consults registrations covering the client association URL,
not the remote script destination. A committed request can transmit later, even
after unregistration. Browser selection and inheritance need correspondence. -/
def step (state : State) : Event → State
  | .register scope => { state with registered := scope :: state.registered }
  | .unregister scope =>
    { state with registered := state.registered.filter (· != scope) }
  | .enqueueOldClientJob clientURL => { state with pending := state.pending ++ [clientURL] }
  | .authorizeOldClientJob =>
    match state.pending with
    | [] => state
    | clientURL :: rest => { state with
        pending := rest
        authorized := state.authorized +
          if state.registered.any (fun scope => decide (scope <+: clientURL)) then 1 else 0 }
  | .deliverOldClientJob =>
    if state.authorized = 0 then state
    else { state with authorized := state.authorized - 1, oldClientNetwork := true }

def run (state : State) : List Event → State
  | [] => state
  | event :: rest => run (step state event) rest

def Safe (old : Scope) (state : State) : Prop :=
  (∀ scope ∈ state.registered, Separated old scope) ∧
  (∀ clientURL ∈ state.pending, old <+: clientURL) ∧
  state.authorized = 0 ∧
  state.oldClientNetwork = false

def Allowed (old : Scope) : Event → Prop
  | .register scope => Separated old scope
  | .enqueueOldClientJob clientURL => old <+: clientURL
  | _ => True

def AllowedTrace (old : Scope) : List Event → Prop
  | [] => True
  | event :: rest => Allowed old event ∧ AllowedTrace old rest

theorem separated_no_covering_registration (old scope clientURL : Address)
    (separated : Separated old scope) (within : old <+: clientURL) :
    ¬scope <+: clientURL := by
  intro covering
  cases List.prefix_or_prefix_of_prefix within covering with
  | inl pref => exact separated.1 pref
  | inr pref => exact separated.2 pref

theorem equal_length_distinct_scopes_separated (left right : Scope)
    (sameLength : left.length = right.length) (different : left ≠ right) :
    Separated left right := by
  constructor
  · intro pref
    exact different (pref.eq_of_length sameLength)
  · intro pref
    exact different (pref.eq_of_length sameLength.symm).symm

theorem initial_safe (old : Scope) : Safe old initial := by
  simp [Safe, initial]

theorem no_covering_match (old clientURL : Address) (state : State)
    (safe : Safe old state) (within : old <+: clientURL) :
    state.registered.any (fun scope => decide (scope <+: clientURL)) = false := by
  apply List.any_eq_false.mpr
  intro scope member
  simpa using separated_no_covering_registration old scope clientURL
    (safe.1 scope member) within

theorem step_safe (old : Scope) (state : State) (event : Event)
    (safe : Safe old state) (allowed : Allowed old event) :
    Safe old (step state event) := by
  rcases safe with ⟨registered, pending, uncommitted, quiet⟩
  cases event with
  | register scope =>
    refine ⟨?_, pending, uncommitted, quiet⟩
    intro candidate member
    simp only [step, List.mem_cons] at member
    cases member with
    | inl same => exact same ▸ allowed
    | inr previous => exact registered candidate previous
  | unregister scope =>
    refine ⟨?_, pending, uncommitted, quiet⟩
    intro candidate member
    exact registered candidate (List.mem_filter.mp member).1
  | enqueueOldClientJob clientURL =>
    refine ⟨registered, ?_, uncommitted, quiet⟩
    intro candidate member
    simp only [step, List.mem_append, List.mem_singleton] at member
    cases member with
    | inl previous => exact pending candidate previous
    | inr same => exact same ▸ allowed
  | authorizeOldClientJob =>
    cases contents : state.pending with
    | nil => simpa [step, contents, Safe] using
        And.intro registered (And.intro pending (And.intro uncommitted quiet))
    | cons clientURL rest =>
      have within : old <+: clientURL := pending clientURL (by simp [contents])
      have matchAbsent := no_covering_match old clientURL state
        ⟨registered, pending, uncommitted, quiet⟩ within
      simp only [Safe, step, contents, matchAbsent, Bool.false_eq_true, ite_false, Nat.add_zero]
      refine ⟨registered, ?_, uncommitted, quiet⟩
      intro candidate member
      exact pending candidate (by simp [contents, member])
  | deliverOldClientJob =>
    simpa [step, uncommitted, Safe] using
      And.intro registered (And.intro pending (And.intro uncommitted quiet))

theorem arbitrary_trace_safe (old : Scope) (events : List Event) (state : State)
    (safe : Safe old state) (allowed : AllowedTrace old events) :
    Safe old (run state events) := by
  induction events generalizing state with
  | nil => exact safe
  | cons event rest induction =>
    exact induction (step state event)
      (step_safe old state event safe allowed.1) allowed.2

theorem separated_scopes_no_old_network (old : Scope) (events : List Event)
    (allowed : AllowedTrace old events) :
    (run initial events).oldClientNetwork = false := by
  exact (arbitrary_trace_safe old events initial (initial_safe old) allowed).2.2.2

/-- Distinct scope names do not exclude a covering ancestor after queuing. -/
theorem ancestor_counterexample :
    (run initial [.enqueueOldClientJob [1, 2, 3], .unregister [1, 2],
      .register [1], .authorizeOldClientJob, .deliverOldClientJob]).oldClientNetwork = true := by rfl

theorem descendant_counterexample :
    (run initial [.enqueueOldClientJob [1, 2, 3], .register [1, 2, 3],
      .authorizeOldClientJob, .deliverOldClientJob]).oldClientNetwork = true := by rfl

theorem scope_reuse_counterexample :
    (run initial [.enqueueOldClientJob [1, 2, 3], .register [1, 2],
      .authorizeOldClientJob, .deliverOldClientJob]).oldClientNetwork = true := by rfl

theorem sibling_delivery_no_network :
    (run initial [.enqueueOldClientJob [1, 2, 3], .register [1, 4],
      .authorizeOldClientJob, .deliverOldClientJob]).oldClientNetwork = false := by rfl

theorem unregistered_delivery_no_network :
    (run initial [.enqueueOldClientJob [1, 2, 3],
      .authorizeOldClientJob, .deliverOldClientJob]).oldClientNetwork = false := by rfl

/-- Rejecting only equality admits a different but covering ancestor scope. -/
theorem distinct_ancestor_is_forbidden :
    ([1] : Scope) ≠ [1, 2] ∧ ¬Allowed [1, 2] (.register [1]) := by
  simp [Allowed, Separated]

/-- Unregistering after authorization cannot cancel the modeled committed effect. -/
theorem unregister_after_authorization_counterexample :
    (run initial [.register [1], .enqueueOldClientJob [1, 2, 3],
      .authorizeOldClientJob, .unregister [1],
      .deliverOldClientJob]).oldClientNetwork = true := by rfl

end RegistrationLifetime
