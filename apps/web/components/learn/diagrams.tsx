// Concept diagrams. Pure SVG; motion is CSS-only and stops under reduced motion.

export function DrivechainDiagram({ names = [] }: { names?: string[] }) {
  const sides = (names.length ? names : ["Sidechain A", "Sidechain B", "Sidechain C"]).slice(0, 3);
  return <figure className="diagram">
    <svg viewBox="0 0 640 316" role="img" aria-labelledby="dd-title dd-desc">
      <title id="dd-title">A drivechain</title>
      <desc id="dd-desc">The L1 chain runs along the bottom. Each sidechain above it has its coins locked in a treasury on L1. Deposits move coins up quickly; withdrawals move them down only after a long miner vote.</desc>
      <defs><marker id="dd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
      {sides.map((name, i) => { const x = 40 + i * 200; return <g key={name} className="dd-side">
        <rect x={x} y="20" width="160" height="70" rx="12"/>
        <text x={x + 80} y="50" textAnchor="middle" className="dd-strong">{name.length > 16 ? name.slice(0, 15) + "…" : name}</text>
        <text x={x + 80} y="72" textAnchor="middle" className="dd-muted">sidechain (L2)</text>
        <path className="dd-up" d={`M${x + 50} 190 V100`} markerEnd="url(#dd-arrow)"/>
        <path className="dd-down" d={`M${x + 110} 100 V190`} markerEnd="url(#dd-arrow)"/>
        <rect x={x + 40} y="190" width="80" height="34" rx="8" className="dd-vault"/>
        <text x={x + 80} y="212" textAnchor="middle" className="dd-small">treasury</text>
      </g>; })}
      <text x="84" y="150" className="dd-label dd-label-up" textAnchor="end">deposit</text>
      <text x="152" y="150" className="dd-label dd-label-down">withdraw</text>
      <text x="20" y="250" className="dd-muted">L1 mainchain: one block about every 10 minutes</text>
      <g className="dd-chain">{Array.from({ length: 8 }, (_, i) => <g key={i}><rect x={20 + i * 78} y="262" width="62" height="40" rx="6"/>{i < 7 && <path d={`M${82 + i * 78} 282 h16`}/>}</g>)}</g>
    </svg>
    <figcaption>Deposits (up) are ordinary L1 transactions. Withdrawals (down) need a long, public vote by L1 miners.</figcaption>
  </figure>;
}

export function ChainDiagram() {
  return <figure className="diagram">
    <svg viewBox="0 0 640 170" role="img" aria-labelledby="cd-title cd-desc">
      <title id="cd-title">Blocks linked by their parent hash</title>
      <desc id="cd-desc">Each block stores the hash of the block before it, so changing an old block would break every link after it.</desc>
      {[0, 1, 2, 3].map(i => { const x = 20 + i * 158; return <g key={i} className="cd-block">
        <rect x={x} y="30" width="126" height="104" rx="10"/>
        <text x={x + 14} y="58" className="dd-strong">Height {100 + i}</text>
        <text x={x + 14} y="82" className="dd-small">hash: {["9f2c…", "41ab…", "c07e…", "5d19…"][i]}</text>
        <text x={x + 14} y="104" className="dd-small">parent: {["…", "9f2c…", "41ab…", "c07e…"][i]}</text>
        <text x={x + 14} y="124" className="dd-small">transactions</text>
        {i < 3 && <path className="cd-link" d={`M${x + 126} 82 h32`}/>}
      </g>; })}
      <text x="320" y="160" textAnchor="middle" className="dd-muted">Each block points to its parent. Newer blocks are added on the right.</text>
    </svg>
  </figure>;
}

export function VoteDiagram({ threshold, maxAge }: { threshold?: number; maxAge?: number }) {
  return <figure className="diagram">
    <svg viewBox="0 0 640 180" role="img" aria-labelledby="vd-title vd-desc">
      <title id="vd-title">Votes accumulating block by block</title>
      <desc id="vd-desc">Each new block can add a vote. The proposal passes only if its votes go above the threshold before it gets too old.</desc>
      <rect x="20" y="60" width="600" height="34" rx="8" className="vd-track"/>
      <rect x="20" y="60" width="600" height="34" rx="8" className="vd-fill"/>
      <line x1="430" x2="430" y1="44" y2="110" className="vd-threshold"/>
      <text x="430" y="36" textAnchor="middle" className="dd-strong">threshold{threshold != null ? `: more than ${threshold.toLocaleString("en-US")} votes` : ""}</text>
      <text x="20" y="130" className="dd-muted">proposed</text>
      <text x="620" y="130" textAnchor="end" className="dd-muted">too old{maxAge != null ? `: ${maxAge.toLocaleString("en-US")} blocks` : ""}</text>
      <text x="320" y="166" textAnchor="middle" className="dd-small">time, measured in L1 blocks →</text>
    </svg>
  </figure>;
}

