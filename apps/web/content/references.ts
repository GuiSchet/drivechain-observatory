// Every external link the lessons cite. Section anchors were checked against
// the rendered GitHub pages; see content/FACT_CHECK.md.
const bip300 = "https://github.com/bitcoin/bips/blob/master/bip-0300.mediawiki";
const bip301 = "https://github.com/bitcoin/bips/blob/master/bip-0301.mediawiki";
const spec300 = "https://github.com/LayerTwo-Labs/bip300_bip301_specifications/blob/master/bip300.md";
const spec301 = "https://github.com/LayerTwo-Labs/bip300_bip301_specifications/blob/master/bip301.md";
export const ENFORCER_COMMIT = "1753fc0c23863bcb39c681e1cfaea2705613516f";
const enforcer = `https://github.com/LayerTwo-Labs/bip300301_enforcer/blob/${ENFORCER_COMMIT}`;

export const references = {
  bip300: { title: "BIP300: Hashrate Escrows", href: bip300 },
  bip300Abstract: { title: "BIP300 · Abstract", href: `${bip300}#abstract` },
  bip300D1: { title: "BIP300 · D1, the sidechain list", href: `${bip300}#d1-the-sidechain-list` },
  bip300D2: { title: "BIP300 · D2, the withdrawal list", href: `${bip300}#d2-the-withdrawal-list` },
  bip300M1: { title: "BIP300 · M1, propose sidechain", href: `${bip300}#m1----propose-sidechain` },
  bip300M2: { title: "BIP300 · M2, ACK sidechain proposal", href: `${bip300}#m2----ack-sidechain-proposal` },
  bip300Bundles: { title: "BIP300 · Withdrawing in bundles", href: `${bip300}#withdrawing-in-bundles` },
  bip300M3: { title: "BIP300 · M3, propose bundle", href: `${bip300}#m3----propose-bundle` },
  bip300M4: { title: "BIP300 · M4, ACK bundles", href: `${bip300}#m4----ack-bundles` },
  bip300M5: { title: "BIP300 · M5, deposit", href: `${bip300}#m5----deposit-btc-from-l1-to-l2` },
  bip300M6: { title: "BIP300 · M6, withdraw", href: `${bip300}#m6----withdraw-btc-from-l2-to-l1` },
  bip300OpDrivechain: { title: "BIP300 · OP_DRIVECHAIN", href: `${bip300}#op_drivechain` },
  bip301: { title: "BIP301: Blind Merged Mining", href: bip301 },
  bip301Example: { title: "BIP301 · Notation and example", href: `${bip301}#notation-and-example` },
  bip301Accept: { title: "BIP301 · BMM Accept", href: `${bip301}#bmm-accept` },
  bip301Request: { title: "BIP301 · BMM Request", href: `${bip301}#bmm-request` },
  spec300Constants: { title: "LayerTwo Labs spec · BIP300 constants", href: `${spec300}#constants` },
  spec300M2: { title: "LayerTwo Labs spec · M2", href: `${spec300}#m2-ack-proposal` },
  spec300M4: { title: "LayerTwo Labs spec · M4", href: `${spec300}#m4-ack-bundle` },
  spec300Treasury: { title: "LayerTwo Labs spec · treasury UTXO", href: `${spec300}#treasury-utxo` },
  spec301M7: { title: "LayerTwo Labs spec · M7 BMM Accept", href: `${spec301}#m7-bmm-accept` },
  spec301M8: { title: "LayerTwo Labs spec · M8 BMM Request", href: `${spec301}#m8-bmm-request` },
  enforcer: { title: "bip300301_enforcer (reviewed build)", href: `https://github.com/LayerTwo-Labs/bip300301_enforcer/tree/${ENFORCER_COMMIT}` },
  enforcerBetanet: { title: "Enforcer · Betanet thresholds", href: `${enforcer}/lib/types.rs#L59-L62` },
  enforcerThresholdRule: { title: "Enforcer · activation needs strictly more votes", href: `${enforcer}/lib/types.rs#L97-L104` },
  enforcerNetworkParams: { title: "Enforcer · Betanet network parameters", href: `${enforcer}/lib/types.rs#L155-L166` },
  enforcerOpDrivechain: { title: "Enforcer · OP_DRIVECHAIN per network", href: `${enforcer}/lib/types.rs#L920-L932` },
  drivechainInfo: { title: "drivechain.info", href: "https://www.drivechain.info/" },
  ecash: { title: "ecash.com · What is eCash (ECX)?", href: "https://ecash.com/what-is-ecash/" },
  sourceContract: { title: "Observatory · source contract", href: "https://github.com/GuiSchet/drivechain-observatory/blob/main/SOURCE_CONTRACT.md" },
} as const;

export type RefId = keyof typeof references;
export const ISSUES_URL = "https://github.com/GuiSchet/drivechain-observatory/issues/new";
