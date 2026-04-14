import { getSession } from "@/lib/get-session";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const BUCKET = "uploads";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Rate limit: 20 uploads per hour per user
  const rl = checkRateLimit(`upload:${session.user.id}`, 20, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    // Validate magic bytes
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return NextResponse.json({ error: "Invalid file content. Only JPEG, PNG, WebP, or GIF images allowed." }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Storage not configured. Use an image URL instead." }, { status: 500 });
    }

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError.message);
      return NextResponse.json({ error: "Upload failed. Try using an image URL instead." }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    const url = urlData.publicUrl;

    return NextResponse.json({ url, filename }, { status: 201 });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