export function TreasuryDiagram() {
  return <figure className="diagram">
    <svg viewBox="0 0 640 190" role="img" aria-labelledby="td-title td-desc">
      <title id="td-title">A deposit replaces the treasury output</title>
      <desc id="td-desc">A deposit transaction spends the old treasury output plus the user's coins and creates one new treasury output holding the sum.</desc>
      <defs><marker id="td-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
      <g className="td-box"><rect x="20" y="24" width="170" height="56" rx="10"/><text x="105" y="48" textAnchor="middle" className="dd-strong">Old treasury</text><text x="105" y="68" textAnchor="middle" className="dd-small">100 coins</text></g>
      <g className="td-user"><rect x="20" y="110" width="170" height="56" rx="10"/><text x="105" y="134" textAnchor="middle" className="dd-strong">Your coins</text><text x="105" y="154" textAnchor="middle" className="dd-small">+ 5 coins</text></g>
      <path className="td-flow" d="M190 52 C 260 52, 260 95, 300 95" markerEnd="url(#td-arrow)"/>
      <path className="td-flow" d="M190 138 C 260 138, 260 95, 300 95" markerEnd="url(#td-arrow)"/>
      <g className="td-tx"><rect x="304" y="62" width="120" height="66" rx="10"/><text x="364" y="92" textAnchor="middle" className="dd-strong">Deposit</text><text x="364" y="112" textAnchor="middle" className="dd-small">(M5)</text></g>
      <path className="td-flow" d="M424 95 H 450" markerEnd="url(#td-arrow)"/>
      <g className="td-box td-new"><rect x="454" y="66" width="170" height="58" rx="10"/><text x="539" y="91" textAnchor="middle" className="dd-strong">New treasury</text><text x="539" y="111" textAnchor="middle" className="dd-small">105 coins</text></g>
    </svg>
    <figcaption>Illustrative amounts. There is always exactly one treasury output per sidechain.</figcaption>
  </figure>;
}

export function BmmDiagram() {
  return <figure className="diagram">
    <svg viewBox="0 0 680 250" role="img" aria-labelledby="bd-title bd-desc">
      <title id="bd-title">Blind merged mining</title>
      <desc id="bd-desc">A sidechain user builds a sidechain block and sends a bid on L1. The miner puts that block's hash in the L1 coinbase and collects the bid.</desc>
      <defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
      <text x="340" y="24" textAnchor="middle" className="dd-small">1 · BMM Request: "I pay X if your block includes h*"</text>
      <g className="bd-actor"><rect x="20" y="40" width="200" height="76" rx="12"/><text x="120" y="70" textAnchor="middle" className="dd-strong">Sidechain user</text><text x="120" y="92" textAnchor="middle" className="dd-small">builds side block h*</text></g>
      <g className="bd-actor"><rect x="460" y="40" width="200" height="76" rx="12"/><text x="560" y="70" textAnchor="middle" className="dd-strong">L1 miner</text><text x="560" y="92" textAnchor="middle" className="dd-small">runs only L1 software</text></g>
      <path className="bd-flow" d="M220 66 H 454" markerEnd="url(#bd-arrow)"/>
      <g className="bd-block"><rect x="240" y="160" width="200" height="72" rx="12"/><text x="340" y="188" textAnchor="middle" className="dd-strong">L1 block</text><text x="340" y="210" textAnchor="middle" className="dd-small">coinbase: BMM Accept h*</text></g>
      <path className="bd-flow" d="M560 116 C 560 170, 500 196, 444 196" markerEnd="url(#bd-arrow)"/><text x="572" y="160" className="dd-small">2 · commits to</text><text x="572" y="176" className="dd-small">one h* and takes X</text>
      <path className="bd-flow" d="M236 196 C 160 196, 120 170, 120 122" markerEnd="url(#bd-arrow)"/><text x="20" y="160" className="dd-small">3 · side block</text><text x="20" y="176" className="dd-small">is "found"</text>
    </svg>
    <figcaption>The miner never looks inside the sidechain block; that is why it is called "blind".</figcaption>
  </figure>;
}
