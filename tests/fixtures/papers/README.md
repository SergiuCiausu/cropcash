# Synthetic APIA papers (docs/apia-documents-autofill-plan.md, step 1)

Every file here is **made up**. The fields and labels follow the official 2026 forms (sources in the plan, §1.4). The
people, numbers, IBANs and CNPs are fake, built around Ion's demo farm: Măldăeni, Teleorman (SIRUTA 153277), blocs 286
and 293, 8 ha wheat + 7 ha maize. **Never put a real farmer's paper here.**

Each file has:
- `paper`: the id in the plan's §1 (P1, P1b, P3–P10, D5, D6);
- `kind`: the `DOCUMENT_KINDS` value it will be read as (plan §3.1; most kinds don't exist in code yet);
- `form`: the official form or annex it imitates, and `checked`: `"official"` when its layout comes from the official
  model, `"described"` when only a description of it was found (then the layout is a guess);
- `printed`: what's on the paper, as text, exactly as printed (Romanian number format, upper case where the form uses it);
- `expected`: what a reader + normaliser must produce. Money in bani, areas in ari, litres in centilitres, all integers.
  `expected` never holds a CNP, an IBAN, a phone number or an address.

What's **not** here, and why:
- D1–D4 (payment decisions, rejections, notices): no public model exists (open question #33). Their fixtures come from
  the first real decisions, rewritten with fake data.
- P2 (parcel map printout): not printed in 2026 (#36).
- D7 (diesel decision): there isn't one; MADR approves each quarter by order.
- P11, T1–T4: when their steps start (plan §8, steps 5 and 9).
- PDFs and phone photos of these papers: step 11 (the real test). These JSON files are for the unit tests of step 5.

Found while writing them: an ear tag (`RO` + 13 digits, P1b field 52) looks like a CNP to `hasPersonalNumber`, so
today a reader would blank it. The P1b reader (step 5) has to tell them apart.

`papers.test.ts` (in `packages/shared/src/documents/`) checks that every file is well-formed, marked synthetic, and that
no `expected` holds a personal number.
