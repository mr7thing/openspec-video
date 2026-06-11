---
category: shot-production
status: drafting
# ComfyUI Local 和 RunningHub 均需要 node_mapping（两种 provider 通用）
workflow_id: "1904136902449209346"    # RunningHub workflowId
workflow_path: "ref2.json"             # ComfyUI Local JSON 文件名
negative_prompt: "low quality, blurry"  # 可选：负面提示词
# node_mapping 格式通用（两种 provider 一致，必填）
node_mapping:                          # 用 opsv comfy-node-mapping <workflow.json> 生成
  prompt:
    nodeId: "6"
    fieldName: "text"
  negative_prompt:
    nodeId: "7"
    fieldName: "text"
  image1:
    nodeId: "10"
    fieldName: "image"
  seed:
    nodeId: "3"
    fieldName: "seed"
    # 支持 seed: random（自动替换为随机自然数）
# CLI: opsv comfy --model <key> --force-api-mapping  # 强制使用 api_config 的 mapping
# v0.10.0 refs: 按 input_type 分组，prompt 中每个 @id 都必须在此声明
refs:
  image:
    "@role_hero":
      - opsv-queue/videospec_circle1/volc.seadream5_001/role_hero_1.png
---

## Vision
<!-- 导演原意：镜头、构图、情绪 -->

## Design References
<!-- 资料堆：可堆任意参考图，prompt 通过 @:alt_text 引用 -->

### image
![hero_pose](refs/hero_pose.jpg)

## Approved References
<!-- 审批回写区域 -->

