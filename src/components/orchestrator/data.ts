export interface Route {
  key: "chat" | "query";
  label: string;
  path: string;
  channel: "customer" | "business";
  field: "message" | "query";
  purpose: string;
  placeholder: string;
}

export const ROUTES: readonly Route[] = [
  {
    key: "chat",
    label: "Chat",
    path: "/v1/chat",
    channel: "customer",
    field: "message",
    purpose: "Public conversational traffic through the customer gateway.",
    placeholder: "Where is my order?",
  },
  {
    key: "query",
    label: "Query",
    path: "/v1/query",
    channel: "business",
    field: "query",
    purpose: "Internal business queries, with schema-validated structured output.",
    placeholder: "How many orders shipped late last week?",
  },
];
