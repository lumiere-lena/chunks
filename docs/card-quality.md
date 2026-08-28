# Card quality — measurements and plan

A living document. Append every measurement to the history table so it stays
visible whether quality is improving.

---

## Measurement history

| Date | Lang | Entries | With findings | Share | Note |
|---|---|---|---|---|---|
| 2026-08-28 | en | 91 | 32 | 35% | Baseline, before any fixes |
| 2026-08-28 | en | 89 | 4 | 4% | After the prompt rewrite, the SQL fixes and regeneration |
| 2026-08-28 | en | 89 | 3 | 3% | After forbidding a definition that restates its headword |

### 2026-08-28 by category

| Category | Entries | Examples |
|---|---|---|
| Word does not exist (hallucination) | 1 | abiquated |
| Malformed headword | 4 | an offsite, taming, in the verge of tears, offhanded statement |
| Duplicates (2 pairs) | 4 | pull together / pulling together, keep spending on / keep spending on it |
| Invented phrasal verb | 1 | inflate with |
| Wrong part of speech | 3 | pulling together, blown off the map, prone to indecision |
| No Russian translation | 12 | abstain, grit, passion, ransom… |
| Definition does not cover the patterns | 6 | abstain, stir, revel, grasp, wind up, haul |
| Rare word or unnatural pattern | 3 | evenness, deprecating, dead weight |
| Definition reuses the headword stem | 1 | wordsmith |
| Small formatting faults | 2 | hesitate (lowercase), bid (forms from the wrong sense) |

Categories overlap: 32 is the number of distinct entries carrying at least one
finding. Two of them (`pull together`, `keep spending on`) are correct in
themselves and appear only as the good half of a duplicate pair, so about 30
actually need work.

### Method

For the next measurement to be comparable it has to consist of the same two
parts:

1. **Automated checks** against the rules in the prompt: missing
   `translation_ru`, a definition reusing the headword stem, fewer than two
   patterns, a pattern without `<<>>` markers, a verb without `verb_forms` and
   the reverse, headwords that collide once normalised.
2. **Reading by eye** — everything else: words that do not exist, wrong parts
   of speech, definitions that do not cover their patterns, unnatural
   collocations.

The automated half lives in `scripts/check-cards.mjs`:

```
node scripts/check-cards.mjs --lang en
node scripts/check-cards.mjs --md review.md
```

It prints a row ready to paste into the table above. It catches 18 of the 91;
the rest of the baseline findings needed reading.

---

## Status

- **Prompt (P1–P12) — written and deployed 2026-08-28.** Five cases were
  checked by hand in the app and passed, including the one that matters most:
  an invented word is refused rather than given a card.
- **Data fixes — done.** `fix-cards-apply.sql` ran; 28 entries were then
  regenerated against the new prompt. English is at 4 findings out of 89.
- **Serbian — not reviewed yet.** Deliberately left until English was finished.
- Idiom translations — not started.

### What is left in English

Three findings, none urgent. `fallback` was the fourth and is fixed: its
definition opened "A fallback is an alternative plan…", which the prompt's list
of banned meta-phrases did not cover, since none of them took the shape of the
headword itself. Regenerating reproduced it word for word; only naming that
shape in the prompt changed the output.

- **interesting** — "holding one's interest" reuses the root. Minor.
- **wordsmith** — "skilled in the use of words" trips the same check, but a
  definition of this word can hardly avoid saying "words". Effectively a false
  positive.
- **pull together** — tagged `phrase` yet carries verb forms, so the checker
  objects. The forms are genuinely useful for a verb phrase; either the prompt
  should permit them or the check should allow them. A disagreement to settle,
  not a defect.

Tooling that came out of this work:

| Script | Purpose |
|---|---|
| `scripts/check-cards.mjs` | quality measurement, prints a row for the table above |
| `scripts/test-prompt.mjs` | runs the known failures against the current prompt, writes nothing |
| `scripts/fix-cards-preview.sql` | shows what the data fixes would do, read-only |
| `scripts/fix-cards-apply.sql` | applies them |
| `scripts/fix-cards.mjs` | same fixes plus regeneration, for running outside the SQL editor |

The `dryRun` flag on `generate-card` allows exercising the prompt without
touching the dictionary.

## Order of work

1. Prompt (P1–P12)
2. Data fixes (D1–D5) — regeneration depends on the new prompt
3. Idioms with their own translations
4. Re-measure and add a row to the history table

