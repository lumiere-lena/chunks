-- STEP 1 of 2. Read-only — performs no writes at all.
-- Shows exactly what fix-cards-apply.sql will do, for cards AND for the shared
-- dictionary. Run the whole file.

with wordmap(lang, from_word, to_word) as (values
  -- English
  ('en', 'inflate with',          'inflate'),
  ('en', 'an offsite',            'offsite'),
  ('en', 'taming',                'tame'),
  ('en', 'in the verge of tears', 'on the verge of tears'),
  ('en', 'offhanded statement',   'offhand statement'),
  ('en', 'pulling together',      'pull together'),
  ('en', 'keep spending on it',   'keep spending on'),
  ('en', 'deprecating',           'self-deprecating')
),

-- Words with no replacement at all.
gone(lang, word) as (values ('en', 'abiquated')),

pairs as (
  select m.lang, m.from_word, m.to_word,
         s.id as src_id, s.review_count as src_reviews, s.interval_days as src_interval, s.status as src_status,
         t.id as tgt_id, t.review_count as tgt_reviews, t.interval_days as tgt_interval, t.status as tgt_status
  from wordmap m
  join public.cards s on lower(s.word) = m.from_word and s.language = m.lang
  left join public.cards t
    on lower(t.word) = m.to_word
   and t.language = m.lang
   and t.user_id = s.user_id
)

select 'DELETE CARD' as action, c.word as word, c.language as lang,
       'card + review history' as detail, c.review_count::text as progress
from public.cards c
join gone g on lower(c.word) = g.word and c.language = g.lang

union all
select 'MERGE', from_word || ' -> ' || to_word, lang,
       'reviews ' || coalesce(src_reviews,0) || ' + ' || coalesce(tgt_reviews,0)
         || ' = ' || (coalesce(src_reviews,0) + coalesce(tgt_reviews,0))
         || ', interval ' || greatest(src_interval, tgt_interval),
       -- greatest() would compare these as text, ranking 'new' above 'mastered'
       case
         when 'mastered' in (src_status, tgt_status) then 'mastered'
         when 'learning' in (src_status, tgt_status) then 'learning'
         else tgt_status
       end
from pairs where tgt_id is not null

union all
select 'RENAME CARD', from_word || ' -> ' || to_word, lang,
       'progress left untouched', coalesce(src_reviews,0)::text
from pairs where tgt_id is null

union all
select 'NO CARD', m.from_word, m.lang, 'dictionary row only', ''
from wordmap m
where not exists (
  select 1 from public.cards c where lower(c.word) = m.from_word and c.language = m.lang)

union all
-- The dictionary is a shared cache: a stale row here seeds the next card
-- anyone makes from the same input, so it has to go even when no card uses it.
select 'CLEAN DICTIONARY', d.word, d.language,
       'stale headword, would seed future cards', ''
from public.dictionary d
where exists (select 1 from wordmap m where m.from_word = lower(d.word) and m.lang = d.language)
   or exists (select 1 from gone   g where g.word      = lower(d.word) and g.lang = d.language)

order by 1, 3, 2;
