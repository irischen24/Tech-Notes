import type { CategoryNode } from "./types";

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

const byOrder = (a: CategoryNode, b: CategoryNode) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant");

/**
 * 將平面分類資料組成樹，並計算已發布筆記數（含子孫）。
 * 若資料異常（父節點不存在或循環），該節點視為根節點，且不會無限遞迴。
 */
export function buildCategoryTree(rows: CategoryRow[], ownCounts: ReadonlyMap<string, number>): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      icon: r.icon,
      sortOrder: r.sort_order,
      ownNoteCount: ownCounts.get(r.id) ?? 0,
      totalNoteCount: 0,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const visiting = new Set<string>();
  const total = (node: CategoryNode): number => {
    if (visiting.has(node.id)) return 0;
    visiting.add(node.id);
    node.children.sort(byOrder);
    node.totalNoteCount = node.ownNoteCount + node.children.reduce((sum, c) => sum + total(c), 0);
    visiting.delete(node.id);
    return node.totalNoteCount;
  };
  roots.sort(byOrder).forEach(total);
  return roots;
}

/** 依 slug 找節點，並回傳從根到該節點的路徑（breadcrumb）。 */
export function findCategoryPath(roots: CategoryNode[], slug: string): CategoryNode[] | null {
  const walk = (list: CategoryNode[], trail: CategoryNode[], depth: number): CategoryNode[] | null => {
    if (depth > 64) return null;
    for (const node of list) {
      const path = [...trail, node];
      if (node.slug === slug) return path;
      const found = walk(node.children, path, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(roots, [], 0);
}

/** 依 id 取得從根到該節點的路徑。 */
export function findCategoryPathById(roots: CategoryNode[], id: string): CategoryNode[] | null {
  const walk = (list: CategoryNode[], trail: CategoryNode[], depth: number): CategoryNode[] | null => {
    if (depth > 64) return null;
    for (const node of list) {
      const path = [...trail, node];
      if (node.id === id) return path;
      const found = walk(node.children, path, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(roots, [], 0);
}

/** 依章節內排序取得上一篇 / 下一篇。 */
export function findNeighbors<T extends { id: string }>(ordered: T[], id: string): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((n) => n.id === id);
  if (i === -1) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}

/** 依共同標籤數排序相關筆記，同分時新的在前。 */
export function rankRelated(
  links: { note_id: string; tag_id: string }[],
  excludeId: string,
): string[] {
  const score = new Map<string, number>();
  for (const l of links) {
    if (l.note_id === excludeId) continue;
    score.set(l.note_id, (score.get(l.note_id) ?? 0) + 1);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
