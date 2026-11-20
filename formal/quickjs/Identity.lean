import Init.Data.List.Pairwise

namespace PrivacyFrames.Identity

/-- Largest exact identity accepted by the production contract. The exhausted
sentinel is one greater; JavaScript correspondence is checked separately. -/
def maximum : Nat := 9007199254740991

def Valid (next : Nat) : Prop := 1 ≤ next ∧ next ≤ maximum + 1

/-- The second component is either the allocated identity or local rejection.
The rejected transition leaves its private counter unchanged. -/
def allocate (next : Nat) : Nat × Option Nat :=
  if next ≤ maximum then (next + 1, some next) else (next, none)

theorem initial_valid : Valid 1 :=
  ⟨Nat.le_refl 1, Nat.succ_le_succ (Nat.zero_le maximum)⟩

theorem success_exact (next after identity : Nat)
    (success : allocate next = (after, some identity)) :
    identity = next ∧ after = next + 1 ∧ identity ≤ maximum := by
  unfold allocate at success
  split at success
  next available =>
    cases success
    exact ⟨rfl, rfl, available⟩
  next unavailable => cases success

theorem success_bounded (next after identity : Nat) (valid : Valid next)
    (success : allocate next = (after, some identity)) :
    1 ≤ identity ∧ identity ≤ maximum := by
  obtain ⟨same, _, bounded⟩ := success_exact next after identity success
  exact ⟨same ▸ valid.1, bounded⟩

theorem preserves_valid (next : Nat) (valid : Valid next) :
    Valid (allocate next).1 := by
  unfold allocate
  split
  next available =>
    exact ⟨Nat.le_trans valid.1 (Nat.le_succ next), Nat.succ_le_succ available⟩
  next unavailable => exact valid

theorem rejection_unchanged (next after : Nat)
    (rejection : allocate next = (after, none)) :
    after = next ∧ maximum < next := by
  unfold allocate at rejection
  split at rejection
  next available => cases rejection
  next unavailable =>
    cases rejection
    exact ⟨rfl, Nat.lt_of_not_ge unavailable⟩

theorem exhausted_rejects : allocate (maximum + 1) = (maximum + 1, none) := by
  unfold allocate
  exact ite_eq_right (Nat.not_succ_le_self maximum)

/-- Every rejected state in the valid domain is the unique exhausted sentinel. -/
theorem valid_rejection_exhausted (next after : Nat) (valid : Valid next)
    (rejection : allocate next = (after, none)) :
    next = maximum + 1 ∧ after = maximum + 1 := by
  obtain ⟨same, exhausted⟩ := rejection_unchanged next after rejection
  have exactNext : next = maximum + 1 := Nat.le_antisymm valid.2 exhausted
  exact ⟨exactNext, same.trans exactNext⟩

/-- A trace records arbitrary finite attempts, including any number of rejections.
Only successful allocations add an identity to the observed output sequence. -/
inductive Trace : Nat → List Nat → Nat → Prop where
  | stop (next : Nat) : Trace next [] next
  | rejected {next after final : Nat} {identities : List Nat}
      (step : allocate next = (after, none))
      (rest : Trace after identities final) : Trace next identities final
  | allocated {next after identity final : Nat} {identities : List Nat}
      (step : allocate next = (after, some identity))
      (rest : Trace after identities final) : Trace next (identity :: identities) final

theorem trace_final_valid {next final : Nat} {identities : List Nat}
    (trace : Trace next identities final) (valid : Valid next) : Valid final := by
  induction trace with
  | stop => exact valid
  | rejected step rest induction =>
    apply induction
    have preserved := preserves_valid _ valid
    rw [step] at preserved
    exact preserved
  | allocated step rest induction =>
    apply induction
    have preserved := preserves_valid _ valid
    rw [step] at preserved
    exact preserved

theorem trace_counter_matches_outputs {next final : Nat} {identities : List Nat}
    (trace : Trace next identities final) : final = next + identities.length := by
  induction trace with
  | stop => rfl
  | rejected step rest induction =>
    obtain ⟨same, _⟩ := rejection_unchanged _ _ step
    rw [same] at induction
    exact induction
  | allocated step rest induction =>
    obtain ⟨_, advanced, _⟩ := success_exact _ _ _ step
    rw [advanced] at induction
    exact induction.trans (Nat.succ_add _ _)

