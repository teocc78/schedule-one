# Paid GOLD cart extension (spec 7B): design stub only

Not built on purpose. The spec requires a UCSB acceptable-use and Terms review first, and the Product Brief puts any bot that logs in with NetID/Duo or auto-enrolls out of scope.

Intended behavior once cleared: read the plan from Schedule One, fill the cart in the student's own already-signed-in GOLD tab, confirm seats and restrictions live, and report mismatches.

Hard guardrails: cart only (student clicks Enroll); never ask for, store or type a password or Duo code; stop at any login wall; never change existing enrollments; stop on title mismatch and say "not yet posted" instead of guessing; no racing at pass open.
