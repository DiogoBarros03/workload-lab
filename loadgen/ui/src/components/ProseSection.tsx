import { monoDigits } from "@/lib/baseline";
import { inlineParts, type InlinePart } from "@/lib/refs";

function MonoDigits({ text }: { text: string }) {
  return monoDigits(text).map((p, i) => (p.mono ? <span key={i} className="font-mono text-[0.92em]">{p.text}</span> : p.text));
}

const LINK = "rounded-sm text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Inline({ part }: { part: InlinePart }) {
  if (part.kind === "link") return <a href={part.href} className={LINK}>{part.text}</a>;
  if (part.kind === "strong") return <strong className="font-semibold"><MonoDigits text={part.text} /></strong>;
  if (part.kind === "em") return <em className="italic tracking-normal"><MonoDigits text={part.text} /></em>;
  return <MonoDigits text={part.text} />;
}

// Inline text: [[id]] links, **bold**, _italic_; digits set in mono throughout.
export const RichText = ({ text }: { text: string }) => inlineParts(text).map((part, i) => <Inline key={i} part={part} />);

const Paragraph = ({ text }: { text: string }) => <p><RichText text={text} /></p>;

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
