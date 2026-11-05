// A Khuzur card as PixelCard props: rank and suit, or which joker it is.
export const toPixelCardProps = (card) => (card.joker ? { joker: card.joker } : { rank: card.rank, suit: card.suit });
