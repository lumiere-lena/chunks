-- ШАГ 1 из 2. Только чтение — ни одной операции записи.
-- Показывает, что сделает fix-cards-apply.sql. Прогоняй целиком.

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

-- Карточка-источник и карточка-приёмник, если она уже есть.
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

select 'УДАЛИТЬ' as действие,
       word as слово,
       'карточка + история повторений' as что,
       review_count::text as прогресс
from public.cards where lower(word) = 'abiquated'

union all
select 'СКЛЕИТЬ',
       from_word || ' → ' || to_word,
       'повторы ' || coalesce(src_reviews,0) || ' + ' || coalesce(tgt_reviews,0)
         || ' = ' || (coalesce(src_reviews,0) + coalesce(tgt_reviews,0))
         || ', интервал ' || greatest(src_interval, tgt_interval),
       case
         when 'mastered' in (src_status, tgt_status) then 'mastered'
         when 'learning' in (src_status, tgt_status) then 'learning'
         else tgt_status
       end
from pairs where tgt_id is not null

union all
select 'ПЕРЕИМЕНОВАТЬ',
       from_word || ' → ' || to_word,
       'прогресс не трогаем',
       coalesce(src_reviews,0)::text
from pairs where tgt_id is null

union all
select 'НЕТ КАРТОЧКИ',
       m.from_word,
       'есть только строка словаря',
       ''
from wordmap m
where not exists (select 1 from public.cards c where lower(c.word) = m.from_word)

union all
select 'ЧИСТИТЬ СЛОВАРЬ',
       word,
       'строка написана под старый заголовок',
       ''
from public.dictionary
where lower(word) in (select from_word from wordmap) or lower(word) = 'abiquated'

order by 1, 2;
