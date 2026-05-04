---
category: shot-production
status: drafting
workflow: "1904136902449209346"      # RunningHub workflowId 或 Local JSON 文件名
node_mapping:                         # 用 opsv comfy-node-mapping <workflow.json> 生成
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
