-- Normalize Serbian parts of speech (pos) to Serbian terms.
-- Run in the Supabase SQL Editor. Touches ONLY the pos column, language = 'sr'.
-- Definitions, patterns, verb_forms are left untouched.
--
-- Mapping: English term -> Serbian term; gender letters f -> ž, n -> s (m stays).
-- Entries already in Serbian keep their term and only get gender letters normalized.
-- Note: gender is carried over from the existing data — if the old card had a wrong
-- gender, it stays wrong. Regenerate those individual words to fix gender.

-- 1) Shared dictionary cache
update public.dictionary d
set pos = t.newterm || t.rest
from (
  select
    id,
    case lower(split_part(pos, ' ', 1))
      when 'noun'         then 'imenica'
      when 'verb'         then 'glagol'
      when 'adjective'    then 'pridev'
      when 'adverb'       then 'prilog'
      when 'pronoun'      then 'zamenica'
      when 'preposition'  then 'predlog'
      when 'conjunction'  then 'veznik'
      when 'numeral'      then 'broj'
      when 'number'       then 'broj'
      when 'particle'     then 'rečca'
      when 'interjection' then 'uzvik'
      else split_part(pos, ' ', 1)   -- already Serbian: keep the term
    end as newterm,
    replace(
      replace(
        case when position(' ' in pos) > 0
             then substring(pos from position(' ' in pos))
             else '' end,
        '(n)', '(s)'),
      '(f)', '(ž)') as rest
  from public.dictionary
  where language = 'sr' and pos is not null
) t
where d.id = t.id
  and d.pos is distinct from (t.newterm || t.rest);

-- 2) Personal cards already added from the old dictionary (Library).
--    Same pos-only rewrite so existing users don't have to re-add words.
update public.cards c
set pos = t.newterm || t.rest
from (
  select
    id,
    case lower(split_part(pos, ' ', 1))
      when 'noun'         then 'imenica'
      when 'verb'         then 'glagol'
      when 'adjective'    then 'pridev'
      when 'adverb'       then 'prilog'
      when 'pronoun'      then 'zamenica'
      when 'preposition'  then 'predlog'
      when 'conjunction'  then 'veznik'
      when 'numeral'      then 'broj'
      when 'number'       then 'broj'
      when 'particle'     then 'rečca'
      when 'interjection' then 'uzvik'
      else split_part(pos, ' ', 1)
    end as newterm,
    replace(
      replace(
        case when position(' ' in pos) > 0
             then substring(pos from position(' ' in pos))
             else '' end,
        '(n)', '(s)'),
      '(f)', '(ž)') as rest
  from public.cards
  where language = 'sr' and pos is not null
) t
where c.id = t.id
  and c.pos is distinct from (t.newterm || t.rest);

-- Verify:
-- select pos, count(*) from public.dictionary where language='sr' group by pos order by 2 desc;
