/**
 * 將 PostgreSQL / PostgREST 錯誤轉成使用者看得懂的訊息與欄位。
 * 只依錯誤代碼與約束名稱判斷，不把資料庫原始訊息直接顯示給使用者。
 */
export type DbErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined;

export type MappedDbError = { message: string; field?: string; code: string };

const UNIQUE_FIELDS: Record<string, { field: string; message: string }> = {
  notes_slug_unique: { field: "slug", message: "這個網址代稱已被其他筆記使用。" },
  notes_hackmd_note_id_unique: { field: "_form", message: "這篇 HackMD 筆記已經匯入過。" },
  categories_slug_unique: { field: "slug", message: "這個網址代稱已被其他分類使用。" },
  categories_parent_slug_unique: { field: "slug", message: "同一層已有相同網址代稱的分類。" },
  chapters_category_slug_unique: { field: "slug", message: "此分類下已有相同網址代稱的章節。" },
  tags_name_unique: { field: "tags", message: "標籤名稱重複。" },
  tags_slug_unique: { field: "tags", message: "標籤網址代稱重複。" },
  profiles_username_unique: { field: "username", message: "這個名稱已被使用。" },
};

const CHECK_MESSAGES: Record<string, { field?: string; message: string }> = {
  categories_not_self_parent: { field: "parentId", message: "分類不能設定自己為上層分類。" },
  notes_slug_format: { field: "slug", message: "網址代稱格式不正確。" },
  categories_slug_format: { field: "slug", message: "網址代稱格式不正確。" },
  chapters_slug_format: { field: "slug", message: "網址代稱格式不正確。" },
  tags_slug_format: { field: "tags", message: "標籤代稱格式不正確。" },
  notes_content_size: { field: "contentMd", message: "內容超過 1MB 上限。" },
  profiles_username_format: { field: "username", message: "名稱格式不正確。" },
};

function constraintName(error: NonNullable<DbErrorLike>): string | undefined {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return /constraint "([a-z0-9_]+)"/i.exec(text)?.[1];
}

export function mapDbError(error: DbErrorLike): MappedDbError {
  if (!error) return { code: "UNKNOWN", message: "發生未預期的錯誤，請稍後再試。" };
  const code = error.code ?? "UNKNOWN";
  const constraint = constraintName(error);

  switch (code) {
    case "23505": {
      const known = constraint ? UNIQUE_FIELDS[constraint] : undefined;
      return { code, message: known?.message ?? "資料重複，請修改後再試。", field: known?.field };
    }
    case "23503":
      return { code, message: "仍有其他資料關聯到這筆資料，無法刪除或指向不存在的項目。" };
    case "23514": {
      if (error.message?.includes("循環參照")) return { code, field: "parentId", message: "不能把分類移到自己的子分類底下。" };
      const known = constraint ? CHECK_MESSAGES[constraint] : undefined;
      return { code, message: known?.message ?? "資料不符合格式限制。", field: known?.field };
    }
    case "23502":
      return { code, message: "缺少必要欄位。" };
    case "22023":
      return error.message?.includes("TOO_MANY_TAGS")
        ? { code, field: "tags", message: "最多 20 個標籤。" }
        : { code, message: "參數不正確。" };
    case "P0001":
      return error.message?.includes("NOTE_CONFLICT")
        ? { code: "CONFLICT", message: "這篇筆記已在其他分頁或裝置被修改。請重新整理取得最新版本後再編輯。" }
        : { code, message: "資料庫拒絕了這次操作。" };
    case "P0002":
      return { code: "NOT_FOUND", message: "找不到這筆資料，可能已被刪除。" };
    case "42501":
      return { code: "FORBIDDEN", message: "沒有權限執行這個操作。" };
    case "PGRST116":
      return { code: "NOT_FOUND", message: "找不到這筆資料，可能已被刪除。" };
    default:
      return { code, message: "資料庫暫時無法處理這個請求，請稍後再試。" };
  }
}
