//! Reviewed monitor-v7 JSON adapter. Unknown fields remain in the immutable
//! source envelope; typed values are an interpretation, never its replacement.
pub mod model;
pub mod normalize;
pub mod observations;
pub use model::*;

pub const SEMANTICS_VERSION: &str = "official-observations-v8";
pub const KINDS: &[(&str, &str)] = &[
    ("mainchain_transition", "MainchainTransition"),
    ("confirmed_bmm_fees", "ConfirmedBmmFees"),
    ("chain_info", "ChainInfo"),
    ("chain_tip", "ChainTip"),
    ("sidechain_proposals", "SidechainProposals"),
    ("active_sidechains", "ActiveSidechains"),
    ("ctip", "Ctip"),
    ("block_connected", "BlockConnected"),
    ("block_disconnected", "BlockDisconnected"),
    ("withdrawal_bundle_proposals", "WithdrawalBundleProposals"),
    ("mainchain_block", "MainchainBlock"),
    ("bmm_requests", "BmmRequests"),
];

pub fn body<'a>(
    kind: &str,
    payload: &'a serde_json::Value,
) -> anyhow::Result<Option<&'a serde_json::Value>> {
    use anyhow::Context;
    let Some((_, name)) = KINDS.iter().find(|(k, _)| *k == kind) else {
        return Ok(None);
    };
    Ok(Some(
        payload
            .pointer(&format!("/monitor_event/Enforcer/event/{name}"))
            .or_else(|| payload.pointer(&format!("/monitor_event/Node/event/{name}")))
            .context("event kind differs from payload variant")?,
    ))
}

/// BIP300 hashes the decoded byte vector, excluding its CompactSize prefix.
pub fn description_hash(raw: &str) -> anyhow::Result<String> {
    use anyhow::{Context, ensure};
    use sha2::{Digest, Sha256};
    let raw = hex::decode(raw)?;
    let first = *raw.first().context("missing description length")?;
    let (prefix, length) = match first {
        0..=252 => (1, u64::from(first)),
        253 => (
            3,
            u64::from(u16::from_le_bytes(
                raw.get(1..3).context("short CompactSize")?.try_into()?,
            )),
        ),
        254 => (
            5,
            u64::from(u32::from_le_bytes(
                raw.get(1..5).context("short CompactSize")?.try_into()?,
            )),
        ),
        255 => (
            9,
            u64::from_le_bytes(raw.get(1..9).context("short CompactSize")?.try_into()?),
        ),
    };
    ensure!(
        match prefix {
            3 => length >= 253,
            5 => length > u16::MAX.into(),
            9 => length > u32::MAX.into(),
            _ => true,
        },
        "noncanonical CompactSize"
    );
    ensure!(
        usize::try_from(length)? == raw.len() - prefix,
        "description length mismatch"
    );
    let mut hash = Sha256::digest(Sha256::digest(&raw[prefix..])).to_vec();
    hash.reverse();
    Ok(hex::encode(hash))
}

/// Decode the reviewed v0 declaration when its raw vector has that shape.
/// Future versions and opaque descriptions remain valid identities without a title.
pub fn declaration(raw: &str) -> Option<Declaration> {
    description_hash(raw).ok()?;
    let bytes = hex::decode(raw).ok()?;
    let prefix = match bytes[0] {
        253 => 3,
        254 => 5,
        255 => 9,
        _ => 1,
    };
    let body = bytes.get(prefix..)?;
    if *body.first()? != 0 {
        return None;
    }
    let title_end = 2 + usize::from(*body.get(1)?);
    let hashes = body.len().checked_sub(52)?;
    let title = std::str::from_utf8(body.get(2..title_end)?)
        .ok()?
        .to_owned();
    let description = std::str::from_utf8(body.get(title_end..hashes)?)
        .ok()?
        .to_owned();
    Some(Declaration {
        declaration: Some(DeclarationVersion::V0(DeclarationV0 {
            title,
            description,
            hash_id_1: hex::encode(body.get(hashes..hashes + 32)?),
            hash_id_2: hex::encode(body.get(hashes + 32..)?),
        })),
    })
}
#[cfg(test)]
mod tests;
