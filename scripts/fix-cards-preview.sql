-- STEP 1 of 2. Read-only — performs no writes at all.
-- Shows exactly what fix-cards-apply.sql will do. Run the whole file.

with wordmap(from_word, to_word) as (values
  ('inflate with',          'inflate'),
  ('an offsite',            'offsite'),
  ('taming',                'tame'),
  ('in the verge of tears', 'on the verge of tears'),
  ('offhanded statement',   'offhand statement'),
  ('pulling together',      'pull together'),
  ('keep spending on it',   'keep spending on'),
  ('deprecating',           'self-deprecating')
),

-- The card being replaced, alongside the card it would merge into if one exists.
pairs as (
  select m.from_word, m.to_word,
         s.id as src_id, s.review_count as src_reviews, s.interval_days as src_interval, s.status as src_status,
         t.id as tgt_id, t.review_count as tgt_reviews, t.interval_days as tgt_interval, t.status as tgt_status
  from wordmap m
  join public.cards s on lower(s.word) = m.from_word
  left join public.cards t
    on lower(t.word) = m.to_word
   and t.user_id = s.user_id
   and t.language = s.language
)

select 'DELETE' as action,
       word as word,
       'card + review history' as detail,
       review_count::text as progress
from public.cards where lower(word) = 'abiquated'

union all
select 'MERGE',
       from_word || ' → ' || to_word,
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
select 'RENAME',
       from_word || ' → ' || to_word,
       'progress left untouched',
       coalesce(src_reviews,0)::text
from pairs where tgt_id is null

union all
select 'NO CARD',
       m.from_word,
       'dictionary row only',
       ''
from wordmap m
where not exists (select 1 from public.cards c where lower(c.word) = m.from_word)

union all
select 'CLEAN DICTIONARY',
       word,
       'text was written for the old headword',
       ''
from public.dictionary
where lower(word) in (select from_word from wordmap) or lower(word) = 'abiquated'

order by 1, 2;
