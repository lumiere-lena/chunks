import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LANG_NAMES: Record<string, string> = {
  sr: 'Serbian',
  en: 'English',
}

// Free users cannot generate cards at all

const MODEL_ID = 'google/gemini-2.5-flash'

const FREQUENCIES = new Set(['common', 'uncommon', 'rare'])

async function generateWithOpenRouter(
  word: string,
  langName: string,
): Promise<{ word: string; pos: string; definition: string; translation_ru?: string; frequency?: string; patterns: string[]; verb_forms?: Record<string, string> }> {

  const isSr = langName === 'Serbian'

  const prompt = `You are building a ${langName} vocabulary card for the input: "${word}".

CONTENT POLICY — check FIRST, before doing anything else:
If the input word is a slur, hate speech, a term primarily used to demean or dehumanize people
based on race, ethnicity, gender, sexuality, disability, or religion, then DO NOT generate a card.
Instead return ONLY this JSON: { "error": "inappropriate" }
Vulgar/colloquial words (damn, shit, ass, etc.) and words that have legitimate non-offensive uses are fine — only block hate speech and slurs.

EXISTENCE CHECK — do this second, before building any part of the card:
If the input is not a real word or expression in ${langName} and you cannot confidently
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
  - Fix function words in fixed expressions, including prepositions and articles:
    "in the verge of tears" → "on the verge of tears", "on other hand" → "on the other hand".
  - Correct a non-standard form of a word inside the phrase: "offhanded statement" → "offhand statement".
  - Drop a trailing generic pronoun that is not part of the expression:
    "keep spending on it" → "keep spending on".
  Beyond that, do not rewrite the grammar or restructure the phrase.
- Set "pos" to "phrase" (English) / "izraz" (Serbian) for chunk cards — see PART OF SPEECH below.

The headword must be in ${langName}.

Return ONLY valid JSON with this exact shape, no other text:
{
  "word": "the corrected dictionary headword",
  "pos": "part of speech — see the PART OF SPEECH rules below",
  "definition": "1-2 sentence definition in ${langName}, direct meaning only — no meta-phrases like 'This term describes…' or 'It is a word that…'",
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
${isSr
  ? `Write it in Serbian, using EXACTLY one of these terms (lowercase):
  imenica (noun), glagol (verb), pridev (adjective), prilog (adverb),
  zamenica (pronoun), predlog (preposition), veznik (conjunction),
  broj (numeral), rečca (particle), uzvik (interjection), izraz (multi-word chunk).
  For nouns, append the grammatical gender in parentheses:
  (m) muški rod, (ž) ženski rod, (s) srednji rod — e.g. "imenica (m)", "imenica (ž)", "imenica (s)".
  Do NOT use English part-of-speech names like "noun", "verb" or "adjective".`
  : `Write it in English, using EXACTLY one of these terms (lowercase):
  noun, verb, adjective, adverb, pronoun, preposition, conjunction, numeral, particle, interjection,
  phrase (multi-word chunk).`}

If a SINGLE-WORD headword is genuinely common in two roles, give both, most common first,
separated by " / " — e.g. "verb / noun" (${isSr ? '"glagol / imenica"' : '"noun / adjective"'}).
Only do this when both roles are in everyday use; do not list a role that is rare or technical.
When you list two roles, the definition MUST cover both, and the patterns must show both.

FREQUENCY — the "frequency" field:
How often the headword is actually used in everyday modern ${langName}:
- "common" — an ordinary word a learner will meet regularly ("effort", "grasp", "haul")
- "uncommon" — real and useful, but not everyday ("commensurate", "bedraggled")
- "rare" — technically correct but almost never said or written; a learner is unlikely to
  encounter or need it ("evenness", "hirsute")
Judge the headword as a whole, not its root. Be honest — a rare word is not a failure,
it just gets flagged so the learner can decide whether to keep it.

VERB FORMS — only include for verbs (Serbian pos "glagol", English pos "verb"):
${langName === 'English'
  ? `For English verbs, set "verb_forms" to an object with three forms:
  { "v1": "base form", "v2": "past simple", "v3": "past participle" }
  Example for "run": { "v1": "run", "v2": "ran", "v3": "run" }
  Example for "take": { "v1": "take", "v2": "took", "v3": "taken" }`
  : `For Serbian verbs, set "verb_forms" to an object with two present-tense forms:
  { "1sg": "1st person singular present", "3pl": "3rd person plural present" }
  Example for "ići": { "1sg": "idem", "3pl": "idu" }
  Example for "čitati": { "1sg": "čitam", "3pl": "čitaju" }
  Example for "trebati": { "1sg": "trebam", "3pl": "trebaju" }`}
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
- definition must be written in ${langName} (the language being learned)
- The definition is a sentence: start it with a capital letter and end it with a full stop.
- Write the definition directly — never start with meta-phrases like "This term describes", "This word refers to", "It is a word that", "A term used to". Jump straight to the meaning.
- "translation_ru" is a short Russian translation (1-3 words for a single-word headword,
  a short phrase translation for a chunk headword), required for every card
- for a SINGLE-WORD headword, the definition must NOT contain the headword or any word sharing
  its root/stem (e.g. for "greatness" do not use "great", "greatly"; for "decision" do not use
  "decide"). Explain the meaning using different vocabulary — paraphrase instead. This restriction
  does not apply to chunk headwords (the definition may reuse the phrase's own words).
- Each pattern must be a meaningful collocation (4-10 words) — not a bare two-word pair, but not a full sentence either.
  Include enough context to show a real situation: a subject, an object, or a typical complement.
  Use sth/sb/smn placeholders for generic objects when helpful.
  BAD:  "derogatory remarks" (too bare, no context)
  GOOD: "make <<derogatory>> remarks about sb"
  BAD:  "rapidly proliferate" (no subject)
  GOOD: "misinformation can rapidly <<proliferate>>"
- Every pattern must be something a native speaker would actually say. Prefer the phrasing that
  is genuinely common over one that is merely grammatical.
  BAD:  "the team carried the <<dead weight>>" (grammatical but nobody says it)
  GOOD: "he's just <<dead weight>> on the team"
  BAD:  "achieve greater <<evenness>> across the board" (reads like machine-translated boilerplate)
- Choose the patterns the learner will actually meet. If a word's most frequent real use is a
  fixed expression, that expression belongs in the patterns — do not fill the card with literal
  uses while leaving out the idiom.
  For "haul", "in it for the long <<haul>>" and "a long <<haul>>" matter more than a second
  pattern about dragging something heavy.
- When "pos" lists two roles, spread the patterns across both, and pick the collocation that is
  actually current in each.
  BAD  for "grasp" as verb / noun: "a firm <<grasp>> on the rope"
  GOOD for "grasp" as verb / noun: "a good <<grasp>> of the subject"
- For a SINGLE-WORD headword, wrap ONLY the target word (in whatever grammatical form fits the
  context) in <<double angle brackets>>, and use varied grammatical forms across patterns to show
  how the word actually behaves:
  e.g. for "trebati": "meni <<treba>> pomoć", "<<trebam>> da učim", "ne <<treba>> da brineš"
  e.g. for "impact": "have a significant <<impact>> on sth", "<<impacting>> local communities"
  e.g. for "effort": "make a conscious <<effort>> to do sth", "combined <<efforts>> of the team"
- For a CHUNK headword (multi-word), wrap the ENTIRE phrase in <<double angle brackets>> and vary
  the surrounding sentence context across patterns instead of varying the phrase's own form:
  e.g. for "take into account": "you need to <<take into account>> the extra costs",
  "the plan doesn't <<take into account>> last-minute changes"
- 2-3 patterns showing real collocations and grammatical constructions`

  console.log(`[generate-card] model=${MODEL_ID}, word="${word}", lang=${langName}`)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chunks.runtheshow.dev',
      'X-Title': 'Chunks',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 512,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[generate-card] OpenRouter error ${res.status}: ${text}`)
    throw new Error(`OpenRouter error ${res.status}: ${text}`)
  }

  const data = await res.json()
  console.log(`[generate-card] response:`, JSON.stringify(data).slice(0, 500))

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')

  console.log(`[generate-card] raw content:`, content)

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object in model output: ${content.slice(0, 200)}`)
  }
  const jsonStr = content.slice(start, end + 1)

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`JSON parse failed: ${(e as Error).message} — got: ${jsonStr.slice(0, 200)}`)
  }

  if (parsed.error === 'inappropriate' || parsed.error === 'unknown_word') {
    return { error: parsed.error } as any
  }

  if (!parsed.word || !parsed.pos || !parsed.definition || !Array.isArray(parsed.patterns)) {
    throw new Error(`Invalid card shape: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  const result: any = { word: parsed.word, pos: parsed.pos, definition: parsed.definition, patterns: parsed.patterns }
  if (parsed.translation_ru) result.translation_ru = parsed.translation_ru
  if (FREQUENCIES.has(parsed.frequency)) result.frequency = parsed.frequency
  if (parsed.verb_forms && typeof parsed.verb_forms === 'object') {
    result.verb_forms = parsed.verb_forms
  }
  return result
}

// Dictionary cache via REST API
async function dictLookup(word: string, language: string): Promise<any | null> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/dictionary?word=eq.${encodeURIComponent(word)}&language=eq.${encodeURIComponent(language)}&select=word,pos,definition,translation_ru,patterns,verb_forms,model&limit=1`
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

async function dictSave(entry: { word: string; language: string; pos: string; definition: string; translation_ru?: string; frequency?: string; patterns: string[]; verb_forms?: Record<string, string>; model: string }) {
  // `on_conflict` is required: without it PostgREST resolves duplicates against
  // the primary key, which is a generated id and therefore never conflicts, so
  // the insert fails the (word, language) unique constraint instead of updating.
  // That silently made every regeneration a no-op for entries already cached.
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/dictionary?on_conflict=word,language`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(entry),
    })
    // A non-2xx here used to pass unnoticed, which is how the bug above hid.
    if (!res.ok) {
      console.error(`[generate-card] dict save ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
  } catch (e) {
    console.error('[generate-card] dict save error:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word, language, regenerate, dryRun } = await req.json()

    if (!word || !language) {
      return new Response(JSON.stringify({ error: 'word and language are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Freemium check
    const { data: userData } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (!userData?.plan || userData.plan === 'free') {
      return new Response(JSON.stringify({ error: 'subscription_required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const langName = LANG_NAMES[language] ?? language
    const wordLower = word.toLowerCase().trim()

    // Check dictionary cache (skipped when the user explicitly asks to regenerate,
    // and when testing the prompt — a dry run must not read or write the cache)
    if (!regenerate && !dryRun) {
      const cached = await dictLookup(wordLower, language)
      if (cached) {
        console.log(`[generate-card] cache hit: "${wordLower}" (${language})`)
        return new Response(JSON.stringify({ ...cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Cache miss — generate via AI
    const cardData = await generateWithOpenRouter(word, langName)

    // `unknown_word` means the model does not recognise the input and refused to
    // invent an entry for it — a refusal we want, since a confident card for a
    // word that does not exist reads as correct and gets learned.
    if (cardData.error === 'inappropriate' || cardData.error === 'unknown_word') {
      return new Response(JSON.stringify({ error: cardData.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Save to dictionary (fire-and-forget)
    const dictWord = cardData.word.toLowerCase().trim()
    const dictEntry: any = {
      word: dictWord,
      language,
      pos: cardData.pos,
      definition: cardData.definition,
      patterns: cardData.patterns,
      model: MODEL_ID,
    }
    if (cardData.translation_ru) dictEntry.translation_ru = cardData.translation_ru
    if (cardData.frequency) dictEntry.frequency = cardData.frequency
    if (cardData.verb_forms) dictEntry.verb_forms = cardData.verb_forms
    if (dryRun) {
      console.log(`[generate-card] dry run, not cached: "${dictWord}" (${language})`)
    } else {
      dictSave(dictEntry)
      console.log(`[generate-card] cached: "${dictWord}" (${language})`)
    }

    return new Response(JSON.stringify(cardData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Failed to generate card' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
