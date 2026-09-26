-- Serbian, step 1 of 2. Read-only — performs no writes.
--
-- Three headwords that duplicate an entry which already exists correctly:
--   odvediti  not a real infinitive; its own patterns conjugate `odvesti`
--   rendani   the definite form of `rendan`, with a word-for-word identical definition
--   vikendom  the instrumental of `vikend` used adverbially, not a headword of its own

with wordmap(from_word, to_word) as (values
  ('odvediti', 'odvesti'),
  ('rendani',  'rendan'),
  ('vikendom', 'vikend')
),
pairs as (
  select m.from_word, m.to_word,
         s.id as src_id, s.review_count as src_reviews, s.interval_days as src_interval, s.status as src_status,
         t.id as tgt_id, t.review_count as tgt_reviews, t.interval_days as tgt_interval, t.status as tgt_status
  from wordmap m
  join public.cards s on lower(s.word) = m.from_word and s.language = 'sr'
  left join public.cards t
    on lower(t.word) = m.to_word and t.language = 'sr' and t.user_id = s.user_id
)
select 'MERGE' as action, from_word || ' -> ' || to_word as word,
       'reviews ' || coalesce(src_reviews,0) || ' + ' || coalesce(tgt_reviews,0)
         || ' = ' || (coalesce(src_reviews,0) + coalesce(tgt_reviews,0)) as detail,
       case
         when 'mastered' in (src_status, tgt_status) then 'mastered'
         when 'learning' in (src_status, tgt_status) then 'learning'
         else tgt_status
       end as result
from pairs where tgt_id is not null

union all
select 'RENAME CARD', from_word || ' -> ' || to_word,
       'progress left untouched', coalesce(src_reviews,0)::text
from pairs where tgt_id is null

union all
select 'NO CARD', m.from_word, 'dictionary row only', ''
from wordmap m
where not exists (
  select 1 from public.cards c where lower(c.word) = m.from_word and c.language = 'sr')

union all
select 'CLEAN DICTIONARY', d.word, 'stale headword, would seed future cards', ''
from public.dictionary d
join wordmap m on m.from_word = lower(d.word)
where d.language = 'sr'

union all
-- The targets must still be there afterwards; if one is missing the mapping is wrong.
select 'TARGET EXISTS', m.to_word,
       case when exists (select 1 from public.dictionary d
                         where lower(d.word) = m.to_word and d.language = 'sr')
            then 'yes' else 'NO — do not run the apply step' end, ''
from wordmap m

order by 1, 2;
