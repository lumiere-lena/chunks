-- ШАГ 2 из 2. ЗАПИСЫВАЕТ ИЗМЕНЕНИЯ. Сначала прогони fix-cards-preview.sql.
--
-- Список слов повторяется в каждом запросе намеренно: редактор Supabase не
-- удерживает временную таблицу между запросами, поэтому общего состояния тут
-- быть не может. Запросы идут по порядку и каждый самодостаточен.
--
-- Порядок важен: склейка до удаления источников, переименование — после.

-- ---------------------------------------------- 1. abiquated: слова не существует

delete from public.reviews r
using public.cards c
where r.card_id = c.id and lower(c.word) = 'abiquated';

delete from public.cards where lower(word) = 'abiquated';

-- --------------------------- 2. дубли: переносим историю повторений на выживающую

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

-- ------------------------------- 3. дубли: берём более продвинутый прогресс

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

-- ---------------------------------- 4. дубли: источник теперь лишний

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

-- ------- 5. одиночные: переименовываем на месте, прогресс остаётся нетронутым

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

-- ------------------------------------------------- 6. чистим кэш словаря

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

-- --------------------------------------------------------------- 7. результат

with wordmap(from_word, to_word) as (values
  ('inflate with','inflate'), ('an offsite','offsite'), ('taming','tame'),
  ('in the verge of tears','on the verge of tears'), ('offhanded statement','offhand statement'),
  ('pulling together','pull together'), ('keep spending on it','keep spending on'),
  ('deprecating','self-deprecating')
)
select c.word as слово, c.status as статус, c.review_count as повторов,
       c.interval_days as интервал, c.next_review_at as следующий
from public.cards c
where lower(c.word) in (select to_word from wordmap)
union all
select
  'осталось мусора: словарь ' || (
    select count(*) from public.dictionary
    where lower(word) in (select from_word from wordmap) or lower(word) = 'abiquated'
  ) || ', карточек abiquated ' || (
    select count(*) from public.cards where lower(word) = 'abiquated'
  ) || ', старых заголовков ' || (
    select count(*) from public.cards where lower(word) in (select from_word from wordmap)
  ),
  null, null, null, null
order by 1;
