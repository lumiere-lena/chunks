-- Move started cards onto the 3 → 7 → 14 → 21 ladder, step 1 of 2. Read-only.
--
-- The old SM-2 gaps (1–79 days) snap to the nearest step. A card mastered under
-- the old rule (gap >= 21) was never tested after a 21-day gap, so it goes back
-- to learning on the top step and is retired by the new rule. A due date only
-- ever moves earlier, never later. New cards are not touched.

with mapped as (
  select id, status, interval_days, next_review_at,
         case when interval_days <= 1  then 1
              when interval_days <= 4  then 3
              when interval_days <= 10 then 7
              when interval_days <= 17 then 14
              else 21 end as new_interval
  from public.cards
  where status in ('learning', 'mastered')
)
select status as old_status, interval_days::int as old_gap, new_interval as new_gap,
       count(*) as cards,
       count(*) filter (where next_review_at > current_date + new_interval) as due_date_moves_earlier
from mapped
group by 1, 2, 3
order by 1, 2;
