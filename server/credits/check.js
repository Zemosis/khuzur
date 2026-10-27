// ECONOMY CHECK — every credit is in a balance or at a table, and together
// they are everything ever granted or claimed, minus what an admin removed,
// the pots CPUs won at credit matches and the house's net at blackjack
// (negative when the house paid out more than it took).
// Run at boot and from the admin page; a MISMATCH means a bug lost or made credits.

import { pool } from "../db/index.js";

export async function economyCheck() {
  const {
    rows: [r],
  } = await pool.query(`
    select (select coalesce(sum(balance), 0) from credit_accounts)                          as balances,
           (select coalesce(sum(stack + pending), 0) from credit_seats)                     as at_tables,
           (select coalesce(sum(amount), 0) from credit_ledger where kind = 'grant')        as granted,
           (select coalesce(sum(amount), 0) from credit_ledger where kind = 'claim')        as claimed,
           (select coalesce(-sum(amount), 0) from credit_ledger where kind = 'admin_remove') as removed,
           (select coalesce(sum(cpu_take), 0) from credit_hands)                            as won_by_bots,
           (select coalesce(sum(house_net), 0) from credit_hands)                           as house_net`);
  const n = {
    balances: Number(r.balances),
    atTables: Number(r.at_tables),
    granted: Number(r.granted),
    claimed: Number(r.claimed),
    removed: Number(r.removed),
    wonByBots: Number(r.won_by_bots),
    houseNet: Number(r.house_net),
  };
  return { ...n, ok: n.balances + n.atTables === n.granted + n.claimed - n.removed - n.wonByBots - n.houseNet };
}
