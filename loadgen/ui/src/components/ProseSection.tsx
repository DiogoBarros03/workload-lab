import { monoDigits } from "@/lib/baseline";
import { linkRefs } from "@/lib/refs";

function MonoDigits({ text }: { text: string }) {
  return monoDigits(text).map((p, i) => (p.mono ? <span key={i} className="font-mono text-[0.92em]">{p.text}</span> : p.text));
}

// One paragraph: [[id]] references become links, digits set in mono.
function Paragraph({ text }: { text: string }) {
  return (
    <p>
      {linkRefs(text).map((part, i) => part.href
        ? <a key={i} href={part.href} className="rounded-sm text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">{part.text}</a>
        : <MonoDigits key={i} text={part.text} />)}
    </p>
  );
}

export function Prose({ paragraphs }: { paragraphs: string[] }) {
  return <div className="flex max-w-prose flex-col gap-4">{paragraphs.map((p) => <Paragraph key={p} text={p} />)}</div>;
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-6">
      <h2 id={`${id}-title`} className="font-serif text-3xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export const ProseSection = ({ id, title, paragraphs }: { id: string; title: string; paragraphs: string[] }) => (
  <Section id={id} title={title}><Prose paragraphs={paragraphs} /></Section>
);
