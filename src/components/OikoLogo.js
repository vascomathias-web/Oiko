import React from 'react';

/**
 * Logo OIKO vectoriel fidèle à la charte graphique.
 *
 * Props :
 *  width          — largeur du SVG (hauteur calculée automatiquement)
 *  onDark         — true → lettres blanches (fond sombre/bleu)
 *  showSlogan     — affiche "VOTRE ACTIF, EN CLAIR." en dessous
 *  withBackground — ajoute le fond bleu profond (#1B3A7A)
 *  sloganColor    — couleur du slogan (défaut selon onDark)
 */
export default function OikoLogo({
  width        = 300,
  onDark       = false,
  showSlogan   = true,
  withBackground = false,
  sloganColor,
}) {
  const letter  = onDark ? '#FFFFFF' : '#33363B';
  const green   = '#107C41';
  const bgColor = '#1B3A7A';
  const slogan  = sloganColor || (onDark ? 'rgba(255,255,255,0.50)' : '#64748b');
  const sw      = 21;           // épaisseur des tracés
  const VW      = 420;          // viewBox width
  const VH      = showSlogan ? 220 : 175;
  const height  = width * (VH / VW);

  /*
   * Positions (cx = centre de l'axe principal) :
   *   O1  cx=80   r=44
   *   I   x=163   (espace 19px avec O1)
   *   K   x=185   (chevauche I de ~4px)
   *     bras sup  (185,88) → (235,44)   droit
   *     jambe inf (185,88) → bezier → (265,132)  courbée
   *   O2  cx=305  r=44   (jambe K entre dans O2 de ≈ 15px)
   */

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Fond optionnel ── */}
      {withBackground && (
        <rect width={VW} height={VH} fill={bgColor} rx="14" />
      )}

      {/* ── O gauche ── */}
      <circle cx="80" cy="88" r="44" stroke={letter} strokeWidth={sw} />

      {/* ── I ── */}
      <line
        x1="163" y1="44" x2="163" y2="132"
        stroke={letter} strokeWidth={sw} strokeLinecap="round"
      />

      {/* ── K — barre verticale (même couleur que les lettres) ── */}
      <line
        x1="185" y1="44" x2="185" y2="132"
        stroke={letter} strokeWidth={sw} strokeLinecap="round"
      />

      {/* ── K — bras supérieur (même couleur que les lettres) ── */}
      <line
        x1="185" y1="88" x2="237" y2="44"
        stroke={letter} strokeWidth={sw} strokeLinecap="round"
      />

      {/* ── K — jambe inférieure courbée en vert émeraude ── */}
      <path
        d="M185,88 C205,108 238,128 265,134"
        stroke={green} strokeWidth={sw}
        strokeLinecap="round" fill="none"
      />

      {/* ── O droit (cx=305 → bord gauche à 261, jambe K termine à 265 → chevauche de 4px) ── */}
      <circle cx="305" cy="88" r="44" stroke={letter} strokeWidth={sw} />

      {/* ── Slogan ── */}
      {showSlogan && (
        <text
          x={VW / 2}
          y="178"
          textAnchor="middle"
          fontFamily="'Trebuchet MS', Verdana, Arial, sans-serif"
          fontSize="24"
          fontWeight="600"
          fill={slogan}
          letterSpacing="5"
        >
          VOTRE ACTIF, EN CLAIR.
        </text>
      )}
    </svg>
  );
}
