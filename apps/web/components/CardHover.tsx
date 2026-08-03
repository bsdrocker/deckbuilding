/**
 * Shows a card name that reveals its image in a popover on hover (the
 * Moxfield/Archidekt pattern). Plain <img> from the Scryfall CDN — no next/image
 * domain config needed. Falls back to plain text when no image is available.
 */
export function CardHover({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (!imageUrl) return <span>{name}</span>;
  return (
    <span className="card-hover">
      <span className="card-hover-name">{name}</span>
      <img src={imageUrl} alt={name} className="card-hover-img" loading="lazy" />
    </span>
  );
}
