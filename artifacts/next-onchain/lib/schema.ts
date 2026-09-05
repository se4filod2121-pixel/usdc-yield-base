import { pgTable, text, serial, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const depositsTable = pgTable(
  "deposits",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    vaultAddress: text("vault_address").notNull(),
    amount: numeric("amount", { precision: 30, scale: 6 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 30, scale: 6 }).notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    txHash: text("tx_hash").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    walletIdx: index("deposits_wallet_idx").on(table.walletAddress),
    createdAtIdx: index("deposits_created_at_idx").on(table.createdAt),
  })
);

export const insertDepositSchema = createInsertSchema(depositsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type Deposit = typeof depositsTable.$inferSelect;
