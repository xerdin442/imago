/*
  Warnings:

  - A unique constraint covering the columns `[appleAuthId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "appleAuthId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_appleAuthId_key" ON "users"("appleAuthId");
