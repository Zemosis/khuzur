// Khuzur team colours: seats show their team's colour at the table and in the
// builder's preview. Teams alternate seats (team = seat % teams); in a free
// for all nobody has a team colour.

export const TEAM_COLORS = ["#e85a7a", "#5fd4d6", "#9bd14f"]; // rose, cyan, moss
export const TEAM_NAMES = ["ROSE", "CYAN", "MOSS"];
export const FFA_COLOR = "#ead8b1";

export const KHUZUR_ACCENT = { main: "#f08a4b", deep: "#a8552a" };
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;

export const seatColor = (table, seat) => (table.perTeam === 1 ? FFA_COLOR : TEAM_COLORS[seat % table.teams]);
export const teammates = (table, a, b) => table.perTeam > 1 && a !== b && a % table.teams === b % table.teams;
