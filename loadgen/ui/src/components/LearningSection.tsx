import { monoDigits } from "@/lib/baseline";
import type { Learning } from "@/lib/learning";
import { ArchDiagram } from "./ArchDiagram";

function MonoDigits({ text }: { text: string }) {
  return monoDigits(text).map((p, i) => (p.mono ? <span key={i} className="font-mono text-[0.92em]">{p.text}</span> : p.text));
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {children}
    </div>
  );
}

const NotYet = () => <p className="text-muted-foreground">Not measured yet. This project is not built.</p>;

function Lessons({ items }: { items: string[] | null }) {
  if (items === null) return <NotYet />;
  return (
    <ol className="flex max-w-prose list-decimal flex-col gap-3 pl-6 marker:font-mono marker:text-muted-foreground">
      {items.map((f) => <li key={f} className="pl-1"><MonoDigits text={f} /></li>)}
    </ol>
  );
}

function Flaws({ items }: { items: string[] | null }) {
  if (items === null) return <NotYet />;
  return (
    <ul className="flex max-w-prose list-disc flex-col gap-3 pl-6 marker:text-muted-foreground">
      {items.map((f) => <li key={f} className="pl-1"><MonoDigits text={f} /></li>)}
    </ul>
  );
}

export function LearningSection({ learning: l }: { learning: Learning }) {
  return (
    <section aria-labelledby="learning-title" className="flex flex-col gap-8">
      <h2 id="learning-title" className="font-serif text-3xl text-ink">Learning</h2>
      <Part title="What We Learned"><Lessons items={l.learned} /></Part>
      <Part title="Current Architecture">
        <ArchDiagram architecture={l.architecture} />
        <p className="max-w-prose">{l.architecture.summary}</p>
      </Part>
      <Part title="Flaws"><Flaws items={l.flaws} /></Part>
    </section>
  );
}
