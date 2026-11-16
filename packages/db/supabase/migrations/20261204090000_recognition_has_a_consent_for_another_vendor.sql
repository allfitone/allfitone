-- Recognition has a consent for another vendor (`OP-NUT-017`; ADR-041, ADR-045).
--
-- **A consent version is a text, and a text names where the photo goes.** The first one,
-- `2026-10-04`, names Google through Vercel. This one, `2026-11-15`, names Anthropic on
-- Amazon Bedrock, in the United States. Publishing it changes nothing by itself: the API
-- asks for the version that belongs to the vendor it is configured to send a photo to,
-- so a person is asked again only once that vendor changes.
--
-- **The first text stays.** What a person accepted under it is the record of what she
-- was told then, and the API keeps asking for it while the first vendor answers.

set lock_timeout = '5s';
set statement_timeout = '60s';

insert into nutrition.recognition_consent_versions (version) values ('2026-11-15');
