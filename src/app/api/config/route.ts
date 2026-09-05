import { NextResponse, type NextRequest } from "next/server";

import { assertGatewayAuthorized } from "@/lib/auth/gatewayAuth";
import { loadDefaults, toPublicDefaults } from "@/lib/config";

export const runtime = "nodejs";

/** The one place server-read `.env` targets cross into the browser —
 * redacted via `toPublicDefaults()` first: base URLs travel (not secret —
 * needed for the "state the destination" principle) but every API key is
 * reduced to a boolean. Read fresh on every call rather than cached, so an
 * edited `.env` takes effect on the next page load without a server
 * restart. Gated the same as every other route: no gateway token, no
 * config. */
export async function GET(request: NextRequest) {
  const unauthorized = assertGatewayAuthorized(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(toPublicDefaults(loadDefaults()));
}
