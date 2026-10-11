import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@houseplant/shared';

/** Vector placeholder in the style of the mockup illustrations, shown until a photo exists. */
function PlantIllustration() {
  const { t } = useTranslation();
  const id = useId();
  return (
    <svg
      viewBox="0 0 580 420"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={t('photos.placeholderAlt')}
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}wall`} x2="1" y2="1">
          <stop stopColor="#e7e4c9" />
          <stop offset="1" stopColor="#c1d9bf" />
        </linearGradient>
        <linearGradient id={`${id}leaf`} x2="1" y2="1">
          <stop stopColor="#8fbf6d" />
          <stop offset="1" stopColor="#3f8350" />
        </linearGradient>
        <g id={`${id}shape`}>
          <path
            d="M0 0C-38-37-69-8-51 22C-30 49-5 60 0 65C5 60 30 49 51 22C69-8 38-37 0 0Z"
            fill={`url(#${id}leaf)`}
          />
          <path d="M0 4v52M0 27l-25-18M0 36l29-20" stroke="#e1e9a5" opacity=".5" strokeWidth="3" fill="none" />
        </g>
      </defs>
      <rect width="580" height="420" fill={`url(#${id}wall)`} />
      <circle cx="465" cy="85" r="60" fill="#fff5d4" opacity=".4" />
      <path d="M0 341h580v79H0" fill="#9cae8e" opacity=".2" />
      <g fill="none" stroke="#5b9855" strokeWidth="8" strokeLinecap="round">
        <path d="M289 294C279 218 254 186 212 160" />
        <path d="M289 294C327 214 353 182 381 150" />
        <path d="M289 294C292 230 290 170 292 112" />
      </g>
      <use href={`#${id}shape`} transform="translate(200 160) rotate(-50) scale(.95)" />
      <use href={`#${id}shape`} transform="translate(388 152) rotate(45) scale(.9)" />
      <use href={`#${id}shape`} transform="translate(292 112) rotate(0) scale(.95)" />
      <use href={`#${id}shape`} transform="translate(250 220) rotate(-80) scale(.7)" />
      <use href={`#${id}shape`} transform="translate(338 214) rotate(80) scale(.7)" />
      <ellipse cx="290" cy="359" rx="110" ry="16" fill="#44705a" opacity=".13" />
      <path d="M214 281h150l-19 99q-53 18-111 0Z" fill="#eaece3" />
      <rect x="208" y="277" width="162" height="24" rx="9" fill="#fbfcf5" />
      <ellipse cx="288" cy="279" rx="70" ry="10" fill="#596d49" />
    </svg>
  );
}

/**
 * A plant's cover photo; otherwise its species' catalog photo; otherwise the
 * illustrated placeholder. Fills its container.
 */
export function PlantImage({
  photo,
  name,
  speciesImage,
  speciesName,
  eager,
}: {
  photo: Photo | null;
  name: string;
  speciesImage?: string | null;
  speciesName?: string;
  eager?: boolean;
}) {
  const { t } = useTranslation();
  const src = photo?.url ?? speciesImage;
  if (!src) return <PlantIllustration />;
  return (
    <img
      src={src}
      alt={photo ? t('photos.alt', { name }) : t('photos.speciesAlt', { name: speciesName ?? name })}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="block size-full object-cover"
    />
  );
}
