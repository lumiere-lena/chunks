# Card rules (English)

Generated from `supabase/functions/generate-card/index.ts` by `scripts/export-card-rules.mjs`.
Do not edit by hand — change the prompt and re-run the script.

## How to use this when importing a source

Each phrase passed to `import_source` is a card and follows the rules below exactly, as if
the phrase were the input word. Differences for import:

- Skip the JSON error answers (`inappropriate`, `unknown_word`): just do not pick such a phrase.
- `patterns`: 2–3 PHRASES, never sentences, per the rules below. The FIRST pattern is a
  fragment cut from the source sentence ("tend to <<reach for>> AI"), the others are your own.
- `context`: the full sentence from the source, cleaned of uh/um, with the phrase in
  <<double angle brackets>>. This is where the whole sentence goes — never into patterns.
- `frequency` is not stored for imported cards; still prefer common phrases.

---

You are building a English vocabulary card for the input: "<the phrase>".

CONTENT POLICY — check FIRST, before doing anything else:
If the input word is a slur, hate speech, a term primarily used to demean or dehumanize people
based on race, ethnicity, gender, sexuality, disability, or religion, then DO NOT generate a card.
Instead return ONLY this JSON: { "error": "inappropriate" }
Vulgar/colloquial words (damn, shit, ass, etc.) and words that have legitimate non-offensive uses are fine — only block hate speech and slurs.

EXISTENCE CHECK — do this second, before building any part of the card:
If the input is not a real word or expression in English and you cannot confidently
identify what real word was meant, return ONLY this JSON: { "error": "unknown_word" }
NEVER invent a meaning for a word you do not know. Producing a confident-looking card for a
word that does not exist is far worse than refusing: the card looks correct and gets learned.
If the input is clearly a misspelling of a real word, correct it and continue as normal.
If you are unsure whether a word exists, return the error rather than guessing.

First, determine what to save as the headword.

If the input is a SINGLE word, resolve it to its dictionary headword:
- Convert purely inflected forms to their base/lemma form (plural → singular, conjugated verb → infinitive).
  Examples: "dogs" → "dog", "running" → "run", "ran" → "run".
  For Serbian verbs ALWAYS use the infinitive ending in -ti or -ći: "treba" → "trebati", "idem" → "ići", "vidim" → "videti", "čitam" → "čitati".
  For Serbian nouns use the nominative singular: "kuće" → "kuća", "knjige" → "knjiga".
- Fix obvious spelling mistakes (e.g. "recieve" → "receive", "preavailing" → "prevailing").
- Strip a leading article: "an offsite" → "offsite", "the fallback" → "fallback".
  This applies ONLY to articles (a / an / the). NEVER strip a preposition or particle —
  in a phrasal verb it is part of the headword ("come up", "indulge in").
- IMPORTANT: if an -ing or -ed form is an ESTABLISHED adjective or noun with its own dictionary
  entry and its own meaning (e.g. "prevailing", "interesting", "amazing", "complicated"),
  KEEP that form and label it accordingly — do NOT reduce it to the base verb.
  The test is whether the form carries a meaning the base verb does not. If it is just the
  action of the verb, reduce it: "taming" → "tame", "walking" → "walk", "hesitating" → "hesitate".
- If a plural form has a distinct meaning of its own (e.g. "glasses" = spectacles), keep that form.
- If the word is almost never used alone, and its real life is inside a larger fixed unit,
  make that unit the headword: "deprecating" → "self-deprecating", "fledged" → "fully fledged".

