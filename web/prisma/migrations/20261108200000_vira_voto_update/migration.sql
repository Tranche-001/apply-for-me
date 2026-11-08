-- Projeto Vira Voto, updated from the project's repository and his own words (Nov 8, 2026). Non-destructive and
-- idempotent: nothing is overwritten or deleted, and running it again changes nothing.
--  1. The experience about Vira Voto (by its title or notes) gets one dated entry at the end of its notes, only when
--     the entry's first line is not there yet. No such experience: the migration does nothing.
--  2. Its block (linked to that experience, or named Vira Voto) gets a NEW version "Director & Full-Stack" with the
--     approved title and bullets; the base and every other version stay as they are. With no block yet, one is made
--     for the experience (its place and dates), and this version is its only one (so its base).
--  3. The block's stack is filled only when it is empty.
-- The same text is in seed-data.json for fresh installs (a test keeps the two equal).
DO $$
DECLARE
  marker CONSTANT text := 'Update of Nov 8, 2026, from the project repository and my own words';
  entry CONSTANT text := marker || E'\n'
    || 'My role: Director & Full-Stack Developer of the movement. I organized the people and the coordination (admin) through the app.' || E'\n'
    || 'Numbers: 100+ volunteers in 34+ groups; 1,000+ votes turned.' || E'\n'
    || 'How it worked: Google Form sign-ups flow through Apps Script into Supabase. Every 5 minutes a unit-tested TypeScript algorithm forms teams of up to 4 per shift, matching carpools, one meeting point and one area per group.' || E'\n'
    || 'The site: Next.js on Vercel. Volunteers sign in by phone to see their shift, map and address; the coordination team (admin) manages people, zones and groups. Server-only database access, rate-limited login and a nonce CSP.' || E'\n'
    || 'Stack: Next.js 16, React 19, TypeScript, Supabase (Postgres, Edge Functions, pg_cron), Google Apps Script, Vercel.';
  vv_stack CONSTANT text := 'Next.js 16, React 19, TypeScript, Supabase (Postgres, Edge Functions, pg_cron), Google Apps Script, Vercel';
  vv_version CONSTANT text := 'Director & Full-Stack';
  exp_id text;
  exp_where text;
  exp_when text;
  blk_id text;
  blk_slug text := 'viravoto';
  ver_id text;
BEGIN
  SELECT e.id, e."where", e."when" INTO exp_id, exp_where, exp_when
    FROM "Experience" e
   WHERE e.title ILIKE '%vira voto%' OR e.title ILIKE '%incentivo ao voto%' OR e.notes ILIKE '%vira voto%'
   ORDER BY e.position, e."createdAt"
   LIMIT 1;
  IF exp_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. The dated entry, once, after what he wrote.
  UPDATE "Experience" e
     SET notes = CASE WHEN btrim(e.notes) = '' THEN entry ELSE rtrim(e.notes, E' \t\r\n') || E'\n\n' || entry END,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE e.id = exp_id AND strpos(e.notes, marker) = 0;

  -- 2. The block: the one linked to this experience first, else one named Vira Voto; made when there is none.
  SELECT b.id INTO blk_id
    FROM "Block" b
   WHERE b."experienceId" = exp_id OR b.name ILIKE '%vira voto%' OR b.org ILIKE '%vira voto%'
   ORDER BY (b."experienceId" IS NOT DISTINCT FROM exp_id) DESC, b.position
   LIMIT 1;
  IF blk_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM "Block" b WHERE b.slug = blk_slug) THEN
      blk_slug := blk_slug || '-' || substr(md5(random()::text), 1, 6);
    END IF;
    INSERT INTO "Block" ("id", "slug", "name", "section", "org", "location", "dates", "stack", "position", "experienceId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, blk_slug, 'Projeto Vira Voto', 'EXPERIENCE'::"Section", 'Projeto Vira Voto', COALESCE(exp_where, ''), COALESCE(exp_when, ''), vv_stack,
            COALESCE((SELECT MAX(b.position) FROM "Block" b), -1) + 1, exp_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id INTO blk_id;
  END IF;

  -- The new version, once (by name). It is the base only when the block had no version.
  IF NOT EXISTS (SELECT 1 FROM "Version" v WHERE v."blockId" = blk_id AND v.name = vv_version) THEN
    INSERT INTO "Version" ("id", "blockId", "name", "title", "isBase", "themes", "position", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, blk_id, vv_version, 'Director & Full-Stack Developer — Projeto Vira Voto',
            NOT EXISTS (SELECT 1 FROM "Version" v WHERE v."blockId" = blk_id), ARRAY['Full-stack', 'Leadership'],
            COALESCE((SELECT MAX(v.position) FROM "Version" v WHERE v."blockId" = blk_id), -1) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id INTO ver_id;
    INSERT INTO "Bullet" ("id", "versionId", "kind", "text", "want", "position") VALUES
      (gen_random_uuid()::text, ver_id, 'PROJECT_IMPACT'::"BulletKind",
       'Directed a volunteer canvassing movement, organizing 100+ volunteers into 34+ groups that helped turn 1,000+ votes.', NULL, 0),
      (gen_random_uuid()::text, ver_id, 'PROJECT_STACK'::"BulletKind",
       'Built the platform that ran it: Google Form sign-ups flow through Apps Script into Supabase, where a unit-tested TypeScript algorithm forms teams of up to 4 per shift every 5 minutes, matching carpools, one meeting point and one area per group.', NULL, 1),
      (gen_random_uuid()::text, ver_id, 'PROJECT_STACK'::"BulletKind",
       'Shipped a Next.js site on Vercel where volunteers sign in by phone to see their shift, map and address, and the coordination team (admin) manages people, zones and groups, with server-only database access, rate-limited login and a nonce CSP.', NULL, 2);
  END IF;

  -- 3. The stack, only where none is written.
  UPDATE "Block" b SET stack = vv_stack, "updatedAt" = CURRENT_TIMESTAMP
   WHERE b.id = blk_id AND btrim(b.stack) = '';
END $$;