---

## Prompt rules

### P1. Do not invent words that do not exist

`abiquated` was not a failure to spot a typo — it was a meaning invented from
scratch for a root that does not exist, delivered with exactly the confidence
of a real entry.

**Decision (2026-08-28): the prompt alone, no external lookup.** One
hallucination in 91 entries is about one percent, and that does not justify a
network dependency, a separate warning mode in the UI, and logic that only
works for one language.

A Wiktionary check was prototyped and rejected. What was learned, in case the
decision is ever revisited:

- Wiktionary does report `abiquated` as missing and does catch invented words,
  but **only single words**: it carries lexicalised idioms, not free
  collocations, so chunks like `decision gate` or `working from feeling` all
  came back unknown — 16 false positives against 1 real find.
- **Serbian coverage is thin**: `držanje`, `premija`, `postepen` and `gajati`
  are ordinary Serbian words absent from both the English and the Serbian
  wiktionaries. Roughly 15% false positives.
- The language cannot be verified in batch: with several titles per request
  MediaWiki truncates the category list, which reported `insult` as
  non-English.
- `api.dictionaryapi.dev` is not a viable alternative — it returned `522` on
  every request when tested.

The prompt keeps the requirement: never build an entry for a word the model
does not know, return `{ "error": "unknown_word" }` instead. This reduces the
rate without guaranteeing anything, and that trade is accepted deliberately.

### P2. Do not produce duplicates

The cause was specific and sat in the prompt: for multi-word input it said
"Keep the ENTIRE phrase as the headword, **exactly as the words were typed**"
and "do not rewrite the grammar". That rule is what forbade turning
`pulling together` into `pull together`.

Now the leading verb of a verb phrase is lemmatised, and a trailing generic
pronoun is dropped: `keep spending on it` → `keep spending on`.

Separately, and **in code rather than the prompt**: before saving, look for a
near-duplicate headword in `dictionary` and say "you already have X". The
prompt cannot see the database and so can never know about a duplicate.

### P3. Correct function words inside fixed expressions

Chunks previously allowed only typo fixes, with grammar off limits — which is
how `in the verge of tears` reached the database. Idioms are now normalised to
canonical form, prepositions and articles included:

- `in the verge of tears` → `on the verge of tears`
- `offhanded statement` → `offhand statement`

### P4. Strip a leading article

`an offsite` → `offsite`. An article is not part of a dictionary entry. Worded
carefully so it never touches a preposition — in a phrasal verb the particle is
part of the headword.

### P5. Reduce a gerund to the infinitive

`taming` → `tame`. This collides with the existing rule that deliberately
**keeps** `-ing` forms which became words in their own right (`interesting`,
`amazing`), so the boundary is stated explicitly: keep the form only when it
carries a meaning the base verb does not.

### P6. The definition must cover every pattern

The most frequent content fault: a definition describing one sense while the
patterns show another.

- **abstain** — defined as "pleasant but harmful" while the main pattern is
  `abstain from voting`. Voting is neither. Now neutral: a deliberate choice
  not to do something, by principle, by rule, or by decision.
- **stir** — defined only as mixing with a spoon while two patterns out of
  three are elsewhere: `the wind stirred the leaves` and `unease stirred within
  her`. The second sense is the liveliest and was missing.
- **revel** — defined as noisy partying while the first pattern is
  `revel in the success`, i.e. `revel in sth`. The useful pattern is that one,
  and it was not what got described.
- **wind up** — patterns mixed two unrelated senses: concluding a meeting and
  winding a clock.

The rule: either the definition covers every sense in the patterns, or the
patterns stay within one sense. Mixing unrelated senses on one card is banned.

### P7. Verb forms belong to the sense on the card

**bid** was given `bade / bidden` (the "command" sense) while two patterns out
of three were about auctions, where the forms are `bid / bid / bid`.

### P8. Words that live as two parts of speech

**grasp** was tagged a verb while its third pattern, `a firm grasp on the
rope`, is a noun. When a word is common in both roles, showing both is more
useful. A composite `pos` such as `verb / noun` is allowed, on the condition
that the definition covers both roles. For `grasp`, `a good grasp of the
subject` also replaces the rope.

### P9. Estimate how current the word is

The model now sets `frequency: common | uncommon | rare`, and the draft screen
warns on a rare word before it is saved.

