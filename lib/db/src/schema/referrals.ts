import { pgTable, text, serial, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A wallet can be referred at most once (first referral link it ever used
// wins) — enforced by the unique constraint on referredAddress, not just
// application logic, so a race between two concurrent requests can't record
// the same wallet under two different referrers.
export const referralsTable = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerAddress: text("referrer_address").notNull(),
    referredAddress: text("referred_address").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    referredUnique: unique("referrals_referred_unique").on(table.referredAddress),
    referrerIdx: index("referrals_referrer_idx").on(table.referrerAddress),
  })
);

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
