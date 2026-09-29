import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/projects";
import { switchText, type Active } from "@/lib/runtime";

type Props = { other: Active | null; project: Project; onConfirm: () => void; onCancel: () => void };

// Radix traps focus and maps Escape to Cancel.
export function SwitchDialog({ other, project, onConfirm, onCancel }: Props) {
  if (other === null) return null;
  const { title, body } = switchText(other, project);
  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-background p-6">
          <AlertDialog.Title className="font-serif text-xl font-normal text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-body text-ink-soft">{body}</AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild><Button type="button" variant="outline" className="h-11 sm:h-11">Cancel</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button type="button" className="h-11 sm:h-11" onClick={onConfirm}>Stop and Switch</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
