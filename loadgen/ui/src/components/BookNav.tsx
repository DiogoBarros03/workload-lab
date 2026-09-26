import { firstReadyOf, type Book } from "@/lib/books";
import { CATEGORIES, type Category } from "@/lib/catalog";
import { hrefOf, type Project } from "@/lib/projects";
import { ProjectNav } from "./ProjectNav";

type NavProps = { active: Project; onNavigate?: () => void };

function BookEntry({ book, active, onNavigate }: NavProps & { book: Book }) {
  return (
    <>
      <a
        href={hrefOf(firstReadyOf(book))} onClick={onNavigate}
        className="mb-2 block rounded-md px-3 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block font-serif text-lg leading-snug text-ink">{book.title}</span>
        <span className="block text-label text-muted-foreground">{book.author}</span>
      </a>
      <ProjectNav projects={book.projects} active={active} onNavigate={onNavigate} />
    </>
  );
}

function CategorySection({ category, active, onNavigate }: NavProps & { category: Category }) {
  return (
    <>
      <h2 className="px-3 text-label text-muted-foreground">{category.label}</h2>
      {category.books
        ? <ul className="mt-2 flex flex-col gap-4">{category.books.map((b) => <li key={b.id}><BookEntry book={b} active={active} onNavigate={onNavigate} /></li>)}</ul>
        : <p className="mt-1 px-3 text-label text-muted-foreground/70">Nothing here yet</p>}
    </>
  );
}

// Shared by the desktop sidebar and the mobile sheet.
export function BookNav({ active, onNavigate }: NavProps) {
  return (
    <nav aria-label="Library">
      <ul className="flex flex-col gap-5">
        {CATEGORIES.map((c) => <li key={c.id}><CategorySection category={c} active={active} onNavigate={onNavigate} /></li>)}
      </ul>
    </nav>
  );
}
