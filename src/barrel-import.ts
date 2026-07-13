// Typical usage: import two namespaces from the package root barrel.
// Because dist/index.d.ts re-exports every namespace (`export * as ... from`),
// this pulls every generated declaration file in the package into the program.
import { chats, teams } from "@microsoft/teams.graph-endpoints";

export const req = chats.get({ "chat-id": "example-chat-id" });
export const t = teams;
