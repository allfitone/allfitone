-- `body_progress` stops promising photos it never hands over (HU-BO-024, decision 1).
--
-- The description said "las fotos que tú selecciones", and the summary the
-- professional reads said "las fotos que elija". There is no way to select
-- photos: nothing in the product lets a person choose which ones a gym sees, so
-- including `body_photos` would hand over all of them. The V1 rules exclude the
-- table instead, and the words have to say the same thing the rules do.
--
-- A person who accepts believing she shares photos has agreed to something
-- other than what happens, even when what happens is less. When choosing photos
-- exists, `body_progress` gets a second published version and these words move
-- with it.
--
-- Only the words change. `scope_presentations` has no version on purpose: what
-- each person already accepted is frozen in the `presented_snapshot` of her
-- invitation, and this update does not touch it.

set lock_timeout = '5s';
set statement_timeout = '60s';

update privacy.scope_presentations
   set description = 'Medidas, composición corporal y tendencias. No incluye tus fotos, ni datos de salud.',
       summary = 'Medidas y composición corporal, sin fotos y sin datos de salud.',
       updated_at = clock_timestamp()
 where scope_code = 'body_progress';
