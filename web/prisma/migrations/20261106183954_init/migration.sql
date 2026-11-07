-- CreateEnum
CREATE TYPE "Section" AS ENUM ('EXPERIENCE', 'PROJECT');

-- CreateEnum
CREATE TYPE "BulletKind" AS ENUM ('PROJECT', 'STACK', 'IMPACT', 'PROJECT_STACK', 'PROJECT_IMPACT', 'STACK_IMPACT', 'MISSING');

-- CreateEnum
CREATE TYPE "LinkKind" AS ENUM ('POSTING', 'APPLICATION', 'COMPANY', 'OTHER');

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "where" TEXT NOT NULL DEFAULT '',
    "when" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "org" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "dates" TEXT NOT NULL DEFAULT '',
    "stack" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "experienceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "themes" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bullet" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "BulletKind" NOT NULL,
    "text" TEXT NOT NULL,
    "want" "BulletKind",
    "position" INTEGER NOT NULL,

    CONSTRAINT "Bullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL,
    "postingText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLink" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionJob" (
    "versionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "VersionJob_pkey" PRIMARY KEY ("versionId","jobId")
);

-- CreateTable
CREATE TABLE "Cv" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "sectionOrder" "Section"[],
    "showEducation" BOOLEAN NOT NULL DEFAULT true,
    "showSkills" BOOLEAN NOT NULL DEFAULT true,
    "showAchievements" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT '',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvItem" (
    "id" TEXT NOT NULL,
    "cvId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CvItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationEntry" (
    "id" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "dates" TEXT NOT NULL DEFAULT '',
    "school" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EducationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillLine" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehavioralQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "short" TEXT NOT NULL,
    "full" TEXT NOT NULL,
    "looksFor" TEXT[],
    "answer" TEXT NOT NULL DEFAULT '',
    "theory" TEXT NOT NULL DEFAULT '',
    "references" TEXT[],
    "useFounder" BOOLEAN NOT NULL DEFAULT true,
    "founderNotes" TEXT NOT NULL DEFAULT '',
    "founderRefs" TEXT[],

    CONSTRAINT "BehavioralQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoredAnswer" (
    "questionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "TailoredAnswer_pkey" PRIMARY KEY ("questionId","jobId")
);

-- CreateTable
CREATE TABLE "PreferenceRule" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "on" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PreferenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_slug_key" ON "Block"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Version_blockId_name_key" ON "Version"("blockId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Job_company_role_key" ON "Job"("company", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Cv_jobId_key" ON "Cv"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "BehavioralQuestion_key_key" ON "BehavioralQuestion"("key");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bullet" ADD CONSTRAINT "Bullet_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLink" ADD CONSTRAINT "JobLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionJob" ADD CONSTRAINT "VersionJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionJob" ADD CONSTRAINT "VersionJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvItem" ADD CONSTRAINT "CvItem_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "Cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvItem" ADD CONSTRAINT "CvItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredAnswer" ADD CONSTRAINT "TailoredAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "BehavioralQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredAnswer" ADD CONSTRAINT "TailoredAnswer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
