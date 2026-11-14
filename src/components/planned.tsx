import type { ReactNode } from "react";
import { Badge, PageHeader, Panel, TextLink } from "./ui";

/**
 * Page body for a section whose data pipeline is not built yet.
 * States plainly that nothing is shown, and why, instead of rendering sample numbers.
 */
export function PlannedFeature({
  title,
  phase,
  summary,
  willShow,
  dependsOn,
  notes,
}: {
  title: string;
  phase: string;
  summary: string;
  willShow: string[];
  dependsOn: string[];
  notes?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={summary} right={<Badge tone="warn">Not yet available · {phase}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What this section will show">
          <ul className="grid gap-1.5 text-[12.5px]">
            {willShow.map((w) => (
              <li key={w} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 bg-mute" />
                {w}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Data it depends on">
          <ul className="grid gap-1.5 text-[12.5px]">
            {dependsOn.map((w) => (
              <li key={w} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 bg-mute" />
                {w}
              </li>
            ))}
          </ul>
          {notes && <div className="mt-3 border-t border-line pt-2 text-[12px] text-mute">{notes}</div>}
        </Panel>
      </div>
      <p className="mt-4 text-[12px] text-mute">
        No sample or placeholder figures are displayed. Read the <TextLink href="/methodology">methodology</TextLink> for how
        each metric will be calculated.
      </p>
    </>
  );
}
