//! Fail loudly if there is no wgpu adapter.
//!
//! ```bash
//! cargo run -p tri-render --example gpu_check
//! ```
//!
//! CI runs this immediately after installing lavapipe and before any tests. The renderer
//! tests skip themselves when no adapter is present, which is right on a developer
//! machine and a trap in CI: the job goes green having exercised none of the renderer.
//! `TRIMENSION_REQUIRE_GPU` turns those skips into failures, but this check is the direct
//! one — it names the adapters it found, so a broken runner image is diagnosable from the
//! log rather than inferred from a suspiciously fast test run.

fn main() {
    let ok = pollster::block_on(async {
        let instance =
            wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());

        if let Ok(v) = std::env::var("WGPU_BACKEND") {
            println!("WGPU_BACKEND={v}");
        }

        let adapters = instance.enumerate_adapters(wgpu::Backends::all()).await;
        println!("adapters found: {}", adapters.len());
        for a in &adapters {
            let i = a.get_info();
            println!("  {:?}  {}  ({:?})", i.backend, i.name, i.device_type);
        }

        match tri_render::Renderer::headless().await {
            Ok(_) => {
                println!("Renderer::headless() -> ok");
                true
            }
            Err(e) => {
                eprintln!("Renderer::headless() -> {e}");
                false
            }
        }
    });

    if !ok {
        eprintln!(
            "\nNo usable wgpu adapter. On a headless Linux runner:\n\
             \n    sudo apt-get install -y mesa-vulkan-drivers vulkan-tools\n\
             \nand set WGPU_BACKEND=vulkan.\n"
        );
        std::process::exit(1);
    }
}
