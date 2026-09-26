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

function Prose({ paragraphs }: { paragraphs: string[] | null }) {
  if (paragraphs === null) return <NotYet />;
  return (
    <div className="flex max-w-prose flex-col gap-4">
      {paragraphs.map((p) => <p key={p}><MonoDigits text={p} /></p>)}
    </div>
  );
}

export function LearningSection({ learning: l }: { learning: Learning }) {
  return (
    <section aria-labelledby="learning-title" className="flex flex-col gap-8">
      <h2 id="learning-title" className="font-serif text-3xl text-ink">Learning</h2>
      <Part title="What We Learned"><Prose paragraphs={l.learned} /></Part>
      <Part title="Current Architecture">
        <ArchDiagram architecture={l.architecture} />
        <p className="max-w-prose">{l.architecture.summary}</p>
      </Part>
      <Part title="Flaws"><Prose paragraphs={l.flaws} /></Part>
    </section>
  );
}
