# SeedVR2 Upscale Guide — SeedVR2 超分参数指南

## 1. 节点配置

### SeedVR2BlockSwap（内存优化）
```yaml
blocks_to_swap: 16
use_non_blocking: true
offload_io_components: false
```

### SeedVR2ExtraArgs（VAE 分块）
```yaml
tiled_vae: true
vae_tile_size: 512
vae_tile_overlap: 64
preserve_vram: false
cache_model: false
```

### SeedVR2VideoUpscaler（超分执行）
```yaml
resolution: 2560
max_resolution: 0
batch_size: 1
uniform_batch_size: false
color_correction: lab
temporal_overlap: 0
prepend_frames: 0
input_noise_scale: 0
latent_noise_scale: 0
```

## 2. 分辨率选择

| 输入分辨率 | 输出分辨率 | 适用场景 |
|-----------|-----------|---------|
| 1024x1024 | 2560x2560 | 角色头像 |
| 1200x1808 | 2560x3840 | 角色全身 |
| 1920x1080 | 3840x2160 | 场景宽屏 |

## 3. 注意事项

1. **blocks_to_swap=16** — 交换 16 个 block 到 CPU 内存，节省 GPU 显存
2. **tiled_vae=true** — 分块 VAE 编码/解码，避免 OOM
3. **color_correction=lab** — LAB 空间色彩校正，保持超分后色彩一致
4. **temporal_overlap=0** — 静态图像不需要时间重叠
5. **SeedVR2 模型**: `seedvr2_ema_3b_fp16.safetensors`
6. **VAE 模型**: `ema_vae_fp16.safetensors`
