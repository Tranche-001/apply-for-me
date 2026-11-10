-- Behavioral answers per language (Nov 10, 2026): English and Portuguese each have their own generalist answer and
-- their own adapted answer per job; nothing is translated. Until now one answer held either language, so an
-- existing answer goes to the language its words are in: more common Portuguese words than English ones → Portuguese.
CREATE TYPE "AnswerLang" AS ENUM ('EN', 'PT');

ALTER TABLE "BehavioralQuestion" ADD COLUMN "answerPt" TEXT NOT NULL DEFAULT '';

ALTER TABLE "TailoredAnswer" ADD COLUMN "lang" "AnswerLang" NOT NULL DEFAULT 'EN';
ALTER TABLE "TailoredAnswer" DROP CONSTRAINT "TailoredAnswer_pkey";
ALTER TABLE "TailoredAnswer" ADD CONSTRAINT "TailoredAnswer_pkey" PRIMARY KEY ("questionId", "jobId", "lang");

UPDATE "BehavioralQuestion"
SET "answerPt" = "answer", "answer" = ''
WHERE "answer" <> ''
  AND regexp_count(lower("answer"), '\m(não|você|que|uma|para|com|eu|na|no|foi|mais|meu|minha|como|isso|de|do|da|em)\M')
    > regexp_count(lower("answer"), '\m(the|and|was|that|with|for|we|i|to|of|my|it|in|on|a)\M');

UPDATE "TailoredAnswer"
SET "lang" = 'PT'
WHERE regexp_count(lower("text"), '\m(não|você|que|uma|para|com|eu|na|no|foi|mais|meu|minha|como|isso|de|do|da|em)\M')
    > regexp_count(lower("text"), '\m(the|and|was|that|with|for|we|i|to|of|my|it|in|on|a)\M');
