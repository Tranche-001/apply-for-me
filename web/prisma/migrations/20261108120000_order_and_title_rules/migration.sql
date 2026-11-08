-- Three rules for Blocks and CVs, from the request of Nov 8 (block order and role titles). Each one is added
-- only when no rule has the same text yet, at the end of the 'cv' group, switched on. Safe to run on a
-- database seeded before or after these rules were added to seed-data.json.
INSERT INTO "PreferenceRule" ("id", "group", "text", "source", "on", "position")
SELECT gen_random_uuid()::text, 'cv', 'Put experience at companies before personal projects.', 'From your request on Nov 8', true,
       COALESCE((SELECT MAX("position") FROM "PreferenceRule" WHERE "group" = 'cv'), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM "PreferenceRule" WHERE "text" = 'Put experience at companies before personal projects.');

INSERT INTO "PreferenceRule" ("id", "group", "text", "source", "on", "position")
SELECT gen_random_uuid()::text, 'cv', 'Put the most recent work that best matches the job at the top.', 'From your request on Nov 8', true,
       COALESCE((SELECT MAX("position") FROM "PreferenceRule" WHERE "group" = 'cv'), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM "PreferenceRule" WHERE "text" = 'Put the most recent work that best matches the job at the top.');

INSERT INTO "PreferenceRule" ("id", "group", "text", "source", "on", "position")
SELECT gen_random_uuid()::text, 'cv', 'Offer the job''s title for my roles, and ask me before using it.', 'From your request on Nov 8', true,
       COALESCE((SELECT MAX("position") FROM "PreferenceRule" WHERE "group" = 'cv'), -1) + 1
WHERE NOT EXISTS (SELECT 1 FROM "PreferenceRule" WHERE "text" = 'Offer the job''s title for my roles, and ask me before using it.');
