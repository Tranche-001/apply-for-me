-- AlterTable: a CV can print Experience and Projects as one "Experience & Projects" section.
-- Existing CVs keep two sections.
ALTER TABLE "Cv" ADD COLUMN     "oneSection" BOOLEAN NOT NULL DEFAULT false;
