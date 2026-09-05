import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Deliberately not gated by `assertGatewayAuthorized` — infra healthchecks
 * (Docker's `HEALTHCHECK`, an orchestrator's liveness probe) need a plain
 * "is the Node process serving requests" signal, not proof of gateway
 * credentials. This endpoint reveals nothing about configuration or
 * upstream services — see `/api/config` for that, which *is* gated. */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "air-web-console" });
}
