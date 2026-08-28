-- STEP 2 of 2. THIS WRITES. Run fix-cards-preview.sql first.
--
-- The word list is repeated in every statement on purpose: the Supabase editor
-- does not keep a temp table alive between statements, so there can be no
-- shared state here. Each statement stands on its own.
--
-- Order matters: merge before deleting the sources, rename after.

-- ------------------------------------------------ 1. abiquated: not a real word

delete from public.reviews r
using public.cards c
where r.card_id = c.id and lower(c.word) = 'abiquated';

delete from public.cards where lower(word) = 'abiquated';

-- --------------------- 2. duplicates: move review history onto the surviving card

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
update public.reviews r
set card_id = t.id
from public.cards s
join wordmap m on lower(s.word) = m.from_word
join public.cards t
  on lower(t.word) = m.to_word
 and t.user_id = s.user_id
 and t.language = s.language
where r.card_id = s.id;

-- ------------------------------ 3. duplicates: keep whichever progress is further

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
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
join wordmap m on lower(s.word) = m.from_word
where lower(t.word) = m.to_word
  and t.user_id  = s.user_id
  and t.language = s.language;

-- ------------------------------------- 4. duplicates: the source is now redundant

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
delete from public.cards s
using wordmap m, public.cards t
where lower(s.word) = m.from_word
  and lower(t.word) = m.to_word
  and t.user_id  = s.user_id
  and t.language = s.language;

-- ----------- 5. singles: rename in place, progress survives because we leave it

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
update public.cards c
set word = m.to_word
from wordmap m
where lower(c.word) = m.from_word;

-- ------------------------------------------------- 6. clean the shared cache

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
delete from public.dictionary d
using wordmap m
where lower(d.word) = m.from_word;

delete from public.dictionary where lower(word) = 'abiquated';

-- ----------------------------------------------------------------- 7. result

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
select c.word as word, c.status as status, c.review_count as reviews,
       c.interval_days as interval, c.next_review_at as due
from public.cards c
where lower(c.word) in (select to_word from wordmap)
union all
select
  'leftovers — dictionary rows: ' || (
    select count(*) from public.dictionary
    where lower(word) in (select from_word from wordmap) or lower(word) = 'abiquated'
  ) || ', abiquated cards: ' || (
    select count(*) from public.cards where lower(word) = 'abiquated'
  ) || ', stale headwords: ' || (
    select count(*) from public.cards where lower(word) in (select from_word from wordmap)
  ),
  null, null, null, null
order by 1;
