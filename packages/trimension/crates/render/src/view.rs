//! `view()` — the single entry point required by invariant **I6**.

use crate::camera::{Camera, ViewMode};
use crate::scene::{self, LineVertex, MeshVertex, Scene, Uniforms};
use crate::surface::{Rgba8Image, Target};
use tri_doc::Document;
use wgpu::util::DeviceExt;

/// Live GPU resources. Created once and reused; creating a device per frame is what
/// makes naive wgpu code slow.
pub struct Renderer {
    adapter: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    /// Lines that ignore depth — plan view, where everything is coplanar.
    line_overlay: wgpu::RenderPipeline,
    /// Lines occluded by solids — every 3D view.
    line_depth: wgpu::RenderPipeline,
    mesh_pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    format: wgpu::TextureFormat,
}

#[derive(Debug)]
pub enum RenderError {
    NoAdapter,
    Device(String),
    Readback(String),
    /// The swapchain no longer matches the canvas — it resized, the DPI changed, or the
    /// surface was lost. Routine in a browser, and recoverable: reconfigure and draw
    /// again. Typed separately so callers can retry rather than surfacing it as a fault.
    SurfaceOutdated,
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::NoAdapter => write!(
                f,
                "no wgpu adapter. On a headless Linux CI box install mesa-vulkan-drivers \
                 (lavapipe) and set WGPU_BACKEND=vulkan"
            ),
            RenderError::Device(m) => write!(f, "could not create device: {m}"),
            RenderError::Readback(m) => write!(f, "could not read the framebuffer back: {m}"),
            RenderError::SurfaceOutdated => {
                write!(f, "the swapchain is stale; reconfigure and draw again")
            }
        }
    }
}

impl std::error::Error for RenderError {}

/// The colour format used everywhere. Fixed rather than negotiated so that a headless
/// render and a browser render cannot disagree about channel order — the single most
/// likely source of a spurious parity failure.
pub const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;

impl Renderer {
    /// Create a renderer with no surface at all. This is the constructor the headless
    /// path and the CI parity test use, and it must keep working with no display.
    pub async fn headless() -> Result<Renderer, RenderError> {
        Self::with_compatible_surface(None).await
    }

    /// Create a renderer for a browser canvas (or a native window).
    pub async fn for_surface(surface: &wgpu::Surface<'_>) -> Result<Renderer, RenderError> {
        Self::with_compatible_surface(Some(surface)).await
    }

