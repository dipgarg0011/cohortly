import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload a browser File to the public `avatars` bucket and return its public URL.
 * Path layout matches mobile: `{userId}/avatar.{ext}`
 */
export async function uploadAvatarFile(opts: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
}): Promise<{ url: string; path: string } | { error: string }> {
  const mime = opts.file.type || "image/jpeg";
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) {
    return { error: "Use a JPEG, PNG, or WebP image." };
  }
  if (opts.file.size > 2 * 1024 * 1024) {
    return { error: "Photo must be under 2 MB." };
  }

  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpg";
  const path = `${opts.userId}/avatar.${ext}`;
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";

  try {
    const { error } = await opts.supabase.storage
      .from("avatars")
      .upload(path, opts.file, {
        upsert: true,
        contentType,
        cacheControl: "3600",
      });
    if (error) return { error: error.message };

    const { data } = opts.supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    return { url, path };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Photo upload failed.",
    };
  }
}
