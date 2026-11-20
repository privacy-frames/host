import Init.Data.Nat.Basic

namespace ContextPublication

/-- Natural numbers are ghost names for fresh JavaScript object identities.
They are not production numeric counters or exposed guest handles. -/
structure State where
  next : Nat
  token : Nat
  closed : Bool
  deriving Repr

inductive Event where
  | begin
  | invalidate

def initial : State := ⟨1, 0, true⟩

def advance (state : State) (closed : Bool) : State :=
  ⟨state.next + 1, state.next, closed⟩

def step (state : State) : Event → State
  | .begin => advance state false
  | .invalidate => advance state true

def accepts (state : State) (token : Nat) : Bool :=
  !state.closed && state.token == token

def run (state : State) : List Event → State
  | [] => state
  | event :: rest => run (step state event) rest

def WellFormed (state : State) : Prop := state.token < state.next

def Safe (retained : Nat) (state : State) : Prop :=
  retained < state.next ∧ accepts state retained = false

theorem initial_well_formed : WellFormed initial := Nat.zero_lt_succ 0

theorem step_well_formed (state : State) (event : Event) :
    WellFormed (step state event) := by
  cases event <;> exact Nat.lt_succ_self state.next

private theorem beq_self (value : Nat) : (value == value) = true := by
  induction value with
  | zero => rfl
  | succ previous ih => exact ih

theorem begin_accepts_current (state : State) :
    accepts (step state .begin) state.next = true := by
  change (state.next == state.next) = true
  exact beq_self state.next

theorem close_denies_every_token (state : State) (token : Nat) :
    accepts (step state .invalidate) token = false := by
  rfl

private theorem beq_false_of_different {left right : Nat} (different : left ≠ right) :
    (left == right) = false := by
  cases equality : (left == right) with
  | false => rfl
  | true => exact False.elim (different (Nat.eq_of_beq_eq_true equality))

theorem step_rejects_retained (retained : Nat) (state : State) (event : Event)
    (old : retained < state.next) : Safe retained (step state event) := by
  constructor
  · cases event <;> exact Nat.lt_trans old (Nat.lt_succ_self state.next)
  · have different : state.next ≠ retained := Nat.ne_of_gt old
    cases event with
    | begin =>
      change (state.next == retained) = false
      exact beq_false_of_different different
    | invalidate => rfl

theorem run_preserves_safe (retained : Nat) (events : List Event) (state : State)
    (safe : Safe retained state) : Safe retained (run state events) := by
  induction events generalizing state with
  | nil => exact safe
  | cons event rest ih =>
    exact ih (step state event) (step_rejects_retained retained state event safe.1)

theorem invalidation_never_revives_retained (retained : Nat) (events : List Event)
    (state : State) (old : retained < state.next) :
    accepts (run (step state .invalidate) events) retained = false := by
  exact (run_preserves_safe retained events (step state .invalidate)
    (step_rejects_retained retained state .invalidate old)).2

theorem history_well_formed (events : List Event) (state : State)
    (valid : WellFormed state) : WellFormed (run state events) := by
  induction events generalizing state with
  | nil => exact valid
  | cons event rest ih => exact ih (step state event) (step_well_formed state event)

/-- Reopening an old identity permits a previously cancelled continuation. -/
def unsafeBegin (state : State) : State := { state with closed := false }

theorem reused_token_counterexample :
    accepts (unsafeBegin initial) initial.token = true := by rfl

end ContextPublication

#print axioms ContextPublication.initial_well_formed
#print axioms ContextPublication.step_well_formed
#print axioms ContextPublication.begin_accepts_current
#print axioms ContextPublication.close_denies_every_token
#print axioms ContextPublication.step_rejects_retained
#print axioms ContextPublication.run_preserves_safe
#print axioms ContextPublication.invalidation_never_revives_retained
#print axioms ContextPublication.history_well_formed
#print axioms ContextPublication.reused_token_counterexample
