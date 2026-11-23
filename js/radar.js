import { ABILITIES } from './constants.js';

export function renderRadarChart(container, ranks) {
  const styles = getComputedStyle(document.documentElement);
  const stroke = styles.getPropertyValue('--radar-stroke').trim() || '#a5b4fc';
  const fill = styles.getPropertyValue('--radar-fill').trim() || 'rgba(124, 109, 247, 0.30)';
  const gridColor = styles.getPropertyValue('--radar-grid').trim() || 'rgba(203, 213, 225, 0.25)';
  const gold = styles.getPropertyValue('--accent-gold').trim() || '#f5c542';
  const textBright = styles.getPropertyValue('--text-bright').trim() || '#ffffff';

  const cx = 235;
  const cy = 170;
  const r = 104;

  const labelOffsets = {
    academics:    [0, -28],
    culture:      [44, -6],
    fitness:      [30, 22],
    charisma:     [-32, 22],
    productivity: [-50, -6],
  };

  const angles = ABILITIES.map((_, i) => ((-90 + i * 72) * Math.PI) / 180);

  const polygonPoints = (scale) =>
    angles
      .map(a => `${(cx + r * scale * Math.cos(a)).toFixed(1)},${(cy + r * scale * Math.sin(a)).toFixed(1)}`)
      .join(' ');

  // 5 concentric pentagons for Persona Ranks 1..5
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0]
    .map(
      (s, i) =>
        `<polygon points="${polygonPoints(s)}" fill="none" stroke="${gridColor}" stroke-width="${i === 4 ? 1.6 : 1}" opacity="${(
          0.32 + s * 0.55
        ).toFixed(2)}"/>`
    )
    .join('');

  const axes = angles
    .map(
      a =>
        `<line x1="${cx}" y1="${cy}" x2="${(cx + r * Math.cos(a)).toFixed(1)}" y2="${(
          cy + r * Math.sin(a)
        ).toFixed(1)}" stroke="${gridColor}" stroke-width="1" opacity="0.7"/>`
    )
    .join('');

  const valueCoords = ABILITIES.map((ab, i) => {
    const score = Math.max(0.18, Math.min(1, ranks[ab.id]?.score ?? 0.2));
    const a = angles[i];
    return {
      ab,
      rankInfo: ranks[ab.id],
      x: cx + r * score * Math.cos(a),
      y: cy + r * score * Math.sin(a),
      angle: a,
    };
  });

  const valuePoly = valueCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  // Sharp diamond vertices for edgy Persona look
  const vertices = valueCoords
    .map(
      c => `
      <rect x="${(c.x - 4.5).toFixed(1)}" y="${(c.y - 4.5).toFixed(1)}" width="9" height="9"
            transform="rotate(45 ${c.x.toFixed(1)} ${c.y.toFixed(1)})"
            fill="${gold}" stroke="#070711" stroke-width="2">
        <title>${c.ab.label}: Rank ${c.rankInfo.rank} (${c.rankInfo.title})</title>
      </rect>
    `
    )
    .join('');

  const labels = valueCoords
    .map(c => {
      const [dx, dy] = labelOffsets[c.ab.id] || [0, 0];
      const lx = cx + (r + 22) * Math.cos(c.angle) + dx;
      const ly = cy + (r + 22) * Math.sin(c.angle) + dy;
      const badgeColor = c.rankInfo.capped ? '#f59e0b' : gold;
      return `
        <g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)})">
          <text text-anchor="middle" fill="${textBright}" font-size="10.5" font-weight="900" font-style="italic" letter-spacing="1.2">${c.ab.label.toUpperCase()}</text>
          <g transform="skewX(-12)">
            <rect x="-28" y="5" width="56" height="17" fill="${badgeColor}"/>
            <text x="0" y="17" text-anchor="middle" fill="#070711" font-size="10" font-weight="900" font-family="monospace">RANK ${c.rankInfo.rank}</text>
          </g>
        </g>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 470 345" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="5-Axis Ability Radar">
      <defs>
        <filter id="radarGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${rings}
      ${axes}
      <polygon points="${valuePoly}" fill="${fill}" stroke="${stroke}" stroke-width="2.8" stroke-linejoin="miter" filter="url(#radarGlow)"/>
      ${vertices}
      ${labels}
    </svg>
  `;
}
