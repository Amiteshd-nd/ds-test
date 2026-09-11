//! Build orchestration. Run as `cargo xtask <cmd>`.
//!
//! Commands: `build-wasm`, `build-server`, `test-all`, `gen-schemas`, `check-targets`.

use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let cmd = std::env::args().nth(1).unwrap_or_default();
    let ok = match cmd.as_str() {
        "build-wasm" => build_wasm(),
        "build-server" => build_server(),
        "test-all" => test_all(),
        "test-wasm" => test_wasm(),
        "gen-schemas" => gen_schemas(),
        "check-targets" => check_targets(),
        "parity" => parity(),
        other => {
            eprintln!("unknown command: {other:?}");
            eprintln!(
                "usage: cargo xtask <build-wasm|build-server|test-all|test-wasm|parity|gen-schemas|check-targets>"
            );
            false
        }
    };
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn run(args: &[&str]) -> bool {
    run_env(args, &[])
}

fn run_env(args: &[&str], env: &[(&str, &str)]) -> bool {
    eprintln!("+ cargo {}", args.join(" "));
    let mut cmd = Command::new(env!("CARGO"));
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// Target 1 of PRD §4.2: `wasm32-unknown-unknown`, the browser client.
fn build_wasm() -> bool {
    run(&[
        "build",
        "-p",
        "tri-wasm",
        "--target",
        "wasm32-unknown-unknown",
    ])
}

/// Target 2 of PRD §4.2: host native, the session server.
fn build_server() -> bool {
    run(&["build", "-p", "tri-server"])
}

/// All three targets from PRD §4.2 build. Target 3 (host native headless) is the same
/// binary as target 2 with no display server; the render parity test in M3 is what
/// actually proves it, so this only asserts it links.
fn check_targets() -> bool {
    build_wasm() && build_server() && run(&["build", "-p", "tri-render"])
}

fn test_all() -> bool {
    run(&["test", "--workspace"]) && test_wasm() && check_targets()
}

/// M1 requires the invariant and determinism tests to pass on wasm32 as well as native —
/// that is what makes "the same crates compile for client and server" (PRD §4.2) a
/// guarantee rather than a claim. Needs `wasm-bindgen-cli` matching the `wasm-bindgen`
/// version in VERSIONS.md, and node on PATH.
fn test_wasm() -> bool {
    run_env(
        &[
            "test",
            "-p",
            "tri-doc",
            "--test",
            "cross_target",
            "--target",
            "wasm32-unknown-unknown",
        ],
        &[(
            "CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER",
            "wasm-bindgen-test-runner",
        )],
    ) && run(&[
        "check",
        "-p",
        "tri-doc",
        "-p",
        "tri-commit",
        "-p",
        "tri-geom2d",
        "-p",
        "tri-solid",
        "-p",
        "tri-render",
        "--target",
        "wasm32-unknown-unknown",
    ])
}

/// I6: the headless render path must agree with the browser path. Lands in M3.
fn parity() -> bool {
    run(&["test", "-p", "tri-render", "--test", "parity"])
}

/// I3: tool schemas are generated, never hand-written.
///
/// Writes one file per tool plus the command registry's own schema. CI runs this and
/// then `git diff --exit-code`, so a stale committed schema fails the build.
fn gen_schemas() -> bool {
    use std::fs;
    use std::path::Path;

    let dir = Path::new("crates/api/schemas");
    if let Err(e) = fs::create_dir_all(dir) {
        eprintln!("could not create {}: {e}", dir.display());
        return false;
    }

    // Remove stale files first, so deleting a tool deletes its schema rather than
    // leaving an orphan that the drift test then has to notice.
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.path().extension().is_some_and(|x| x == "json") {
                let _ = fs::remove_file(e.path());
            }
        }
    }

    let mut wrote = 0;
    for def in tri_api::TOOLS {
        let Some(schema) = tri_api::schema::tool_definition(def.name) else {
            eprintln!(
                "command registry lists tool {:?} but no schema can be generated for it",
                def.name
            );
            return false;
        };
        let path = dir.join(format!("{}.json", def.name));
        if let Err(e) = fs::write(&path, tri_api::schema::to_pretty(&schema)) {
            eprintln!("could not write {}: {e}", path.display());
            return false;
        }
        wrote += 1;
    }

    let path = dir.join("_commands.json");
    if let Err(e) = fs::write(
        &path,
        tri_api::schema::to_pretty(&tri_api::schema::command_schema()),
    ) {
        eprintln!("could not write {}: {e}", path.display());
        return false;
    }

    eprintln!("gen-schemas: wrote {wrote} tool schema(s) + the command registry schema");
    true
}
