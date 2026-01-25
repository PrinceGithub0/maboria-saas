import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

const LOGO_DIR = path.join(process.cwd(), "uploads", "business-logos");
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

const findLogoFile = async (userId: string) => {
  try {
    const files = await fs.readdir(LOGO_DIR);
    const match = files.find((file) => file.startsWith(`${userId}.`));
    return match ? path.join(LOGO_DIR, match) : null;
  } catch {
    return null;
  }
};

const getContentType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filePath = await findLogoFile(session.user.id);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await fs.readFile(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Logo file missing" }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum logo size is 2 MB. Please upload smaller file." },
      { status: 400 }
    );
  }

  await fs.mkdir(LOGO_DIR, { recursive: true });
  const existing = await fs.readdir(LOGO_DIR).catch(() => []);
  await Promise.all(
    existing
      .filter((name) => name.startsWith(`${session.user.id}.`))
      .map((name) => fs.unlink(path.join(LOGO_DIR, name)).catch(() => undefined))
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${session.user.id}.${extension}`;
  const filePath = path.join(LOGO_DIR, filename);
  await fs.writeFile(filePath, buffer);

  const stat = await fs.stat(filePath);
  return NextResponse.json({
    success: true,
    url: `/api/business-profile/logo?v=${stat.mtimeMs}`,
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await fs.mkdir(LOGO_DIR, { recursive: true });
  const existing = await fs.readdir(LOGO_DIR).catch(() => []);
  await Promise.all(
    existing
      .filter((name) => name.startsWith(`${session.user.id}.`))
      .map((name) => fs.unlink(path.join(LOGO_DIR, name)).catch(() => undefined))
  );

  return NextResponse.json({ success: true });
}
