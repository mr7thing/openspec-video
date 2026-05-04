---
category: shot-production
status: drafting
# ComfyUI Local 和 RunningHub 各用各自的 workflow 字段
workflow_id: "1904136902449209346"    # RunningHub workflowId
workflow_path: "ref2.json"             # ComfyUI Local JSON 文件名
# node_mapping 格式通用（两种 provider 一致）
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
# CLI: opsv comfy --model <key> --force-api-mapping  # 强制使用 api_config 的 mapping
refs:
  - role_hero
---

## Vision
<!-- 导演原意：镜头、构图、情绪 -->

## Design References
<!-- 外部参考与附件（编译时作为 reference_images 传入） -->
![参考图1](refs/hero_pose.jpg)

## Approved References
<!-- 审批回写区域 -->
