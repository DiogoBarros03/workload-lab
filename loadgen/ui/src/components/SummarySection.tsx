import type { Lesson } from "@/lib/learning";
import { ArchDiagram } from "./ArchDiagram";
import { Prose, Section } from "./ProseSection";

// Summary prose, the architecture it describes, then what still limits it.
export function SummarySection({ lesson: l }: { lesson: Lesson }) {
  return (
    <Section id="summary" title="Summary">
      {l.summary && <Prose paragraphs={l.summary} />}
      <div className="flex flex-col gap-4">
        <ArchDiagram architecture={l.architecture} />
        <p className="max-w-prose text-muted-foreground">{l.architecture.summary}</p>
      </div>
      {l.flaws && (
        <div className="flex flex-col gap-4 border-t pt-6">
          <h3 className="text-label text-muted-foreground">What Still Limits Us</h3>
          <Prose paragraphs={l.flaws} />
        </div>
      )}
    </Section>
  );
}
