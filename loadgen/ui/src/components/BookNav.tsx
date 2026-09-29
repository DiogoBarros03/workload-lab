import type { Book } from "@/lib/books";
import { CATEGORIES, type Category } from "@/lib/catalog";
import type { Project } from "@/lib/projects";
import type { Health, Service } from "@/lib/status";
import { bookNodeId, useTreeState, type Tree } from "@/hooks/use-tree-state";
import { HomeLink } from "./HomeLink";
import { ProjectNav } from "./ProjectNav";
import { TreeNode } from "./TreeNode";

type NavProps = { active: Project | null; liveId: string | null; health: Record<Service, Health>; onNavigate?: () => void };
type BranchProps = NavProps & { tree: Tree; setOpen: (id: string, open: boolean) => void };

function BookBranch({ book, tree, setOpen, active, liveId, health, onNavigate }: BranchProps & { book: Book }) {
  const id = bookNodeId(book);
  const label = (
    <span className="flex min-w-0 flex-col">
      <span className="font-serif text-lg leading-snug text-ink">{book.title}</span>
      <span className="text-label text-muted-foreground">{book.author}</span>
    </span>
  );
  return (
    <TreeNode open={tree[id] === true} onToggle={(o) => setOpen(id, o)} label={label} className="ml-3" summaryClassName="items-start [&>svg]:mt-1.5">
      <ProjectNav projects={book.projects} active={active} liveId={liveId} health={health} onNavigate={onNavigate} />
    </TreeNode>
  );
}

function CategoryBranch({ category, ...props }: BranchProps & { category: Category }) {
  const label = <span className="text-label text-muted-foreground">{category.label}</span>;
  return (
    <TreeNode open={props.tree[category.id] === true} onToggle={(o) => props.setOpen(category.id, o)} label={label}>
      {category.books
        ? <ul className="flex flex-col gap-2">{category.books.map((b) => <li key={b.id}><BookBranch book={b} {...props} /></li>)}</ul>
        : <p className="py-1 pl-9 text-label text-muted-foreground">Nothing here yet</p>}
    </TreeNode>
  );
}

// Shared by the desktop sidebar and the mobile sheet.
export function BookNav({ active, liveId, health, onNavigate }: NavProps) {
  const [tree, setOpen] = useTreeState(active);
  return (
    <nav aria-label="Library" className="flex flex-col gap-1">
      <HomeLink active={active === null} onNavigate={onNavigate} />
      <ul className="flex flex-col gap-1">
        {CATEGORIES.map((c) => <li key={c.id}><CategoryBranch category={c} tree={tree} setOpen={setOpen} active={active} liveId={liveId} health={health} onNavigate={onNavigate} /></li>)}
      </ul>
    </nav>
  );
}