    async fn with_compatible_surface(
        compatible: Option<&wgpu::Surface<'_>>,
    ) -> Result<Renderer, RenderError> {
        // Chosen below once the adapter is known.
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                // Fallback adapter allowed: on CI there is no GPU and lavapipe is the
                // point, not a degraded mode.
                force_fallback_adapter: false,
                compatible_surface: compatible,
                ..Default::default()
            })
            .await
            .map_err(|_| RenderError::NoAdapter)?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("trimension"),
                // Downlevel defaults, so the same code runs on WebGL2.
                required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                    .using_resolution(adapter.limits()),
                ..Default::default()
            })
            .await
            .map_err(|e| RenderError::Device(e.to_string()))?;

        // One format everywhere, including on a canvas that would prefer BGRA.
        //
        // Chrome warns that this costs an extra copy per present, and it is right. Taking
        // the surface's preferred format was tried and produced a black canvas — the
        // pipelines, the swapchain and the sRGB view have to agree and something in that
        // chain did not. It is a worthwhile optimisation and it is not worth shipping a
        // broken viewport for: four small viewports at 60Hz are nowhere near a copy-bound
        // budget, and the fixed format is also what makes the headless and browser paths
        // trivially comparable.
        //
        // If this is revisited: the failure was silent, so start by dumping
        // `surface.get_capabilities()` and asserting the pipeline target format equals
        // the view format actually created in `render_to_surface`.
        Ok(Self::build(adapter, device, queue, FORMAT))
    }

    fn build(
        adapter: wgpu::Adapter,
        device: wgpu::Device,
        queue: wgpu::Queue,
        format: wgpu::TextureFormat,
    ) -> Renderer {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("trimension.wgsl"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("uniforms"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("uniforms"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("uniforms"),
            layout: &layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("trimension"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });

        // Builds and creates in one step: returning the descriptor would hand back
        // references to temporaries created inside the closure.
        let make_line_pipeline = |label: &'static str, compare: wgpu::CompareFunction| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_line"),
                    buffers: &[Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<LineVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x4],
                    })],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_line"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: FORMAT,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::LineList,
                    ..Default::default()
                },
                // Lines share the pass's depth attachment (the formats must match) but do not
                // write to it: in plan view every line sits at z=0 and should draw over the
                // fill, and in 3D the lines are wireframe overlay on solids.
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth32Float,
                    depth_write_enabled: Some(false),
                    depth_compare: Some(compare),
                    stencil: Default::default(),
                    bias: Default::default(),
                }),
                multisample: Default::default(),
                multiview_mask: None,
                cache: None,
            })
        };

        let line_overlay = make_line_pipeline("lines.overlay", wgpu::CompareFunction::Always);
        let line_depth = make_line_pipeline("lines.depth", wgpu::CompareFunction::LessEqual);

        let mesh_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("mesh"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_mesh"),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<MeshVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x4],
                })],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_mesh"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });

        Renderer {
            adapter,
            device,
            queue,
            line_overlay,
            line_depth,
            mesh_pipeline,
            uniform_buffer,
            bind_group,
            format,
        }
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.format
    }

    /// A surface configuration this adapter will actually accept.
    ///
    /// The renderer pins one sRGB format so a canvas and a headless texture cannot
    /// disagree about encoding — but a **WebGPU canvas context does not accept an sRGB
    /// format**. The permitted context formats are the linear ones (`rgba8unorm`,
    /// `bgra8unorm`); sRGB is reachable only as a *view* format. Configuring the canvas
    /// with `Rgba8UnormSrgb` does not error loudly, it just makes every
    /// `get_current_texture` return `Outdated`, which reads as "the GPU is broken".
    ///
    /// So: configure in linear, declare the sRGB view format, and let
    /// [`Self::render_to_surface`] take the view in [`FORMAT`]. The pipeline is unchanged
    /// and parity with the headless path holds.
    pub fn surface_config(
        &self,
        surface: &wgpu::Surface<'_>,
        width: u32,
        height: u32,
    ) -> wgpu::SurfaceConfiguration {
        let caps = surface.get_capabilities(&self.adapter);
        // The pipeline's format with the sRGB suffix stripped: that is the linear form a
        // WebGPU canvas will accept, and the sRGB view is declared below.
        let linear = self.format.remove_srgb_suffix();
        let format = if caps.formats.contains(&linear) {
            linear
        } else {
            caps.formats.first().copied().unwrap_or(linear)
        };
        wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            color_space: wgpu::SurfaceColorSpace::Srgb,
            width: width.max(1),
            height: height.max(1),
            present_mode: caps
                .present_modes
                .first()
                .copied()
                .unwrap_or(wgpu::PresentMode::Fifo),
            alpha_mode: caps
                .alpha_modes
                .first()
                .copied()
                .unwrap_or(wgpu::CompositeAlphaMode::Auto),
            view_formats: vec![format.add_srgb_suffix()],
            desired_maximum_frame_latency: 2,
        }
    }

    /// Draw a scene into a texture view. Shared by both targets — every pixel either
    /// path produces comes from this function.
    fn encode(&self, scene: &Scene, colour: &wgpu::TextureView, width: u32, height: u32) {
        self.queue.write_buffer(
            &self.uniform_buffer,
            0,
            bytemuck::bytes_of(&scene.uniform_bytes()),
        );

        let depth = self
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("depth"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Depth32Float,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&Default::default());

        let lines = (!scene.lines.is_empty()).then(|| {
            self.device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("lines"),
                    contents: bytemuck::cast_slice(&scene.lines),
                    usage: wgpu::BufferUsages::VERTEX,
                })
        });
        let mesh = (!scene.mesh.is_empty()).then(|| {
            self.device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("mesh"),
                    contents: bytemuck::cast_slice(&scene.mesh),
                    usage: wgpu::BufferUsages::VERTEX,
                })
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });
        {
            let bg = scene.uniforms.background;
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("main"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: colour,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: bg[0] as f64,
                            g: bg[1] as f64,
                            b: bg[2] as f64,
                            a: bg[3] as f64,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_bind_group(0, &self.bind_group, &[]);

            if let Some(buf) = &mesh {
                pass.set_pipeline(&self.mesh_pipeline);
                pass.set_vertex_buffer(0, buf.slice(..));
                pass.draw(0..scene.mesh.len() as u32, 0..1);
            }
            if let Some(buf) = &lines {
                pass.set_pipeline(if scene.depth_test_lines {
                    &self.line_depth
                } else {
                    &self.line_overlay
                });
                pass.set_vertex_buffer(0, buf.slice(..));
                pass.draw(0..scene.lines.len() as u32, 0..1);
            }
        }
        self.queue.submit([encoder.finish()]);
    }

    /// Render into a canvas swapchain. The browser path.
    pub fn render_to_surface(
        &self,
        scene: &Scene,
        surface: &wgpu::Surface<'_>,
        width: u32,
        height: u32,
    ) -> Result<(), RenderError> {
        // wgpu 30 reports acquisition problems as enum variants rather than an Err, and
        // most of them are recoverable — a resized or occluded canvas is a normal event
        // in a browser, not a failure worth surfacing to the user.
        use wgpu::CurrentSurfaceTexture as C;
        let frame = match surface.get_current_texture() {
            C::Success(t) | C::Suboptimal(t) => t,
            C::Timeout | C::Occluded => return Ok(()),
            C::Outdated | C::Lost => return Err(RenderError::SurfaceOutdated),
            other => {
                return Err(RenderError::Readback(format!(
                    "could not acquire a surface texture: {other:?}"
                )))
            }
        };
        // Take the view in the pipeline's format, not the texture's — the canvas is
        // configured linear and this is where the sRGB encoding is applied.
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor {
            format: Some(frame.texture.format().add_srgb_suffix()),
            ..Default::default()
        });
        self.encode(scene, &view, width, height);
        // wgpu 30 moved presentation onto the queue.
        self.queue.present(frame);
        Ok(())
    }

    /// Render offscreen and read the pixels back. No window, no canvas, no display.
    pub fn render_to_image(
        &self,
        scene: &Scene,
        width: u32,
        height: u32,
    ) -> Result<Rgba8Image, RenderError> {
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("headless"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: self.format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&Default::default());
        self.encode(scene, &view, width, height);

        // Buffer rows must be 256-byte aligned for a texture-to-buffer copy.
        let unpadded = width * 4;
        let padded = unpadded.div_ceil(256) * 256;
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: (padded * height) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("readback"),
            });
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit([encoder.finish()]);

        let slice = buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|e| RenderError::Readback(format!("{e:?}")))?;
        rx.recv()
            .map_err(|e| RenderError::Readback(e.to_string()))?
            .map_err(|e| RenderError::Readback(format!("{e:?}")))?;

        let data = slice
            .get_mapped_range()
            .map_err(|e| RenderError::Readback(format!("{e:?}")))?;
        let mut pixels = Vec::with_capacity((unpadded * height) as usize);
        for row in 0..height {
            let start = (row * padded) as usize;
            pixels.extend_from_slice(&data[start..start + unpadded as usize]);
        }
        drop(data);
        buffer.unmap();

        Ok(Rgba8Image {
            width,
            height,
            pixels,
        })
    }
}

