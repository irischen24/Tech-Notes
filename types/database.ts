/**
 * Supabase Database 型別 — 對應 supabase/migrations/ 下所有 migration（目前到 20261011000002）
 *
 * 此檔依 `supabase gen types typescript` 的輸出格式手寫（開發環境無法連到專案）。
 * 套用 migration 後，請以官方產生器覆蓋並比對差異：
 *   npx supabase gen types typescript --project-id hfozxjsriughgduwfbgn --schema public > types/database.ts
 * 之後每次新增 / 修改資料表都必須重新產生。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRole = "admin" | "visitor";
export type NoteStatus = "draft" | "published" | "archived";
export type NoteSourceType = "manual" | "hackmd";
export type StorageBucket = "note-images" | "note-drafts";
export type HackmdSyncStatus = "success" | "conflict" | "failed" | "skipped";
export type AuditResult = "success" | "failure";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // 由 auth.users trigger 建立，client 無 INSERT 權限
        Update: {
          username?: string; // role 沒有 UPDATE 權限
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
        };
        Update: {
          parent_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      chapters: {
        Row: {
          id: string;
          category_id: string;
          title: string;
          slug: string;
          description: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          title: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
        };
        Update: {
          category_id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          chapter_id: string;
          title: string;
          slug: string;
          summary: string | null;
          content_md: string;
          source_type: NoteSourceType;
          hackmd_note_id: string | null;
          hackmd_content_hash: string | null;
          hackmd_synced_at: string | null;
          status: NoteStatus;
          cover_image: string | null;
          sort_order: number;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          title: string;
          slug: string;
          summary?: string | null;
          content_md?: string;
          source_type?: NoteSourceType;
          hackmd_note_id?: string | null;
          hackmd_content_hash?: string | null;
          hackmd_synced_at?: string | null;
          status?: NoteStatus;
          cover_image?: string | null;
          sort_order?: number;
          published_at?: string | null;
        };
        Update: {
          chapter_id?: string;
          title?: string;
          slug?: string;
          summary?: string | null;
          content_md?: string;
          source_type?: NoteSourceType;
          hackmd_note_id?: string | null;
          hackmd_content_hash?: string | null;
          hackmd_synced_at?: string | null;
          status?: NoteStatus;
          cover_image?: string | null;
          sort_order?: number;
          published_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notes_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: { id: string; name: string; slug: string; created_at: string };
        Insert: { id?: string; name: string; slug: string };
        Update: { name?: string; slug?: string };
        Relationships: [];
      };
      note_tags: {
        Row: { note_id: string; tag_id: string };
        Insert: { note_id: string; tag_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "note_tags_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      note_assets: {
        Row: {
          id: string;
          note_id: string | null;
          bucket: StorageBucket;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id?: string | null;
          bucket: StorageBucket;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string;
        };
        Update: {
          note_id?: string | null;
          bucket?: StorageBucket;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_assets_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_assets_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      hackmd_sync_logs: {
        Row: {
          id: string;
          hackmd_note_id: string;
          note_id: string | null;
          status: HackmdSyncStatus;
          http_status: number | null;
          error_code: string | null;
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          hackmd_note_id: string;
          note_id?: string | null;
          status: HackmdSyncStatus;
          http_status?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: never; // 只能新增
        Relationships: [
          {
            foreignKeyName: "hackmd_sync_logs_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          result: AuditResult;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          actor_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          result: AuditResult;
          metadata?: Json;
        };
        Update: never; // 只能新增
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      search_published_notes: {
        Args: { search_query: string; max_results?: number };
        Returns: {
          id: string;
          title: string;
          summary: string | null;
          published_at: string | null;
          chapter_title: string;
          category_name: string;
          category_slug: string;
          match_in: "title" | "tag" | "summary" | "content";
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
