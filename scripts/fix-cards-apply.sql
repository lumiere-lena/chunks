-- STEP 2 of 2. THIS WRITES. Run fix-cards-preview.sql first.
--
-- The word list is repeated in every statement on purpose: the Supabase editor
-- does not keep a temp table alive between statements, so there can be no
-- shared state here. Each statement stands on its own.
--
-- Order matters: merge before deleting the sources, rename after.
--
-- Both the cards and the shared dictionary are cleaned. The dictionary matters
-- independently of the cards: a stale row there is the cache that seeds the
-- next card anyone creates from the same input.

-- ------------------------------------------- 1. words that are not real words

delete from public.reviews r
using public.cards c
where r.card_id = c.id and lower(c.word) = 'abiquated' and c.language = 'en';

delete from public.cards where lower(word) = 'abiquated' and language = 'en';
delete from public.dictionary where lower(word) = 'abiquated' and language = 'en';

-- --------------------- 2. duplicates: move review history onto the surviving card

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
)
update public.reviews r
set card_id = t.id
from public.cards s
join wordmap m on lower(s.word) = m.from_word and s.language = m.lang
join public.cards t
  on lower(t.word) = m.to_word
 and t.language = m.lang
 and t.user_id = s.user_id
where r.card_id = s.id;

-- ------------------------------ 3. duplicates: keep whichever progress is further

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
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
join wordmap m on lower(s.word) = m.from_word and s.language = m.lang
where lower(t.word) = m.to_word
  and t.language = m.lang
  and t.user_id  = s.user_id;

-- ------------------------------------- 4. duplicates: the source is now redundant

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
)
delete from public.cards s
using wordmap m, public.cards t
where lower(s.word) = m.from_word
  and s.language    = m.lang
  and lower(t.word) = m.to_word
  and t.language    = m.lang
  and t.user_id     = s.user_id;

-- ----------- 5. singles: rename in place, progress survives because we leave it

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
)
update public.cards c
set word = m.to_word
from wordmap m
where lower(c.word) = m.from_word and c.language = m.lang;

-- ------------------------------------------------- 6. clean the shared cache

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
)
delete from public.dictionary d
using wordmap m
where lower(d.word) = m.from_word and d.language = m.lang;

-- ------------------------------------------------------------------- 7. result

with wordmap(lang, from_word, to_word) as (values
  ('en','inflate with','inflate'), ('en','an offsite','offsite'), ('en','taming','tame'),
  ('en','in the verge of tears','on the verge of tears'),
  ('en','offhanded statement','offhand statement'),
  ('en','pulling together','pull together'), ('en','keep spending on it','keep spending on'),
  ('en','deprecating','self-deprecating'),
  ('sr','odvediti','odvesti'), ('sr','rendani','rendan')
)
select c.word as word, c.language as lang, c.status as status,
       c.review_count::text as reviews, c.interval_days::text as interval
from public.cards c
join wordmap m on lower(c.word) = m.to_word and c.language = m.lang
union all
select
  'leftovers — stale dictionary rows: ' || (
    select count(*) from public.dictionary d
    where exists (select 1 from wordmap m where m.from_word = lower(d.word) and m.lang = d.language)
       or (lower(d.word) = 'abiquated' and d.language = 'en')
  ) || ', stale cards: ' || (
    select count(*) from public.cards c
    where exists (select 1 from wordmap m where m.from_word = lower(c.word) and m.lang = c.language)
       or (lower(c.word) = 'abiquated' and c.language = 'en')
  ),
  null, null, null, null
order by 1;
