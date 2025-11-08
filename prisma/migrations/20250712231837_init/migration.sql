-- CreateEnum
CREATE TYPE "DisputeChatStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "status" "DisputeChatStatus" NOT NULL DEFAULT 'OPEN';
