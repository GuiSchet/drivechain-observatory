// Project identity and donations. The address was checked: valid bech32
// checksum, mainnet SegWit v0 (P2WPKH). eCash keeps Bitcoin's "bc" prefix, so
// the same address receives BTC and, after eCash's mainnet launch, ECX.
export const project = {
  maintainer: { name: "GuiSchet", href: "https://github.com/GuiSchet", discord: "guischet" },
  repos: {
    observatory: "https://github.com/GuiSchet/drivechain-observatory",
    monitor: "https://github.com/GuiSchet/bip300-monitor",
  },
  donationAddress: "bc1qkh8xcznxzd2l3useajnz22pwsdtthwhp56kt6m",
} as const;
