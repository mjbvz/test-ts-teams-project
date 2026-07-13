// Narrowest possible usage: import a single endpoint namespace via subpath.
// This avoids the root barrel, but still pulls in dist/types/types.d.ts
// (~24.8 MB / ~594k lines) because every endpoint module's `Operation` type
// indexes into the `paths` interface defined there.
import * as chats from "@microsoft/teams.graph-endpoints/chats";

export const req = chats.get({ "chat-id": "example-chat-id" });