theorem trace_identity_bounds {next final : Nat} {identities : List Nat}
    (trace : Trace next identities final) :
    ∀ identity ∈ identities, next ≤ identity ∧ identity < final ∧ identity ≤ maximum := by
  induction trace with
  | stop =>
    intro identity member
    exact False.elim (List.not_mem_nil member)
  | rejected step rest induction =>
    obtain ⟨same, _⟩ := rejection_unchanged _ _ step
    rw [same] at induction
    exact induction
  | @allocated start after identity finish ids step rest induction =>
    obtain ⟨same, advanced, bounded⟩ := success_exact _ _ _ step
    intro item member
    cases member with
    | head =>
      have count := trace_counter_matches_outputs rest
      have lowerFinal := Nat.le_add_right after ids.length
      rw [← count] at lowerFinal
      rw [advanced] at lowerFinal
      refine ⟨?_, ?_, bounded⟩
      · rw [same]
        exact Nat.le_refl _
      · rw [same]
        exact Nat.lt_of_lt_of_le (Nat.lt_succ_self _) lowerFinal
    | tail _ member =>
      obtain ⟨lower, upper, bound⟩ := induction item member
      rw [advanced] at lower
      exact ⟨Nat.le_trans (Nat.le_succ _) lower, upper, bound⟩

theorem trace_strictly_increasing {next final : Nat} {identities : List Nat}
    (trace : Trace next identities final) : List.Pairwise (· < ·) identities := by
  induction trace with
  | stop => exact List.Pairwise.nil
  | rejected step rest induction => exact induction
  | allocated step rest induction =>
    apply List.Pairwise.cons _ induction
    intro item member
    obtain ⟨same, advanced, _⟩ := success_exact _ _ _ step
    have lower := (trace_identity_bounds rest item member).1
    rw [same, advanced] at *
    exact Nat.lt_of_lt_of_le (Nat.lt_succ_self _) lower

theorem trace_unique {next final : Nat} {identities : List Nat}
    (trace : Trace next identities final) : identities.Nodup := by
  exact (trace_strictly_increasing trace).imp (fun strict => Nat.ne_of_lt strict)

theorem trace_exhaustion_stable {final : Nat} {identities : List Nat}
    (trace : Trace (maximum + 1) identities final) :
    identities = [] ∧ final = maximum + 1 := by
  have stable : ∀ {start finish : Nat} {outputs : List Nat},
      Trace start outputs finish → start = maximum + 1 →
      outputs = [] ∧ finish = maximum + 1 := by
    intro start finish outputs path
    induction path with
    | stop => intro exhausted; exact ⟨rfl, exhausted⟩
    | rejected step rest induction =>
      intro exhausted
      obtain ⟨same, _⟩ := rejection_unchanged _ _ step
      exact induction (same.trans exhausted)
    | allocated step rest induction =>
      intro exhausted
      obtain ⟨same, _, bounded⟩ := success_exact _ _ _ step
      rw [same, exhausted] at bounded
      exact False.elim (Nat.not_succ_le_self maximum bounded)
  exact stable trace rfl

/-- Scope labels model distinct private engine identities. This does not claim
that numeric IDs are secret or provide bearer authorization. -/
theorem distinct_scopes_distinct_identities (leftScope rightScope leftId rightId : Nat)
    (different : leftScope ≠ rightScope) :
    (leftScope, leftId) ≠ (rightScope, rightId) := by
  intro equal
  exact different (Prod.mk.inj equal).1

end PrivacyFrames.Identity

#print axioms PrivacyFrames.Identity.initial_valid
#print axioms PrivacyFrames.Identity.success_exact
#print axioms PrivacyFrames.Identity.success_bounded
#print axioms PrivacyFrames.Identity.preserves_valid
#print axioms PrivacyFrames.Identity.rejection_unchanged
#print axioms PrivacyFrames.Identity.exhausted_rejects
#print axioms PrivacyFrames.Identity.valid_rejection_exhausted
#print axioms PrivacyFrames.Identity.trace_final_valid
#print axioms PrivacyFrames.Identity.trace_counter_matches_outputs
#print axioms PrivacyFrames.Identity.trace_identity_bounds
#print axioms PrivacyFrames.Identity.trace_strictly_increasing
#print axioms PrivacyFrames.Identity.trace_unique
#print axioms PrivacyFrames.Identity.trace_exhaustion_stable
#print axioms PrivacyFrames.Identity.distinct_scopes_distinct_identities
