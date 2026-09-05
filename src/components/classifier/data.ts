/** Ported from `tabs/classifier.py`'s module-level constants. */

export const MAX_TEXT_CHARS = 20000;
export const TIERS = ["t0_rules", "t1_classifier", "t2_local_llm", "t3_cloud_llm"] as const;
export type Tier = (typeof TIERS)[number];

/** The service's own default ceiling on a batch. The schema allows 1000; a
 * real deployment's own ceiling defaults to fewer. The System tab's
 * Capabilities probe reports the real number for the target you're on. */
export const DEFAULT_MAX_BATCH_ITEMS = 100;

export const EXAMPLES: readonly [string, string][] = [
  ["Mixed", "The battery life is superb but the camera is a letdown."],
  ["Positive", "Honestly the best purchase I have made all year."],
  ["Negative", "It broke within a week and support never replied."],
  ["Critical", "Checkout has been down for two hours. We are losing orders every minute."],
  ["Prose vs stars", "Arrived late and the box was crushed, but the product itself works."],
  ["PII", "Call me on +44 7700 900123 or email sam.doe@example.com — still no refund."],
];

export const SOURCE_TYPES = ["feedback", "review"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Straight from air-classifier-service's own README, the `/v1/summary/refresh`
 * worked example — a quick way to see a real rollup+narrative without
 * hand-typing items. `existingSummary` is a sample *prior* summary for the
 * same customer — the shape a real caller stores from one response and
 * sends back as the next call's `existing_summary`. Loading it alongside
 * fresh items demonstrates the actual round trip (old narrative + new
 * items → refreshed narrative), and gives developers a concrete narrative
 * to look at even when air-llm's summary model isn't reachable — in that
 * case the response carries this text over unchanged instead of showing an
 * empty string. */
export const SUMMARY_EXAMPLE = {
  customerId: "cust_482",
  existingSummary: {
    narrative:
      "An early-stage customer with one mixed review so far — pleased with delivery speed, mildly let down by an accuracy-of-listing issue.",
    rollup: {
      total_items: 1,
      counts_by_source_type: { review: 1 },
      sentiment_counts: { mixed: 1 },
      urgency_counts: { low: 1 },
      topic_counts: { delivery: 1 },
      rating_count: 1,
      rating_sum: 3.0,
      average_rating: 3.0,
      recent_ratings: [3.0],
      recent_average_rating: 3.0,
      first_seen_at: "2026-08-20T09:12:00.000Z",
      last_seen_at: "2026-08-20T09:12:00.000Z",
    },
    version: 1,
  },
  items: [
    {
      text: "The battery life is superb but the camera is a letdown.",
      source_type: "review" as SourceType,
      rating: 4,
    },
    {
      text: "Support replied within minutes, very helpful team.",
      source_type: "feedback" as SourceType,
    },
  ],
};

export interface TierProbe {
  tier: Tier;
  label: string;
  text: string;
  why: string;
  rating?: number;
}

/** Two confident cases per tier, straight from air-classifier-service's own README
 * — a pinned tier that cannot serve returns 503 rather than quietly
 * falling back, so a working response really did come from that rung. */
export const TIER_PROBES: readonly TierProbe[] = [
  {
    tier: "t0_rules",
    label: "Lexicon shortcut",
    text: "absolutely terrible",
    why: "Short, unambiguous lexicon term — clears the 0.95 shortcut floor with no model involved.",
  },
  {
    tier: "t0_rules",
    label: "Rating shortcut",
    text: "Arrived on time.",
    why: "An extreme, unambiguous star rating on short prose is its own shortcut.",
    rating: 5.0,
  },
  {
    tier: "t1_classifier",
    label: "Clear polarity",
    text: "Genuinely delighted with this purchase, it works beautifully.",
    why: "Clear single polarity, conventional phrasing — no T0 shortcut fits, no ambiguity needs an LLM.",
  },
  {
    tier: "t1_classifier",
    label: "Non-English",
    text: "Der Akku ist gut, aber die Kamera enttäuscht.",
    why: "Same shape, non-English — the classifier is multilingual, T0's lexicon is not.",
  },
  {
    tier: "t2_local_llm",
    label: "Sarcasm",
    text: "Battery lasts forever, if by forever you mean until lunchtime.",
    why: "A bag-of-terms classifier cannot see the reversal; needs real language understanding.",
  },
  {
    tier: "t2_local_llm",
    label: "Genuine mix",
    text: "The screen is gorgeous but the battery dies by lunchtime.",
    why: "Praise and complaint in one sentence, which must come back mixed, not averaged to neutral.",
  },
  {
    tier: "t3_cloud_llm",
    label: "Subtle irony",
    text: "Well, at least the box it arrived in was sturdy.",
    why: "Irony subtle enough that a 3B local model is itself unconfident and escalates.",
  },
  {
    tier: "t3_cloud_llm",
    label: "Polite but damning",
    text: "Support replied within minutes, every single time, to tell me they could not help.",
    why: "Structurally polite, substantively damning — genuine ambiguity between literal and intended sentiment.",
  },
];
