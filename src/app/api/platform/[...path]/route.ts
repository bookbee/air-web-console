import type { NextRequest } from "next/server";

import { handleServiceProxy } from "../../_lib/serviceProxy";

export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, { params }: Params) {
  const { path } = await params;
  return handleServiceProxy(request, path, "air-platform");
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
