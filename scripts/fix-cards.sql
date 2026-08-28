-- Правки данных D1–D3 из docs/card-quality.md.
-- Прогоняется целиком в Supabase SQL Editor. Работает от service_role,
-- поэтому RLS не мешает и словарь тоже чистится.
--
-- Всё завёрнуто в одну транзакцию: если что-то пойдёт не так, откатится
-- целиком. В конце стоит ROLLBACK — сначала посмотри вывод, и только потом
-- замени последнюю строку на COMMIT и прогони ещё раз.
--
-- Перегенерация текстов (D4–D5) здесь НЕ делается: она требует модели.
-- Её отдельно — кнопкой Regenerate в приложении или скриптом.

begin;

-- ---------------------------------------------------------------- отображение

create temp table wordmap(from_word text, to_word text) on commit drop;

insert into wordmap values
  ('inflate with',          'inflate'),                 -- выдуманный фразовый глагол
  ('an offsite',            'offsite'),                 -- артикль в заголовке
  ('taming',                'tame'),                    -- герундий вместо инфинитива
  ('in the verge of tears', 'on the verge of tears'),   -- неверный предлог
  ('offhanded statement',   'offhand statement'),       -- нестандартная форма
  ('pulling together',      'pull together'),           -- дубль
  ('keep spending on it',   'keep spending on'),        -- дубль
  ('deprecating',           'self-deprecating');        -- живёт только с self-

-- ---------------------------------------------- 2. D1: несуществующее слово

delete from public.reviews r
using public.cards c
where r.card_id = c.id and lower(c.word) = 'abiquated';

delete from public.cards where lower(word) = 'abiquated';
delete from public.dictionary where lower(word) = 'abiquated';

-- ------------------------------------- 3. D2: склейка дублей с переносом прогресса

-- Строки истории повторений перевешиваем на выживающую карточку, чтобы
-- накопленный прогресс не потерялся вместе с удаляемой.
update public.reviews r
set card_id = t.id
from public.cards s
join wordmap m on lower(s.word) = m.from_word
join public.cards t
  on lower(t.word) = m.to_word
 and t.user_id = s.user_id
 and t.language = s.language
where r.card_id = s.id;

-- Из двух карточек берём более продвинутую по каждому показателю.
update public.cards t
set interval_days = greatest(t.interval_days, s.interval_days),
    ease_factor   = greatest(t.ease_factor,   s.ease_factor),
    review_count  = coalesce(t.review_count, 0) + coalesce(s.review_count, 0),
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

-- Исходные карточки, у которых нашлась пара, теперь лишние.
delete from public.cards s
using wordmap m, public.cards t
where lower(s.word) = m.from_word
  and lower(t.word) = m.to_word
  and t.user_id  = s.user_id
  and t.language = s.language;

-- ------------------------------------------ 4. D3: переименование одиночных

-- Пары не нашлось — значит правильной карточки ещё нет. Переименовываем на
-- месте: прогресс остаётся нетронутым просто потому, что мы его не трогаем.
update public.cards c
set word = m.to_word
from wordmap m
where lower(c.word) = m.from_word;

-- ------------------------------------------------ 4б. чистим кэш словаря

-- Осиротевшие строки: тексты в них написаны под старый заголовок, и если
-- оставить, они всплывут при повторном вводе той же неправильной формы.
delete from public.dictionary
where lower(word) in (select from_word from wordmap);

-- --------------------------------------------------------------- 5. результат

-- Редактор Supabase показывает только последний запрос, поэтому всё нужное
-- собрано в один: карточки после правок плюс контрольная строка о том, не
-- осталось ли чего-то в словаре и не уцелел ли abiquated.
select c.word, c.status, c.review_count, c.interval_days, c.next_review_at
from public.cards c
where lower(c.word) in (select to_word from wordmap)
union all
select
  '— осталось мусора в словаре: ' || (
    select count(*) from public.dictionary
    where lower(word) in (select from_word from wordmap) or lower(word) = 'abiquated'
  ) || ', карточек abiquated: ' || (
    select count(*) from public.cards where lower(word) = 'abiquated'
  ),
  null, null, null, null
order by 1;

-- Посмотри вывод. Если всё верно — замени ROLLBACK на COMMIT и прогони заново.
rollback;
