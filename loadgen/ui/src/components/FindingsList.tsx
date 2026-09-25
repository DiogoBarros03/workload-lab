import { monoDigits } from "@/lib/baseline";

function MonoDigits({ text }: { text: string }) {
  return monoDigits(text).map((p, i) => (p.mono ? <span key={i} className="font-mono text-[0.92em]">{p.text}</span> : p.text));
}

export function FindingsList({ findings }: { findings: string[] }) {
  return (
    <section aria-labelledby="findings-title" className="flex flex-col gap-6">
      <h2 id="findings-title" className="font-serif text-3xl text-ink">Findings</h2>
      <ol className="flex max-w-3xl list-decimal flex-col gap-3 pl-6 marker:font-mono marker:text-muted-foreground">
        {findings.map((f) => <li key={f} className="pl-1"><MonoDigits text={f} /></li>)}
      </ol>
    </section>
  );
}
