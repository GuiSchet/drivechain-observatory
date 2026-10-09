import type { RefId } from "./references";

export type GlossaryEntry = { term: string; short: string; chapter: string; refs?: RefId[] };

// Definitions stay short; the linked chapter explains each one with live data.
export const glossary = {
  l1: { term: "L1 (mainchain)", short: "The base blockchain. Here it is eCash Betanet, a fork of Bitcoin mainnet that enforces BIP300 and BIP301.", chapter: "what-is-a-drivechain" },
  sidechain: { term: "Sidechain (L2)", short: "A separate blockchain whose coins are locked on the L1 and released only by a slow miner vote. It has its own software and rules.", chapter: "what-is-a-drivechain", refs: ["bip300Abstract"] },
  "hashrate-escrow": { term: "Hashrate escrow", short: "BIP300's name for a sidechain's locked coins: miners, voting with the blocks they find, decide when coins may leave.", chapter: "what-is-a-drivechain", refs: ["bip300"] },
  enforcer: { term: "Enforcer", short: "The program that checks the BIP300/301 rules alongside the L1 node. The Observatory reads its official API.", chapter: "how-we-know", refs: ["enforcer"] },
  block: { term: "Block", short: "A batch of transactions added to the chain by a miner, on average every ten minutes.", chapter: "blocks" },
  height: { term: "Height", short: "A block's position in the chain: the number of blocks before it.", chapter: "blocks" },
  "block-hash": { term: "Block hash", short: "A block's unique fingerprint. Each block also records the hash of its parent, which links the chain together.", chapter: "blocks" },
  reorg: { term: "Reorganization (reorg)", short: "When the network switches to a competing branch with more work, so some recent blocks stop being part of the chain.", chapter: "blocks" },
  coinbase: { term: "Coinbase transaction", short: "The first transaction in a block, written by the miner. BIP300 and BIP301 place the miners' messages and votes there.", chapter: "creating-a-sidechain", refs: ["bip300M1"] },
  slot: { term: "Slot", short: "One of 256 numbered places (0–255) a sidechain can occupy. A slot can host different sidechains over time.", chapter: "slots", refs: ["bip300D1"] },
  instance: { term: "Sidechain instance", short: "One specific sidechain in a slot, identified by its slot, proposal, activation height and declaration hash.", chapter: "slots" },
  declaration: { term: "Declaration", short: "What a proposal says about the sidechain: title, description and two hashes intended to identify its software.", chapter: "slots", refs: ["bip300M1"] },
  m1: { term: "M1 · Propose sidechain", short: "A coinbase message that proposes a new sidechain for a slot.", chapter: "creating-a-sidechain", refs: ["bip300M1"] },
  m2: { term: "M2 · ACK proposal", short: "A coinbase message in which a miner votes for a pending sidechain proposal.", chapter: "creating-a-sidechain", refs: ["bip300M2"] },
  threshold: { term: "Threshold", short: "The number of votes that must be exceeded, within a maximum age, for a proposal or withdrawal to pass. Betanet reports its own values.", chapter: "creating-a-sidechain", refs: ["enforcerBetanet"] },
  ctip: { term: "CTIP (treasury output)", short: "The single unspent output holding all of a sidechain's locked coins. Every deposit or withdrawal replaces it with a new one.", chapter: "deposits", refs: ["bip300M5", "spec300Treasury"] },
  m5: { term: "M5 · Deposit", short: "An L1 transaction that spends the treasury output and creates a new one holding more coins.", chapter: "deposits", refs: ["bip300M5"] },
  "op-drivechain": { term: "OP_DRIVECHAIN", short: "The opcode that marks a treasury output. BIP300 uses OP_NOP5; Betanet uses OP_NOP8.", chapter: "deposits", refs: ["bip300OpDrivechain", "enforcerOpDrivechain"] },
  bundle: { term: "Withdrawal bundle", short: "Many withdrawals from one sidechain combined into one L1 transaction. It pays everyone or no one.", chapter: "withdrawals", refs: ["bip300Bundles"] },
  m6id: { term: "M6 id", short: "The identifier miners vote on for a bundle: the id of a \"blinded\" copy of the withdrawal transaction without its treasury input, which usually does not exist yet when voting starts.", chapter: "withdrawals", refs: ["bip300D2"] },
  m3: { term: "M3 · Propose bundle", short: "A coinbase message that puts a withdrawal bundle up for a vote. It counts as the first vote.", chapter: "withdrawals", refs: ["bip300M3"] },
  m4: { term: "M4 · ACK bundles", short: "A coinbase message with each block's withdrawal votes: upvote one bundle per sidechain, abstain, or raise an alarm.", chapter: "withdrawals", refs: ["bip300M4"] },
  m6: { term: "M6 · Withdraw", short: "The L1 transaction that pays out an approved bundle and returns the rest of the coins to a new treasury output.", chapter: "withdrawals", refs: ["bip300M6"] },
  bmm: { term: "Blind merged mining (BMM)", short: "BIP301's way for L1 miners to earn sidechain fees without running sidechain software.", chapter: "merged-mining", refs: ["bip301"] },
  "bmm-request": { term: "BMM Request (M8)", short: "A sidechain user's L1 transaction offering miners a payment if the block commits to their sidechain block hash.", chapter: "merged-mining", refs: ["bip301Request", "spec301M8"] },
  "bmm-accept": { term: "BMM Accept (M7)", short: "A miner's coinbase commitment to one sidechain block hash per slot.", chapter: "merged-mining", refs: ["bip301Accept", "spec301M7"] },
  bid: { term: "Bid", short: "The amount a BMM Request offers the L1 miner.", chapter: "merged-mining", refs: ["bip301Request"] },
  evidence: { term: "Evidence", short: "The exact record the monitor captured from the enforcer or node, kept so anyone can check what a page shows.", chapter: "how-we-know", refs: ["sourceContract"] },
  "observed-in-block": { term: "Observed in a block", short: "A fact the official sources reported for a specific L1 block.", chapter: "how-we-know" },
  "read-now": { term: "Read at a tip", short: "A reading of current state taken while the chain tip stayed the same before and after. It is not tied to one block and does not prove an atomic snapshot.", chapter: "how-we-know" },
  unknown: { term: "Unknown", short: "The data is missing, conflicting or was read while the chain moved. The Observatory never fills such gaps by guessing.", chapter: "how-we-know" },
  coverage: { term: "Coverage", short: "Which blocks the monitor has actually recorded. Without coverage, a missing record does not mean nothing happened.", chapter: "how-we-know" },
} satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof glossary;
