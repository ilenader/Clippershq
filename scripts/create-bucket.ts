import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log("Creating 'uploads' bucket...");
  const { data, error } = await supabase.storage.createBucket("uploads", {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });

  if (error) {
    if (error.message.includes("already exists")) {
      console.log("Bucket 'uploads' already exists — OK");
    } else {
      console.error("Error:", error.message);
      console.log("\nIf permission denied, try setting NEXT_PUBLIC_SUPABASE_ANON_KEY to your service_role key temporarily.");
    }
  } else {
    console.log("Bucket created successfully:", data);
  }
}

main();
