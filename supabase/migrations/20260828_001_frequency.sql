-- How common the headword is in everyday use, estimated by the model when the
-- entry is generated. Used to warn on the draft screen that a word may not be
-- worth learning. Null for entries generated before this existed.
alter table public.dictionary add column frequency text;
