const fs = require("fs");
const p = "prisma/schema.prisma";
let s = fs.readFileSync(p, "utf8");

s = s.replace(/model AuditLog \{[\s\S]*?\n\}/, `model AuditLog {
  id           String   @id @default(cuid())
  user         User?    @relation(fields: [userId], references: [id])
  userId       String?
  orgId        String?
  action       String
  actionType   String?
  targetUserId String?
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([orgId, createdAt])
}`);

s = s.replace(/model BusinessMember \{[\s\S]*?\n\}/, `model BusinessMember {
  id         String   @id @default(cuid())
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  business   Business @relation(fields: [businessId], references: [id])
  businessId String
  role       String   @default("member")
  status     String   @default("active")
  invitedBy  String?
  joinedAt   DateTime?
  createdAt  DateTime @default(now())

  @@unique([businessId, userId])
  @@index([businessId, role, status])
}`);

s = s.replace(/model BusinessInvite \{[\s\S]*?\n\}/, `model BusinessInvite {
  id              String   @id @default(cuid())
  business        Business @relation(fields: [businessId], references: [id])
  businessId      String
  email           String
  role            String   @default("member")
  token           String   @unique
  tokenHash       String?  @unique
  status          String   @default("PENDING")
  expiresAt       DateTime?
  acceptedAt      DateTime?
  usedAt          DateTime?
  invitedById     String?
  invitedByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([businessId, email])
  @@index([email])
}`);

fs.writeFileSync(p, s);
console.log("schema updated");
