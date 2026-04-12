# OpsV Image Provider Interface Specification (v0.5.2)

> Defines the mandatory interface contract for all image generation Providers in OpsV.

---

## 1. Design Philosophy (Scheme A: Mandatory Interface)

**Since v0.5.2, `generateAndDownload` is the ONLY required method for all ImageProviders.**

The old two-step pattern (`generateImage` returns URL → Dispatcher manually downloads) has been deprecated. Each Provider is now a complete "Submit-Poll-Download" execution unit. The Dispatcher doesn't need to know implementation details — it calls one method, holds one promise.

```
Before (Deprecated):
  Dispatcher → provider.generateImage() → result.url
  Dispatcher → download(result.url) → write to disk
  Problem: Dispatcher must know each Provider's save strategy → instanceof dead code

After (Current):
  Dispatcher → provider.generateAndDownload(job, model, apiKey, outputPath)
  Provider handles internally: Submit + Poll + Download + Write to disk
  Benefit: Interface is the contract, no instanceof, no branches, zero-intrusion for new Providers
```

---

## 2. Interface Definition

```typescript
export interface ImageProvider {
    /** Unique identifier, matches the `provider` field in api_config.yaml */
    providerName: string;

    /**
     * Execute the complete image generation → write-to-disk flow (ONLY required method)
     *
     * Success: File has been written to outputPath, function resolves normally
     * Failure: Throw an Error (or OpsVError) with detailed information
     * Timeout: Throw an Error containing "超时" or "timeout" keyword
     *          (Dispatcher relies on this keyword to distinguish timeout vs failed status)
     */
    generateAndDownload(
        job: Job,
        modelName: string,
        apiKey: string,
        outputPath: string
    ): Promise<void>;

    /** Optional: Capability probe */
    supportsFeature?(feature: string): boolean;
}
```

---

## 3. Existing Providers

| Provider Class | File | Task Type | Status |
|----------------|------|-----------|--------|
| `SeaDreamProvider` | providers/SeaDreamProvider.ts | image_generation | ✅ generateAndDownload implemented |
| `MinimaxImageProvider` | providers/MinimaxImageProvider.ts | image_generation | ✅ generateAndDownload implemented |

---

## 4. New Provider Requirements (MANDATORY)

### 4.1 Three Defensive Coding Standards

1. **Deep Penetrative Parsing**: Never assume a single response structure. Handle `data.id`, `data.data.id`, and other variants defensively.
2. **Evidential Logging**: Never return `undefined`. Always use `JSON.stringify(rawResponse)` to log the complete payload on any non-2xx response or suspected format error.
3. **Axios Defensive Handling**: Distinguish between `error.response` (API business error) and `error.code` (e.g., `ETIMEDOUT`, network interruption).

### 4.2 Integration Checklist

```
Must implement:
  ✅ providerName: string (must match api_config.yaml provider field)
  ✅ generateAndDownload(job, modelName, apiKey, outputPath): Promise<void>

  ✅ Internal responsibilities:
     1. Read parameters from job.payload
     2. POST submit request (per official API format)
     3. Poll until completion (recommended: 3-5s interval, throw on timeout)
     4. Download image buffer, write to outputPath
     5. Verify file exists and size > 0

Must register:
  ✅ Add to ImageModelDispatcher.registerProviders()
  ✅ Configure provider field in api_config.yaml

Prohibited:
  ❌ Using instanceof to detect other Providers inside your Provider
  ❌ Returning ImageGenerationResult (old interface, deprecated)
  ❌ Exposing URL download logic to the Dispatcher
```

### 4.3 Timeout Convention

```typescript
// Providers must manage their own timeout
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const deadline = Date.now() + TIMEOUT_MS;

while (Date.now() < deadline) {
    const status = await pollStatus(requestId);
    if (status === 'completed') break;
    await sleep(3000);
}

if (Date.now() >= deadline) {
    throw new Error(`Generation timeout (${TIMEOUT_MS / 1000}s): ${job.id}`);
    // ↑ Contains "timeout" keyword, recognized by Dispatcher for stats
}
```

---

## 5. Dispatcher Calling Protocol (Internal Reference)

The Dispatcher's only responsibility: **Route + Inject Config + Aggregate Stats**.

```typescript
// ImageModelDispatcher.dispatchJob pseudo-code
await provider.generateAndDownload(job, targetModel, apiKey, finalOutputPath);
// That's it. No instanceof. No branches.
```

---

## 6. Core API Specifications

### 6.1 ByteDance Seedance 1.5 Pro (Video)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/submit`
- **Auth**: `Authorization: Bearer <VOLCENGINE_API_KEY>`
- **Key Parameters**: `model: "doubao-seedance-1-5-pro"`, `resolution: "480p|720p|1080p"`, `image` (Base64 first frame)

### 6.2 SeaDream 5.0 (Image Generation)
- **Endpoint**: `https://api.volcengine.com/visual/image_generation/2024-08-01`
- **Auth**: `Authorization: Bearer <VOLCENGINE_API_KEY>`
- **Key Parameters**: `req_key: "high_definition_generation"`, `model_version: "seadream_5_0"`, `aspect_ratio`

### 6.3 SiliconFlow Wan 2.1 (Video)
- **Endpoint**: `https://api.siliconflow.cn/v1/video/submit`
- **Auth**: `Authorization: Bearer <SILICONFLOW_API_KEY>`
- **Key Parameters**: `model: "wan-ai/Wan2.1-T2V-14B"`, `prompt`

---

> *"The Interface is the Contract; Documentation is the Insurance; Tests are the Proof."*
> *OpsV v0.5.2 | Updated: 2026-04-12*
