// `sqlx::migrate!` embeds the migrations at compile time; rebuild when one is
// added or changed so a binary never ships a stale migration set.
fn main() {
    println!("cargo:rerun-if-changed=../../migrations");
}
