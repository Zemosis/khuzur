const GUEST_NAMES = [
  "WANDER", "NOMAD", "DRIFTR", "SHADE", "EMBER",
  "FROST", "ROGUE", "VIPER", "STORM", "BLADE",
  "GHOST", "LUNAR", "SPARK", "THORN", "RAVEN",
  "ASHEN", "CRYPT", "FLINT", "HAVOC", "JINX",
  "MYTH", "ONYX", "PROWL", "SKULL", "WRAITH",
];

const STORAGE_KEY = "cardlore_guest";

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId() {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function randomAvatar() {
  return Math.floor(Math.random() * 5) + 1;
}

function createGuestIdentity() {
  return {
    name: randomFrom(GUEST_NAMES),
    tag: randomId(),
    avatar: randomAvatar(),
    isGuest: true,
  };
}

export function getGuestIdentity() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.name && parsed.tag && parsed.avatar) {
        return { ...parsed, isGuest: true };
      }
    }
  } catch {
    // Nothing saved, or it's unreadable: a new guest it is.
  }
  const identity = createGuestIdentity();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function clearGuestIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}
