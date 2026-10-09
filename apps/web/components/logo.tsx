// The Observatory mark: a lens (observing) whose iris is L1, with sidechains in orbit.
const TILT = -24 * Math.PI / 180;
function onOrbit(t: number, rx: number, ry: number): [number, number] {
  const x = rx * Math.cos(t), y = ry * Math.sin(t);
  return [32 + x * Math.cos(TILT) - y * Math.sin(TILT), 32 + x * Math.sin(TILT) + y * Math.cos(TILT)];
}

export function Logo({ size = 34 }: { size?: number }) {
  const satellites = [0.55, 2.55, 4.45].map(t => onOrbit(t, 19, 8.5));
  return <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path className="logo-lens" d="M4 32 C 15 13, 49 13, 60 32 C 49 51, 15 51, 4 32 Z"/>
    <ellipse className="logo-orbit" cx="32" cy="32" rx="19" ry="8.5" transform="rotate(-24 32 32)"/>
    <circle className="logo-core" cx="32" cy="32" r="7"/>
    {satellites.map(([x, y], i) => <circle key={i} className={i === 0 ? "logo-sat logo-sat-main" : "logo-sat"} cx={x.toFixed(2)} cy={y.toFixed(2)} r={i === 0 ? 3.6 : 2.8}/>)}
  </svg>;
}
