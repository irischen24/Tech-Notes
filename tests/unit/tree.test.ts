import { describe, expect, it } from "vitest";
import { buildCategoryTree, findCategoryPath, findCategoryPathById, findNeighbors, rankRelated } from "@/lib/notes/tree";

const row = (id: string, parent: string | null, slug: string, sort = 0) => ({
  id,
  parent_id: parent,
  name: slug.toUpperCase(),
  slug,
  description: null,
  icon: null,
  sort_order: sort,
});

describe("buildCategoryTree", () => {
  const rows = [row("db", null, "database", 10), row("pg", "db", "postgresql", 20), row("sql", "db", "sql", 10), row("deep", "sql", "joins"), row("linux", null, "linux", 20)];
  const tree = buildCategoryTree(rows, new Map([["sql", 2], ["deep", 3], ["linux", 1]]));

  it("依 sort_order 排序並建立父子關係", () => {
    expect(tree.map((n) => n.slug)).toEqual(["database", "linux"]);
    expect(tree[0].children.map((n) => n.slug)).toEqual(["sql", "postgresql"]);
  });
  it("總數包含所有子孫分類", () => {
    expect(tree[0].totalNoteCount).toBe(5);
    expect(tree[0].children[0].totalNoteCount).toBe(5);
    expect(tree[1].totalNoteCount).toBe(1);
  });
  it("findCategoryPath 回傳完整 breadcrumb", () => {
    expect(findCategoryPath(tree, "joins")?.map((n) => n.slug)).toEqual(["database", "sql", "joins"]);
    expect(findCategoryPath(tree, "missing")).toBeNull();
    expect(findCategoryPathById(tree, "pg")?.map((n) => n.slug)).toEqual(["database", "postgresql"]);
  });
  it("父節點不存在時視為根節點", () => {
    const t = buildCategoryTree([row("orphan", "ghost", "orphan")], new Map());
    expect(t.map((n) => n.slug)).toEqual(["orphan"]);
  });
  it("資料異常形成循環時不會無限遞迴", () => {
    const t = buildCategoryTree([row("a", "b", "a"), row("b", "a", "b"), row("r", null, "r")], new Map([["a", 1]]));
    expect(t.map((n) => n.slug)).toEqual(["r"]);
  });
});

describe("findNeighbors / rankRelated", () => {
  const list = [{ id: "1" }, { id: "2" }, { id: "3" }];
  it("上一篇 / 下一篇", () => {
    expect(findNeighbors(list, "1")).toEqual({ prev: null, next: { id: "2" } });
    expect(findNeighbors(list, "2")).toEqual({ prev: { id: "1" }, next: { id: "3" } });
    expect(findNeighbors(list, "x")).toEqual({ prev: null, next: null });
  });
  it("依共同標籤數排序並排除自己", () => {
    const links = [
      { note_id: "self", tag_id: "a" },
      { note_id: "n1", tag_id: "a" },
      { note_id: "n2", tag_id: "a" },
      { note_id: "n2", tag_id: "b" },
    ];
    expect(rankRelated(links, "self")).toEqual(["n2", "n1"]);
  });
});
