namespace RegistrationQueue

/-- One scope's update/unregister jobs. Registration replacement is excluded. -/
inductive Job where
  | update
  | unregister
  deriving DecidableEq

structure State where
  registered : Bool
  pending : List Job
  updateInFlight : Bool
  unregisterAcknowledged : Bool
  requests : Nat
  deriving DecidableEq

inductive Event where
  | enqueue (job : Job)
  | advance
  | finishUpdate

def initial : State := ⟨true, [], false, false, 0⟩

/-- `advance` starts at most one job. An update remains active until its response
completes. A request is counted at start, before its response can be held. -/
def step (state : State) : Event → State
  | .enqueue job => { state with pending := state.pending ++ [job] }
  | .finishUpdate => { state with updateInFlight := false }
  | .advance =>
    if state.updateInFlight then state
    else match state.pending with
      | [] => state
      | .unregister :: rest => { state with
          registered := false, pending := rest, unregisterAcknowledged := true }
      | .update :: rest => { state with
          pending := rest
          updateInFlight := state.registered
          requests := state.requests + if state.registered then 1 else 0 }

def run (state : State) : List Event → State
  | [] => state
  | event :: rest => run (step state event) rest

/-- Acknowledgment is a fence only in the absence of registration replacement. -/
def WellFormed (state : State) : Prop :=
  state.unregisterAcknowledged = true →
    state.registered = false ∧ state.updateInFlight = false

theorem initial_well_formed : WellFormed initial := by
  simp [WellFormed, initial]

theorem held_update_blocks_queue (state : State)
    (held : state.updateInFlight = true) : step state .advance = state := by
  simp [step, held]

theorem step_preserves_well_formed (state : State) (event : Event)
    (wellFormed : WellFormed state) : WellFormed (step state event) := by
  cases event with
  | enqueue job => exact wellFormed
  | finishUpdate =>
    intro acknowledged
    exact ⟨(wellFormed acknowledged).1, rfl⟩
  | advance =>
    by_cases held : state.updateInFlight = true
    · simpa [step, held] using wellFormed
    · have idle : state.updateInFlight = false := Bool.eq_false_iff.mpr held
      cases contents : state.pending with
      | nil => simpa [step, idle, contents] using wellFormed
      | cons job rest =>
        cases job with
        | unregister => simp [WellFormed, step, idle, contents]
        | update =>
          simp only [WellFormed, step, idle, Bool.false_eq_true, ite_false, contents]
          intro acknowledged
          have unregistered := (wellFormed acknowledged).1
          exact ⟨unregistered, unregistered⟩

theorem acknowledged_step_no_request (state : State) (event : Event)
    (wellFormed : WellFormed state) (acknowledged : state.unregisterAcknowledged = true) :
    (step state event).requests = state.requests ∧
      (step state event).unregisterAcknowledged = true := by
  obtain ⟨unregistered, idle⟩ := wellFormed acknowledged
  cases event with
  | enqueue job => exact ⟨rfl, acknowledged⟩
  | finishUpdate => exact ⟨rfl, acknowledged⟩
  | advance =>
    cases contents : state.pending with
    | nil => simp [step, idle, contents, acknowledged]
    | cons job rest =>
      cases job <;> simp [step, idle, contents, unregistered, acknowledged]

theorem arbitrary_trace_well_formed (state : State) (events : List Event)
    (wellFormed : WellFormed state) : WellFormed (run state events) := by
  induction events generalizing state with
  | nil => exact wellFormed
  | cons event rest induction =>
    exact induction (step state event) (step_preserves_well_formed state event wellFormed)

theorem acknowledged_arbitrary_trace_no_request (state : State) (events : List Event)
    (wellFormed : WellFormed state) (acknowledged : state.unregisterAcknowledged = true) :
    (run state events).requests = state.requests ∧
      (run state events).unregisterAcknowledged = true := by
  induction events generalizing state with
  | nil => exact ⟨rfl, acknowledged⟩
  | cons event rest induction =>
    have preserved := step_preserves_well_formed state event wellFormed
    have quiet := acknowledged_step_no_request state event wellFormed acknowledged
    have later := induction (step state event) preserved quiet.2
    exact ⟨later.1.trans quiet.1, later.2⟩

theorem held_unregister_not_acknowledged :
    (run initial [.enqueue .update, .advance, .enqueue .unregister, .advance]).unregisterAcknowledged
      = false := by rfl

theorem fence_does_not_erase_prior_request :
    (run initial [.enqueue .update, .advance, .enqueue .unregister, .finishUpdate,
      .advance, .enqueue .update, .advance]).requests = 1 ∧
    (run initial [.enqueue .update, .advance, .enqueue .unregister, .finishUpdate,
      .advance, .enqueue .update, .advance]).unregisterAcknowledged = true := by
  exact ⟨rfl, rfl⟩

theorem without_unregister_two_requests :
    (run initial [.enqueue .update, .advance, .finishUpdate,
      .enqueue .update, .advance]).requests = 2 := by rfl

end RegistrationQueue
