// Khuzur team colours: seats show their team's colour at the table and in the
// builder's preview. Teams alternate seats (team = seat % teams); in a free
// for all nobody has a team colour.

export const TEAM_COLORS = ["#e85a7a", "#5fd4d6", "#9bd14f"]; // rose, cyan, moss
export const TEAM_NAMES = ["ROSE", "CYAN", "MOSS"];
export const FFA_COLOR = "#ead8b1";

export const KHUZUR_ACCENT = { main: "#f08a4b", deep: "#a8552a" };
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;

/** The table builder's first pick: 2v2, the 5-card game. */
export const DEFAULT_BUILD = { perTeam: 2, teams: 2, handSize: 5, soloCount: 4, teamCount: 2 };

/** The decks a deal is played with: 5 cards one deck, 7 cards two. */
export const decksOf = (table) => (table.handSize === 7 ? "2 DECKS" : "1 DECK");
export const shapeOf = (t) => `${t.perTeam === 1 ? `FFA ${t.teams}` : Array(t.teams).fill(t.perTeam).join(" V ")} · ${t.handSize} CARDS · ${decksOf(t)}`;

export const seatColor = (table, seat) => (table.perTeam === 1 ? FFA_COLOR : TEAM_COLORS[seat % table.teams]);
export const teammates = (table, a, b) => table.perTeam > 1 && a !== b && a % table.teams === b % table.teams;
