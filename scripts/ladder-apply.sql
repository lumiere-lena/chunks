-- Move started cards onto the 3 → 7 → 14 → 21 ladder, step 2 of 2. THIS WRITES.
-- Run ladder-preview.sql first; the mapping is explained there.

update public.cards c
set interval_days  = m.new_interval,
    status         = 'learning',
    next_review_at = least(c.next_review_at, current_date + m.new_interval)
from (
  select id,
         case when interval_days <= 1  then 1
              when interval_days <= 4  then 3
              when interval_days <= 10 then 7
              when interval_days <= 17 then 14
              else 21 end as new_interval
  from public.cards
  where status in ('learning', 'mastered')
) m
where c.id = m.id;