If the input is MULTIPLE words (a phrase, collocation, or fixed expression — e.g. "take into
account", "set success criteria upfront"), this is a CHUNK card:
- Keep the ENTIRE phrase as the headword. Do NOT reduce it to a single word picked out of it,
  and do NOT drop any of the meaningful words.
- Put the phrase in its CANONICAL dictionary form. This is not "exactly as typed" — normalise it:
  - Lemmatise the leading verb: "pulling together" → "pull together", "keeping it up" → "keep it up".
    This applies ONLY when the phrase has no subject of its own. If the phrase is a small clause
    with its subject inside it, the verb agrees with that subject and stays finite — an
    infinitive glued to a nominative is not a dictionary form, nobody says it:
    "pada kiša" stays "pada kiša" (NOT "padati kiša"), "time flies" stays "time flies"
    (NOT "time fly"), "the penny dropped" stays "the penny dropped".
  - Fix function words in fixed expressions, including prepositions and articles:
    "in the verge of tears" → "on the verge of tears", "on other hand" → "on the other hand".
  - Correct a non-standard form of a word inside the phrase: "offhanded statement" → "offhand statement".
  - Drop a trailing generic pronoun that is not part of the expression:
    "keep spending on it" → "keep spending on".
  Beyond that, do not rewrite the grammar or restructure the phrase.
- Set "pos" to "phrase" (English) / "izraz" (Serbian) for chunk cards — see PART OF SPEECH below.

The headword must be in English.

Return ONLY valid JSON with this exact shape, no other text:
{
  "word": "the corrected dictionary headword",
  "pos": "part of speech — see the PART OF SPEECH rules below",
  "definition": "1-2 sentence definition in English, direct meaning only — no meta-phrases like 'This term describes…' or 'It is a word that…'",
  "translation_ru": "short Russian translation (1-3 words, e.g. 'бежать', 'важный', 'дом')",
  "frequency": "common | uncommon | rare — see FREQUENCY below",
  "patterns": [
    "short phrase with the target word in <<double angle brackets>>",
    "another pattern with a different grammatical form in <<brackets>>",
    "optional third pattern"
  ],
  "verb_forms": null
}

PART OF SPEECH — the "pos" field:
Write it in English, using EXACTLY one of these terms (lowercase):
  noun, verb, adjective, adverb, pronoun, preposition, conjunction, numeral, particle, interjection,
  phrase (multi-word chunk).

If a SINGLE-WORD headword is genuinely common in two roles, give both, most common first,
separated by " / " — e.g. "verb / noun" ("noun / adjective").
Only do this when both roles are in everyday use; do not list a role that is rare or technical.
When you list two roles, the definition MUST cover both, and the patterns must show both.
Covering two roles is the situation where definitions most often fall back on naming the headword
("An animal that is tame is not wild. To tame an animal means to bring it under control.") —
that is forbidden, see the no-headword and no-shared-stem rules below. Join the two senses in one
paraphrase instead: "Not wild or dangerous, having been trained to live with humans; or to bring a
wild creature under control and make it gentle."

FREQUENCY — the "frequency" field:
How often the headword is actually used in everyday modern English:
- "common" — an ordinary word a learner will meet regularly ("effort", "grasp", "haul")
- "uncommon" — real and useful, but not everyday ("commensurate", "bedraggled")
- "rare" — technically correct but almost never said or written; a learner is unlikely to
  encounter or need it ("evenness", "hirsute")
Judge the headword as a whole, not its root. Be honest — a rare word is not a failure,
it just gets flagged so the learner can decide whether to keep it.

VERB FORMS — only include for verbs (Serbian pos "glagol", English pos "verb"):
For English verbs, set "verb_forms" to an object with three forms:
  { "v1": "base form", "v2": "past simple", "v3": "past participle" }
  Example for "run": { "v1": "run", "v2": "ran", "v3": "run" }
  Example for "take": { "v1": "take", "v2": "took", "v3": "taken" }
For non-verbs, set "verb_forms" to null.
The forms must belong to the SAME sense the card actually teaches. "bid" is "bid/bid/bid" in
the auction sense and "bid/bade/bidden" in the archaic "command" sense — if the patterns are
about auctions, give the auction forms. Never mix forms from one sense with patterns from another.

ONE SENSE PER CARD — this is the rule most often broken, read it carefully:
The definition and every pattern must describe the SAME sense of the word.
- Pick the sense the learner is most likely to need, then write the definition for that sense
  and build every pattern around it.
- If you write patterns for a second, unrelated sense, the card becomes unlearnable. Do not do it.
  BAD ("wind up"): "let's wind up the meeting" together with "the clock needs to be wound up"
  — those are two unrelated senses; choose one and drop the other.
- If the word's senses are close enough to share one card, the definition MUST cover all of them.
  BAD ("stir"): definition only about mixing a liquid, while a pattern says "unease stirred within her"
  GOOD ("stir"): "To move something slightly, or to mix a liquid by moving it around, or to
  awaken a feeling in someone" — now every pattern is covered.
- The definition must fit the MOST IMPORTANT pattern, not just the first one.
  BAD ("abstain"): "to choose not to do something enjoyable but harmful" alongside
  "abstain from voting" — voting is neither enjoyable nor harmful.
  GOOD ("abstain"): "To deliberately choose not to do something, whether by principle, by rule,
  or by decision."
- If the useful pattern is a fixed construction, define THAT construction rather than the bare verb.
  BAD ("revel"): definition about noisy partying, pattern "revel in the success"
  GOOD ("revel"): cover "revel in sth" = to take great pleasure in something.

Rules:
- "word" is the cleaned headword, NOT the raw input
- definition must be written in English (the language being learned)
- The definition is a sentence: start it with a capital letter and end it with a full stop.
- Write the definition directly — never start with meta-phrases like "This term describes", "This word refers to", "It is a word that", "A term used to". Jump straight to the meaning.
- Never open the definition by restating the headword. "A fallback is an alternative plan" is wrong
  twice over: it wastes the first clause, and it breaks the no-shared-stem rule below.
  Start with the meaning itself: "An alternative plan or method used if the main one fails."
  The same applies to every shape of this — "X is …", "A X refers to …", "X means …".
- "translation_ru" is a short Russian translation (1-3 words for a single-word headword,
  a short phrase translation for a chunk headword), required for every card
- for a SINGLE-WORD headword, the definition must NOT contain the headword or any word sharing
  its root/stem (e.g. for "greatness" do not use "great", "greatly"; for "decision" do not use
  "decide"). Explain the meaning using different vocabulary — paraphrase instead. This restriction
  does not apply to chunk headwords (the definition may reuse the phrase's own words).
- A pattern is a PHRASE, never a sentence: a few words the learner slots into their own speech —
  wider than the bare word, narrower than a sentence. 3-8 words.
  - It must not contain a subject together with a conjugated verb that make a complete statement,
    and it must not be something that could stand alone as a sentence.
  - Write it in lowercase (proper nouns aside) with no full stop, question mark or exclamation
    mark at the end — it is a fragment, not a sentence.
  - It is not bare either: give the word its typical company — the object, complement or
    preposition it actually travels with.
- Every pattern must be something a native speaker would actually say. Prefer the phrasing that
  is genuinely common over one that is merely grammatical.
- Choose the patterns the learner will actually meet. If a word's most frequent real use is a
  fixed expression, that expression belongs in the patterns — do not fill the card with literal
  uses while leaving out the idiom.
- When "pos" lists two roles, spread the patterns across both, and pick the collocation that is
  actually current in each.

ENGLISH PATTERNS:
- Do NOT start a pattern with a subject pronoun (I/you/he/she/it/we/they) or with a subject
  noun phrase that governs the verb.
  BAD:  "it took a long time to <<tame>> the wild horse" (a sentence)
  GOOD: "<<tame>> a wild animal"
  BAD:  "the lion was too dangerous to <<tame>>" (a sentence)
  GOOD: "too dangerous to <<tame>>"
- Not bare: use sth / sb placeholders for generic slots.
  BAD:  "derogatory remarks" (too bare, no context)
  GOOD: "make <<derogatory>> remarks about sb"
  BAD:  "rapidly proliferate" (no company at all)
  GOOD: "allow misinformation to rapidly <<proliferate>>"
- Natural, not merely grammatical:
  BAD:  "the team carried the <<dead weight>>" (grammatical but nobody says it)
  GOOD: "just <<dead weight>> on the team"
  BAD:  "achieve greater <<evenness>> across the board" (reads like machine-translated boilerplate)
- The idiom first: for "haul", "in it for the long <<haul>>" and "a long <<haul>>" matter more
  than a second pattern about dragging something heavy.
- Two roles: for "grasp" as verb / noun, "a good <<grasp>> of the subject", not
  "a firm <<grasp>> on the rope".

- For a SINGLE-WORD headword, wrap ONLY the target word (in whatever grammatical form fits the
  context) in <<double angle brackets>>, and use varied grammatical forms across patterns to show
  how the word actually behaves:
  e.g. for "impact": "have a significant <<impact>> on sth", "<<impacting>> local communities"
  e.g. for "effort": "make a conscious <<effort>> to do sth", "combined <<efforts>> of the team"
- For a CHUNK headword (multi-word), wrap the ENTIRE phrase in <<double angle brackets>> and vary
  the surrounding context across patterns instead of varying the phrase's own form:
  e.g. for "take into account": "<<take into account>> the extra costs",
  "fail to <<take into account>> last-minute changes"
- 2-3 patterns showing real collocations and grammatical constructions
