namespace PrivacyFrames.WasmBounds

/-- The Wasm32 address space includes byte positions 0 through 2^32 - 1. -/
def modulus : Nat := 4294967296

/-- C computes a uint32 shift followed by a uint32 addition. Width is 2^shift;
this multiplication/modulo form states the arithmetic correspondence premise. -/
def address (offset index width : Nat) : Nat :=
  (offset + (index * width) % modulus) % modulus

theorem element_fits (offset index length width bytes : Nat)
    (within : index < length)
    (viewFits : offset + length * width ≤ bytes) :
    offset + index * width + width ≤ bytes := by
  have scaled := Nat.mul_le_mul_right width within
  have extended := Nat.add_le_add_left scaled offset
  have form : offset + index * width + width = offset + (index + 1) * width := by
    exact (Nat.add_assoc offset (index * width) width).trans
      (congrArg (Nat.add offset) (Nat.succ_mul index width)).symm
  rw [form]
  exact Nat.le_trans extended viewFits

theorem mathematical_address_bounded (offset index length width bytes : Nat)
    (within : index < length) (positive : 0 < width)
    (viewFits : offset + length * width ≤ bytes)
    (memoryBound : bytes ≤ modulus) :
    offset + index * width < modulus := by
  have fits := element_fits offset index length width bytes within viewFits
  have belowEnd : offset + index * width < offset + index * width + width :=
    Nat.lt_add_of_pos_right positive
  exact Nat.lt_of_lt_of_le belowEnd (Nat.le_trans fits memoryBound)

theorem remainder_unchanged (value bound : Nat) (within : value < bound) :
    value % bound = value := by
  cases value with
  | zero => rfl
  | succ value =>
    change (if bound ≤ value + 1 then (value + 1).modCore bound else value + 1) = value + 1
    exact ite_eq_right (Nat.not_le_of_gt within)

theorem uint32_address_exact (offset index length width bytes : Nat)
    (within : index < length) (positive : 0 < width)
    (viewFits : offset + length * width ≤ bytes)
    (memoryBound : bytes ≤ modulus) :
    address offset index width = offset + index * width := by
  have bounded := mathematical_address_bounded offset index length width bytes
    within positive viewFits memoryBound
  have productBound : index * width < modulus :=
    Nat.lt_of_le_of_lt (Nat.le_add_left _ _) bounded
  unfold address
  rw [remainder_unchanged _ _ productBound, remainder_unchanged _ _ bounded]

theorem uint32_access_within_view (offset index length width bytes : Nat)
    (within : index < length) (positive : 0 < width)
    (viewFits : offset + length * width ≤ bytes)
    (memoryBound : bytes ≤ modulus) :
    address offset index width + width ≤ bytes := by
  rw [uint32_address_exact offset index length width bytes within positive viewFits memoryBound]
  exact element_fits offset index length width bytes within viewFits

#print axioms element_fits
#print axioms mathematical_address_bounded
#print axioms remainder_unchanged
#print axioms uint32_address_exact
#print axioms uint32_access_within_view
end PrivacyFrames.WasmBounds
