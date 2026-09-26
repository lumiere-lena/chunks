-- Serbian, step 2 of 2. THIS WRITES. Run fix-cards-sr-preview.sql first.
--
-- The word list repeats in each statement because the Supabase editor does not
-- keep a temp table alive between statements. Order matters: merge before
-- deleting the sources, rename after.

-- 1. move review history onto the surviving card

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
update public.reviews r
set card_id = t.id
from public.cards s
join wordmap m on lower(s.word) = m.from_word and s.language = 'sr'
join public.cards t
  on lower(t.word) = m.to_word and t.language = 'sr' and t.user_id = s.user_id
where r.card_id = s.id;

-- 2. keep whichever progress is further along

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
update public.cards t
set interval_days  = greatest(t.interval_days, s.interval_days),
    ease_factor    = greatest(t.ease_factor,   s.ease_factor),
    review_count   = coalesce(t.review_count, 0) + coalesce(s.review_count, 0),
    next_review_at = least(t.next_review_at, s.next_review_at),
    status = case
               when 'mastered' in (t.status, s.status) then 'mastered'
               when 'learning' in (t.status, s.status) then 'learning'
               else t.status
             end
from public.cards s
join wordmap m on lower(s.word) = m.from_word and s.language = 'sr'
where lower(t.word) = m.to_word and t.language = 'sr' and t.user_id = s.user_id;

-- 3. the source card is now redundant

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
delete from public.cards s
using wordmap m, public.cards t
where lower(s.word) = m.from_word and s.language = 'sr'
  and lower(t.word) = m.to_word and t.language = 'sr' and t.user_id = s.user_id;

-- 4. any source card with no counterpart is renamed in place, progress intact

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
update public.cards c
set word = m.to_word
from wordmap m
where lower(c.word) = m.from_word and c.language = 'sr';

-- 5. clean the shared cache

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
delete from public.dictionary d
using wordmap m
where lower(d.word) = m.from_word and d.language = 'sr';

-- 6. result

with wordmap(from_word, to_word) as (values
  ('odvediti','odvesti'), ('rendani','rendan'), ('vikendom','vikend')
)
select c.word as word, c.status as status,
       c.review_count::text as reviews, c.interval_days::text as interval
from public.cards c
join wordmap m on lower(c.word) = m.to_word and c.language = 'sr'
union all
select 'leftovers — stale dictionary rows: ' || (
         select count(*) from public.dictionary
         where lower(word) in (select from_word from wordmap) and language = 'sr'
       ) || ', stale cards: ' || (
         select count(*) from public.cards
         where lower(word) in (select from_word from wordmap) and language = 'sr'
       ),
       null, null, null
order by 1;
