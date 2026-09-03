# Source Verification Prompt

Copy this prompt whenever a RUN|CAL formula or testing protocol is requested:

> Before implementing this calculation, identify whether it is already approved in the RUN|CAL handoff. If it is marked BLOCKED-SOURCE or the exact formula is absent, do not infer or invent it. Ask the owner to provide the original reference source (document/link/file), edition/version/date, page/section, exact formula/protocol, units, required inputs, population/context, exclusions, rounding, boundary behavior, and worked example. Verify that the source actually supports the proposed implementation and note any licensing/attribution constraints. Produce a versioned calculation contract and test vectors. Show the contract and discrepancies to the owner and obtain explicit approval before writing production code. Until approval, store manual values with provenance or show the feature as unavailable; do not silently substitute a similar formula.

## Calculation contract template

- Metric/protocol name and internal ID
- Status: proposed / approved / deprecated
- Authoritative source and exact location
- Source/version/license notes
- Formula/procedure in unambiguous notation
- Inputs, units, validation and missing-data behavior
- Effective-date and historical recomputation policy
- Boundaries, rounding and error behavior
- Worked examples/test vectors
- Intended UI language and limitations
- Protocol/formula version
- Approver and approval timestamp