`evenness` is the case in point: the noun barely occurs in live speech, and
`achieve greater evenness across the board` reads like a machine-translated
report.

The estimate is approximate, which is enough to flag obvious exotica but not
enough to be a hard filter — it is only ever a warning.

### P10. Prefer the form the word actually lives in

**deprecating** hardly exists without `self-`. The useful word is
`self-deprecating`. When a word almost always appears inside a larger fixed
unit, that unit becomes the headword.

### P11. Patterns have to be natural

`the team carried the dead weight` is grammatical but nobody says it; `he's
just dead weight on the team` is what people say. A pattern must be something a
native speaker would actually produce, and where a word's most frequent real
use is a fixed expression, that expression belongs in the patterns — for
`haul`, `in it for the long haul` matters more than a second sentence about
dragging something heavy.

### P12. Small things

- `hesitate` had a lowercase definition while every other entry is capitalised.

---

## Data fixes

Changes to data, not to the prompt.

### D1. Delete

- **abiquated** — not a real word. Deleted outright: the original input could
  not be recalled and `antiquated` is not it.
- **inflate with** — an invented phrasal verb. In `inflate a balloon with
  helium` the preposition introduces an instrument; in `the lungs inflate with
  each breath` it means "at each". The entry becomes `inflate`.

### D2. Merge duplicates

- `pulling together` + `pull together` → keep `pull together`
- `keep spending on it` + `keep spending on` → keep `keep spending on`

Review progress from the disappearing card is **carried over**: the greater
interval and review count win, and the `reviews` rows are repointed at the
surviving `card_id`.

The preview run showed neither pair actually collides at the card level — the
duplication exists only in the shared dictionary — so in practice these are
renames, and the merge logic never fires.

### D3. Fix headwords

- `in the verge of tears` → `on the verge of tears`
- `offhanded statement` → `offhand statement`
- `an offsite` → `offsite`
- `taming` → `tame`

The headword is part of the pronunciation key, so renaming means the audio is
synthesised again — a few credits, not a problem.

### D4. Fill in missing translations

Twelve entries have no `translation_ru`, all early, from before the field
became mandatory: `abstain`, `dead weight`, `determination`, `fallback`,
`feeble`, `generic`, `grit`, `haul`, `passion`, `ransom`, `wimpy`, `wordsmith`.

Covered by regeneration, since the prompt now requires the field.

### D5. Regenerate for content

`abstain`, `stir`, `revel`, `grasp`, `wind up`, `haul`, `bid`, `dead weight`,
`deprecating`, `prone to indecision`, `blown off the map`, `pulling together`,
`evenness`, `wordsmith`, `hesitate` — only after the prompt is fixed, otherwise
the same faults come back.

---

## Separate feature: idioms with their own translation

Not a prompt change — a change to the schema and the interface.

**The problem.** For `haul`, the live usage is not the literal verb at all but
the noun and a set of fixed phrases:

- `long-haul flight`
- `it's a long haul` — this will take a while, this is hard
- `in it for the long haul`
- `a shopping haul` / `a big haul`
- `haul myself out of bed`
- `haul gear up the hill`

Not one of them made it onto the card.

**What is needed.** Such phrases should reach the usage patterns, and a fixed
expression should carry its own translation — shown when looking at the word,
hidden during recall, where it would give the answer away.

**How it lands in the code.** `patterns` is currently an array of strings and
would become an array of objects: `{ text, translation_ru?, idiom? }`. The
column is already `jsonb` so no type migration is needed, but:

- 359 existing entries hold strings, so the code has to accept both shapes
- `TappablePattern` is used on three screens
- in Study the translation shows only on the revealed side

Roughly half a day, and worth doing after the prompt is fixed — otherwise
everything gets regenerated twice.

**Related.** `prone to indecision` is tagged an adjective though it is a
phrase. More useful would be the pattern itself, `prone to + noun/-ing`
(`prone to overthinking`, `prone to injury`). Same class of problem: teaching a
construction rather than a single word.

---

## Decisions

Settled 2026-08-28.

1. **No external word lookup.** The prompt alone. Details and the rejected
   prototype's results are in P1.
2. **`abiquated` is simply deleted.** The original word could not be recalled;
   `antiquated` is not it. Nothing replaces it.
3. **Review progress is carried over** when duplicates are merged, not reset.
4. **Composite `pos`** (`verb / noun`) accepted, see P8.