/// The function invariant I6 is written about.
///
/// Works with no window, no canvas, no browser, on a headless Linux server. The browser
/// path is [`Renderer::render_to_surface`] with the same [`Scene`] and the same shader.
///
/// Convenience wrapper that creates a device per call — fine for `render_view` and for
/// tests, wrong for an interactive loop. Hold a [`Renderer`] for that.
pub fn view(doc: &Document, camera: Camera, mode: ViewMode) -> Result<Rgba8Image, RenderError> {
    let renderer = pollster::block_on(Renderer::headless())?;
    let scene = scene::build(doc, camera, mode);
    renderer.render_to_image(&scene, camera.width_px, camera.height_px)
}

/// Build the scene without touching a GPU. Used by the parity test and by anything that
/// needs to know what *would* be drawn.
pub fn scene_for(doc: &Document, camera: Camera, mode: ViewMode) -> Scene {
    scene::build(doc, camera, mode)
}

/// Draw into whichever target is given. Present so that adding a third surface later
/// cannot fork the drawing code.
pub fn render(
    renderer: &Renderer,
    scene: &Scene,
    target: Target<'_>,
) -> Result<Option<Rgba8Image>, RenderError> {
    let (w, h) = target.size();
    match target {
        Target::Headless { .. } => renderer.render_to_image(scene, w, h).map(Some),
        Target::Surface { surface, .. } => {
            renderer.render_to_surface(scene, surface, w, h)?;
            Ok(None)
        }
    }
}
