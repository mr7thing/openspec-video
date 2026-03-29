# OpsV 多模型 API 接口规范 (v0.4.6)

> **API 防御性协议 (API Defensive Protocol)**
> 
> 1. **深度穿透解析 (Deep Penetrative Parsing)**：绝不假设返回体是单一结构。必须兼容 data.data[0]、data.data.data[0]。
> 2. **强力证据式日志 (Evidential Logging)**：所有非 2xx 响应或怀疑格式错误的情况，必须使用 JSON.stringify(apiError) 强制记录原始 JSON。
> 3. **Axios 防空逻辑 (Axios Defensive Handling)**：必须处理 error.response 为空（网络中断/超时）的情况。

---

## 1. 认证规范
所有 Provider 必须支持从 .env 映射的 pi_config.yaml 中读取 piKey。

## 2. 图像生成接口
- **输入**：prompt_en, spect_ratio, 
um_outputs
- **输出**：图片绝对路径列表。

## 3. 视频生成接口 (L2C)
针对 Seedance 1.5 Pro 等模型：
- **输入**：input_image_path, motion_prompt_en, ps, duration
- **输出**：equestId 或视频 URL。

---
> *OpsV 0.4.6 | API 规范核心文档*
