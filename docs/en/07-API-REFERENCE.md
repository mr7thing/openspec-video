# OpsV Provider Interface Specification (v0.5.19)

> Defines the mandatory interface contract for all image/video generation Providers in OpsV.

---

## 1. Design Philosophy (Mandatory Interface)

**Since v0.5.2, `generateAndDownload` is the ONLY required method for all Providers.**

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

### 2.1 ImageProvider

```typescript
export interface ImageProvider {
    /** Unique identifier, matches the `provider` field in api_config.yaml */
    providerName: string;

    /**
     * Execute the complete image generation → write-to-disk flow (ONLY required method)
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

### 2.2 VideoProvider

```typescript
export interface VideoProvider {
    /** Unique identifier */
    providerName: string;

    /**
     * Execute the complete video generation → write-to-disk flow
     */
    generateAndDownload(
        job: Job,
        modelName: string,
        apiKey: string,
        outputPath: string
    ): Promise<void>;
}
```

---

## 3. Existing Providers

### Image Providers

| Provider Class | File | Vendor | Status |
|----------------|------|--------|--------|
| `SeaDreamProvider` | providers/SeaDreamProvider.ts | Volcengine | ✅ Implemented |
| `SiliconFlowProvider` | providers/SiliconFlowProvider.ts | SiliconFlow (Dual Image/Video) | ✅ Implemented (v0.5.16) |
| `MinimaxImageProvider` | providers/MinimaxImageProvider.ts | MiniMax | ✅ Implemented |

### Video Providers

| Provider Class | File | Vendor | Status |
|----------------|------|--------|--------|
| `SeedanceProvider` | providers/SeedanceProvider.ts | Volcengine (Seedance) | ✅ Implemented (v0.5.15) |
| `SiliconFlowProvider` | providers/SiliconFlowProvider.ts | SiliconFlow (Wan 2.1) | ✅ Implemented |
| `MinimaxVideoProvider` | providers/MinimaxVideoProvider.ts | MiniMax (Hailuo) | ✅ Implemented |

> **Note**: `SiliconFlowProvider` serves dual image and video roles, auto-switching endpoints (`/generations` vs `/submit`) based on the model's `type` field in `api_config.yaml`.

---

## 4. New Provider Requirements (MANDATORY)

### 4.1 Three Defensive Coding Standards

1. **Deep Penetrative Parsing**: Never assume a single response structure. Handle `data.id`, `data.data.id`, and other variants defensively.
2. **Evidential Logging**: Never return `undefined`. Always use `JSON.stringify(rawResponse)` to log the complete payload on any non-2xx response.
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
     4. Download image/video buffer, write to outputPath
     5. Verify file exists and size > 0

Must register:
  ✅ Add to ImageModelDispatcher or VideoModelDispatcher
  ✅ Configure provider and type fields in api_config.yaml

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
// ImageModelDispatcher / VideoModelDispatcher pseudo-code
await provider.generateAndDownload(job, targetModel, apiKey, finalOutputPath);
// That's it. No instanceof. No branches.
```

---

> *"The Interface is the Contract; Documentation is the Insurance; Tests are the Proof."*
> *OpsV v0.5.19 | Updated: 2026-04-17*
