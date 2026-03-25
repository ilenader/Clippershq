/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "discordId" DROP NOT NULL,
ALTER COLUMN "username" SET DEFAULT 'user';

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
