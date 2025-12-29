import "server-only";

import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

const PUBLIC_ID_LENGTH = 7;
const MAX_ATTEMPTS = 10;

export function generatePublicId(length: number = PUBLIC_ID_LENGTH) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(randomInt(min, max + 1));
}

export async function ensureUserPublicId(userId: string) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicId: true },
  });

  if (existing?.publicId) return existing.publicId;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = generatePublicId();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { publicId: candidate },
        select: { publicId: true },
      });
      return updated.publicId ?? candidate;
    } catch (error: any) {
      if (error?.code === "P2002") {
        continue;
      }
      log("error", "public_id_assign_failed", { userId, error: error?.message });
      throw error;
    }
  }

  const error = new Error("Unable to assign a unique user ID");
  log("error", "public_id_assign_exhausted", { userId });
  throw error;
}
