import { pgTable, text, serial, timestamp, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Single opt-in: every email this table sends carries a one-click unsubscribe
// link built from `unsubscribeToken`, so there's no login/account needed to
// leave the list.
export const notificationSubscriptionsTable = pgTable(
  "notification_subscriptions",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    unsubscribeToken: text("unsubscribe_token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: index("notification_subscriptions_token_idx").on(table.unsubscribeToken),
  })
);

export const insertNotificationSubscriptionSchema = createInsertSchema(
  notificationSubscriptionsTable
).omit({ id: true, createdAt: true });

export type InsertNotificationSubscription = z.infer<typeof insertNotificationSubscriptionSchema>;

// One row per tracked vault: remembers the APY we last actually emailed
// subscribers about (not just the last value we happened to observe), so a
// vault drifting back and forth around the alert threshold doesn't trigger a
// fresh email on every single cron run.
export const vaultApyStateTable = pgTable("vault_apy_state", {
  vaultAddress: text("vault_address").primaryKey(),
  lastNotifiedApy: real("last_notified_apy").notNull(),
  lastNotifiedAt: timestamp("last_notified_at").defaultNow().notNull(),
});
