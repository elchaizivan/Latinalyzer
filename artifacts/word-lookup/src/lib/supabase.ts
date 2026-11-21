import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const MORPH_KEY = "morphology-projects-library";
const READ_KEY = "continuous-reading-library";

/** שומר את שתי הספריות מהמכשיר אל הענן עבור המשתמש המחובר */
export async function syncLibraryToCloud() {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const morphRaw = localStorage.getItem(MORPH_KEY);
    const readRaw = localStorage.getItem(READ_KEY);

    const payload = {
      v: 1,
      morphology: morphRaw ? JSON.parse(morphRaw) : { v: 1, projects: [], folders: [] },
      continuousReading: readRaw ? JSON.parse(readRaw) : { v: 1, projects: [], folders: [] },
    };

    await supabase.from("user_libraries").upsert(
      {
        user_id: user.id,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.error("Cloud sync upload failed:", err);
  }
}

/** מושך את הספריות מהענן וממזג אותן עם הזיכרון המקומי */
export async function pullLibraryFromCloud(): Promise<boolean> {
  if (!supabase) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    const { data: row, error } = await supabase
      .from("user_libraries")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Cloud sync download failed:", error);
      return false;
    }

    // אם למשתמש עדיין אין גיבוי בענן, נעלה את מה שיש לו כרגע במכשיר
    if (!row || !row.data || !row.data.morphology) {
      await syncLibraryToCloud();
      return false;
    }

    const cloud = row.data;

    // פונקציית עזר למיזוג חכם (שומר על פרויקטים קיימים משני הצדדים)
    const mergeLib = (localKey: string, cloudLib: any) => {
      const localRaw = localStorage.getItem(localKey);
      const localLib = localRaw ? JSON.parse(localRaw) : { v: 1, projects: [], folders: [] };

      const mergedProjects = [...(cloudLib.projects || [])];
      const cloudProjIds = new Set(mergedProjects.map((p: any) => p.id));
      for (const p of localLib.projects || []) {
        if (!cloudProjIds.has(p.id)) mergedProjects.push(p);
      }

      const mergedFolders = [...(cloudLib.folders || [])];
      const cloudFolderIds = new Set(mergedFolders.map((f: any) => f.id));
      for (const f of localLib.folders || []) {
        if (!cloudFolderIds.has(f.id)) mergedFolders.push(f);
      }

      localStorage.setItem(
        localKey,
        JSON.stringify({ v: 1, projects: mergedProjects, folders: mergedFolders })
      );
    };

    if (cloud.morphology) mergeLib(MORPH_KEY, cloud.morphology);
    if (cloud.continuousReading) mergeLib(READ_KEY, cloud.continuousReading);

    return true;
  } catch (err) {
    console.error("Cloud sync error:", err);
    return false;
  }
}
