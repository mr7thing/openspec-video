# OpsV Provider API Reference (v0.6.3)

> Interface contracts and Spooler Queue integration specs for all image/video generation Providers.

---

## 1. Architecture (v0.6.0)

The old `ImageModelDispatcher` / `VideoModelDispatcher` have been **permanently removed**. All execution uses the **Spooler Queue** architecture:

```
opsv generate        �?jobs.json (pure intent)
opsv queue compile   �?.opsv-queue/inbox/{provider}/UUID.json (atomic payload)
opsv queue run       �?QueueWatcher �?provider.processTask(task)
```

---

## 2. Interface Definition

```typescript
interface SpoolerProvider {
    processTask(task: SpoolerTask): Promise<any>;
}

interface SpoolerTask {
    uuid: string;
    payload: any;
    metadata: { provider: string; createdAt: string; };
}
```

QueueWatcher calls: `dequeue() �?processTask() �?markCompleted/markFailed()`

---

## 3. Provider Registry

### Image Providers
| Class | Provider Name | Vendor |
|-------|--------------|--------|
| `SeaDreamProvider` | `seadream` | Volcengine |
| `SiliconFlowProvider` | `siliconflow` | SiliconFlow |
| `MinimaxImageProvider` | `minimax` | MiniMax |

### Video Providers
| Class | Provider Name | Vendor |
|-------|--------------|--------|
| `VolcengineProvider` | `volcengine` | Volcengine (SeaDream / Seedance) |
| `SiliconFlowProvider` | `siliconflow` | SiliconFlow |
| `MinimaxVideoProvider` | `minimax` | MiniMax |

### ComfyUI Providers
| Class | Provider Name | Description |
|-------|--------------|-------------|
| `ComfyUILocalProvider` | `comfyui_local` | Local ComfyUI |
| `RunningHubProvider` | `runninghub` | RunningHub Cloud |

---

## 4. New Provider Checklist

**Three Iron Rules** (Defensive API Protocol):
1. Deep penetrative parsing �?handle multiple response structures
2. Evidential logging �?`JSON.stringify(rawResponse)` for non-2xx
3. Axios defensive handling �?distinguish `error.response` from `error.code`

**Implementation Steps**:
1. Create `src/executor/providers/YourProvider.ts`
2. Implement `processTask(task: SpoolerTask): Promise<any>`
3. Register in `src/commands/queue.ts` run command
4. Configure in `api_config.yaml`

**Forbidden**: Creating new Dispatchers, `instanceof` checks, assuming payload structure.

---

## 5. Spooler Queue State Machine

```
.opsv-queue/
├── inbox/{provider}/        �?queue compile delivers here
├── working/{provider}/      �?QueueWatcher atomically extracts
├── done/{provider}/         �?successful/failed results archived
└── corrupted/{provider}/    �?corrupted JSON isolation
```

Flow:
- `inbox �?working`: atomic `fs.rename` guarantees single-consumer safety
- `working �?done`: task completion or failure
- `working �?inbox`: SIGINT/SIGTERM rollback on graceful shutdown
- `working �?corrupted`: JSON parse failure isolation (non-blocking)

**Atomicity Guarantee**: `dequeue()` uses `fs.rename(inboxPath, workingPath)`:
- POSIX `rename` ensures only one consumer succeeds per file
- `ENOENT` gracefully handled (file already taken by another process)
- No memory locks or external dependencies (Redis/ZooKeeper) required

---

## 6. Compilers

- **StandardAPICompiler**: Serializes Job to UUID.json for HTTP API Providers
- **ComfyUITaskCompiler**: Loads Addon workflow templates, injects parameters via node title convention (`input-prompt`, `input-image1`)

---

> *OpsV v0.6.3 | Last updated: 2026-04-22*
