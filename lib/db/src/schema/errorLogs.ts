import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Best-effort client-side error reports (window.onerror / unhandledrejection)
// so production failures show up somewhere without needing a third-party
// error-tracking account. Nothing here is trusted input beyond "a string a
// browser produced" — never displayed back to other users, only read by us.
export const errorLogsTable = pgTable(
  "error_logs",
  {
    id: serial("id").primaryKey(),
    message: text("message").notNull(),
    stack: text("stack"),
    url: text("url"),
    walletAddress: text("wallet_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("error_logs_created_at_idx").on(table.createdAt),
  })
);

export const insertErrorLogSchema = createInsertSchema(errorLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;
export type ErrorLog = typeof errorLogsTable.$inferSelect;
