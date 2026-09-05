"use client";

import { useMutation } from "@tanstack/react-query";

import { connectionLabel, type Connection } from "@/lib/connection";
import { sendViaProxy, type SendOptions } from "@/lib/http/client";
import { useHistoryStore } from "@/store/historyStore";

/** Wraps one proxied call as a mutation: `mutation.data` is the current
 * `Exchange` for this slot, and every settled call is appended to the
 * global history log. */
export function useSendRequest(connection: Connection) {
  const remember = useHistoryStore((state) => state.remember);

  return useMutation({
    mutationFn: (variables: { path: string } & SendOptions) =>
      sendViaProxy(connection, variables.path, variables),
    onSuccess: (exchange) => {
      remember(connectionLabel(connection), exchange);
    },
  });
}
