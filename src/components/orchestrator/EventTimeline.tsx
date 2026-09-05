"use client";

import { TableTitle } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";
import type { SseEvent } from "@/lib/http/exchange";

import { eventDetail } from "./events";

/** The raw event sequence, in arrival order — the thing a JSON-body turn
 * can never show, since it collapses the whole pipeline into one response.
 * Ported from `_event_timeline`. */
export function EventTimeline({ events }: { events: SseEvent[] }) {
  return (
    <>
      <TableTitle title="Event timeline (SSE)" />
      <DataTable
        rows={events.map((event, index) => ({ "#": index + 1, event: event.event ?? "", detail: eventDetail(event) }))}
      />
    </>
  );
}
