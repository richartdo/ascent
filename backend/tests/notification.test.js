import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  dismissNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../src/services/notification.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const notificationId = "60000000-0000-4000-8000-000000000001";

const databaseNotification = {
  id: notificationId,
  type: "deadline",
  title: "Application deadline in 7 days",
  message: "The deadline is approaching.",
  opportunity_id: "10000000-0000-4000-8000-000000000001",
  application_id: "40000000-0000-4000-8000-000000000001",
  scheduled_for: "2026-07-20T00:00:00Z",
  read_at: null,
  dismissed_at: null,
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
};

const thenableQuery = (result) => {
  const calls = [];
  const query = {
    select: vi.fn((...args) => { calls.push(["select", ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(["eq", ...args]); return query; }),
    is: vi.fn((...args) => { calls.push(["is", ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(["order", ...args]); return query; }),
    range: vi.fn((...args) => { calls.push(["range", ...args]); return query; }),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return { query, calls };
};

const lookupBuilder = (data) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return builder;
};

const authenticatedApp = (supabase, requireHeader = false) => createApp({
  authenticateMiddleware: (req, _res, next) => {
    if (requireHeader && !req.get("authorization")) {
      next(Object.assign(new Error("Authentication is required."), {
        statusCode: 401,
        code: "AUTHENTICATION_REQUIRED",
      }));
      return;
    }
    req.auth = { user: { id: userId } };
    req.supabase = supabase;
    next();
  },
});

describe("notification service", () => {
  it("synchronizes before listing only the user's non-dismissed notifications", async () => {
    const { query, calls } = thenableQuery({ data: [databaseNotification], error: null, count: 1 });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const result = await listNotifications({
      supabase: { rpc, from: () => query },
      userId,
      filters: { unreadOnly: true, type: "deadline", page: 1, limit: 20 },
    });
    expect(rpc).toHaveBeenCalledWith("sync_my_deadline_notifications");
    expect(calls).toContainEqual(["eq", "user_id", userId]);
    expect(calls).toContainEqual(["is", "dismissed_at", null]);
    expect(calls).toContainEqual(["is", "read_at", null]);
    expect(result.notifications[0]).toMatchObject({ id: notificationId, opportunityId: databaseNotification.opportunity_id });
  });

  it("synchronizes before calculating unread count", async () => {
    const { query, calls } = thenableQuery({ data: null, error: null, count: 3 });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const count = await getUnreadCount({ supabase: { rpc, from: () => query }, userId });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(calls).toContainEqual(["is", "read_at", null]);
    expect(calls).toContainEqual(["is", "dismissed_at", null]);
    expect(count).toBe(3);
  });

  it("reading an already-read notification is idempotent", async () => {
    const read = { ...databaseNotification, read_at: "2026-07-21T00:00:00Z" };
    const from = vi.fn(() => lookupBuilder(read));
    const result = await markNotificationRead({ supabase: { from }, userId, notificationId });
    expect(from).toHaveBeenCalledTimes(1);
    expect(result.readAt).toBe(read.read_at);
  });

  it("dismissing an already-dismissed notification is idempotent", async () => {
    const dismissed = { ...databaseNotification, dismissed_at: "2026-07-21T00:00:00Z" };
    const from = vi.fn(() => lookupBuilder(dismissed));
    const result = await dismissNotification({ supabase: { from }, userId, notificationId });
    expect(from).toHaveBeenCalledTimes(1);
    expect(result.dismissedAt).toBe(dismissed.dismissed_at);
  });

  it("marks one unread notification while preserving ownership filters", async () => {
    const readBuilder = lookupBuilder(databaseNotification);
    const matches = [];
    const updateBuilder = {
      update: vi.fn(() => updateBuilder),
      eq: vi.fn((...args) => { matches.push(args); return updateBuilder; }),
      select: vi.fn(() => updateBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { ...databaseNotification, read_at: "2026-07-21T00:00:00.000Z" }, error: null,
      }),
    };
    let call = 0;
    await markNotificationRead({
      supabase: { from: () => (call++ === 0 ? readBuilder : updateBuilder) },
      userId, notificationId, now: new Date("2026-07-21T00:00:00Z"),
    });
    expect(matches).toEqual([["user_id", userId], ["id", notificationId]]);
  });

  it("read-all updates only unread and non-dismissed owned notifications", async () => {
    const matches = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((...args) => { matches.push(["eq", ...args]); return builder; }),
      is: vi.fn((...args) => { matches.push(["is", ...args]); return builder; }),
      select: vi.fn().mockResolvedValue({ data: [{ id: notificationId }], error: null }),
    };
    const count = await markAllNotificationsRead({
      supabase: { from: () => builder }, userId, now: new Date("2026-07-21T00:00:00Z"),
    });
    expect(matches).toEqual([
      ["eq", "user_id", userId],
      ["is", "read_at", null],
      ["is", "dismissed_at", null],
    ]);
    expect(count).toBe(1);
  });
});

describe("notification routes", () => {
  it("requires authentication", async () => {
    const response = await request(authenticatedApp({}, true)).get("/api/v1/notifications");
    expect(response.status).toBe(401);
  });

  it("rejects invalid notification UUIDs", async () => {
    const response = await request(authenticatedApp({ from: vi.fn() }))
      .patch("/api/v1/notifications/not-a-uuid/read");
    expect(response.status).toBe(422);
  });

  it("rejects unknown notification filters", async () => {
    const response = await request(authenticatedApp({ from: vi.fn() }))
      .get("/api/v1/notifications?unknown=true");
    expect(response.status).toBe(422);
  });

  it("rejects fields injected into notification state requests", async () => {
    const from = vi.fn();
    const response = await request(authenticatedApp({ from }))
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .send({ title: "Injected" });
    expect(response.status).toBe(422);
    expect(from).not.toHaveBeenCalled();
  });
});
