# LoRA Stack Examples — LoRA 配置示例

## 1. 单 LoRA 模式（常用）

```yaml
switch_1: "On"
lora_name_1: "scene_style_lora.safetensors"
model_weight_1: 0.8
clip_weight_1: 1.0
switch_2: "Off"
switch_3: "Off"
```

## 2. 双 LoRA 叠加

```yaml
switch_1: "On"
lora_name_1: "character_style_v1.safetensors"
model_weight_1: 0.7
clip_weight_1: 1.0
switch_2: "On"
lora_name_2: "lighting_enhance.safetensors"
model_weight_2: 0.5
clip_weight_2: 1.0
switch_3: "Off"
```

## 3. 无 LoRA 模式

```yaml
switch_1: "Off"
switch_2: "Off"
switch_3: "Off"
```

## 4. 预置 LoRA 列表

| LoRA 文件 | 用途 | 推荐权重 |
|-----------|------|---------|
| `QQES28ZN55FDWQS58XTJNVS0Y0.safetensors` | 通用风格 | 0.8 |
| `hina_flux2Klein9b_asianMix_v1.4.safetensors` | 亚洲风格混合 | 1.0 |
| `next-scene_lora-v2-3000.safetensors` | 场景延续 | 1.0 |
| `qwen-image-edit-2511多角度.safetensors` | 角色多视图 | 1.0 |
| `klein9b-Camera-Blocking.safetensors` | 镜头调度专用 | 1.0 |

## 5. 权重调优建议

- **模型权重 > 0.8**：风格可能过于强烈，导致画面失真
- **模型权重 < 0.5**：风格影响不明显
- **Clip 权重**：通常保持 1.0，除非出现文本理解偏差
