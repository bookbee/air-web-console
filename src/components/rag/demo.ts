/**
 * The RAG tab's one-click presets, taken from the SIT query set. A preset
 * only fills the form (or, for a deliberate negative case, the Advanced
 * JSON); what is sent is still exactly what the body preview shows.
 */

export interface RagPreset {
  id: string;
  label: string;
  blurb: string;
  /** Form presets: the query, and each option that starts ticked. */
  query?: string;
  options?: { top_k?: number; user_id?: string };
  /** Advanced presets: a raw body, sent as written. */
  raw?: Record<string, unknown>;
}

export const RAG_PRESETS: readonly RagPreset[] = [
  {
    id: "return-window",
    label: "Return window",
    blurb: "A policy question. returns-refunds should lead; the archived 2024 policy shouldn't appear at all.",
    query: "how many days do I have to return something",
  },
  {
    id: "product",
    label: "Product search",
    blurb: "A catalogue question worded nothing like the page: kettle-aurel-17 should be first.",
    query: "electric kettle that boils fast",
    options: { top_k: 3 },
  },
  {
    id: "hindi",
    label: "Hindi query",
    blurb: "चाय कैफ़े (\"tea café\"): the multilingual case, tumbler-chai-cafe within the top 5.",
    query: "चाय कैफ़े",
    options: { top_k: 5 },
  },
  {
    id: "isolation",
    label: "Other tenant's wording",
    blurb: "Worded like acme-returns, which belongs to tenant acme. A brightcart key must never see it: every row is checked.",
    query: "return within 7 days in store with receipt, store credit",
  },
  {
    id: "near-duplicate",
    label: "Archived near-duplicate",
    blurb: "returns-refunds-2024 is archived. It used to rank #1 here at 0.545; it must not be cited now.",
    query: "current return window",
    options: { top_k: 10 },
  },
  {
    id: "tenant-field",
    label: "Name a tenant (422)",
    blurb: "Advanced mode: a body that names a tenant. The tenant comes from the key, so this must be a 422, not silently ignored.",
    raw: { query: "return policy", tenant: "acme" },
  },
];
