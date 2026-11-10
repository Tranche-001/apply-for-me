-- CreateTable
CREATE TABLE "AiKey" (
    "service" TEXT NOT NULL,
    "cipher" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiKey_pkey" PRIMARY KEY ("service")
);

-- CreateTable
CREATE TABLE "AiChoice" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "service" TEXT NOT NULL,
    "model" TEXT NOT NULL,

    CONSTRAINT "AiChoice_pkey" PRIMARY KEY ("id")
);
