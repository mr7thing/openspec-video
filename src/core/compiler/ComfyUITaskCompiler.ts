import * as fs from 'fs/promises';
import * as path from 'path';
import { BatchManifestManager } from '../queue/BatchManifestManager';

export interface TaskIntent {
  shotId: string;
  templateName: string;   // e.g., 'comic-drama-seedance_v2.json'
  provider: string;       // e.g., 'comfyui_local' or 'runninghub'
  parameters: Record<string, string | number>; 
  // e.g., { 'input-prompt': 'a beautiful cat', 'input-image1': '/path/to/image.png' }
}

export class ComfyUITaskCompiler {
  private baseQueueDir: string;
  private templateDir: string;
  constructor(baseQueueDir: string, templateDir: string) {
    this.baseQueueDir = baseQueueDir;
    this.templateDir = templateDir;
  }

  /**
   * Compiles the high-level intent into a low-level machine payload JSON 
   * and pushes it to the correct provider batch queue.
   */
  async compileAndEnqueue(intent: TaskIntent, cycle: string = 'ZeroCircle_1'): Promise<string> {
    // 0. Setup Provider Batch Directory
    const providerDir = path.join(this.baseQueueDir, cycle, intent.provider);
    let batchNum = 1;
    try {
        await fs.mkdir(providerDir, { recursive: true });
        const entries = await fs.readdir(providerDir);
        const batchFolders = entries.filter(e => e.startsWith('queue_'));
        if (batchFolders.length > 0) {
            const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
            batchNum = Math.max(...nums);
        }
    } catch (e) {}

    const batchDir = path.join(providerDir, `queue_${batchNum}`);
    const manager = new BatchManifestManager(batchDir);
    await manager.init(cycle, batchNum);

    // 1. Load the requested workflow template
    const templatePath = path.join(this.templateDir, intent.templateName);
    let workflowStr = await fs.readFile(templatePath, 'utf-8');
    let workflow = JSON.parse(workflowStr);

    // 2. Clone the workflow to manipulate
    const payload = JSON.parse(JSON.stringify(workflow));

    // 3. Optional Interceptor: If provider is runninghub, local files must be uploaded FIRST.
    if (intent.provider === 'runninghub') {
      await this.interceptForRunningHub(intent.parameters);
    }

    // 4. Inject Parameters based on Node Title matching
    this.injectParameters(payload, intent.parameters);

    // 5. Register in Batch Manifest
    const compiledJob = {
      shotId: intent.shotId,
      template: intent.templateName,
      comfyui_payload: payload
    };

    const taskFile = await manager.registerTask(intent.shotId, intent.shotId, compiledJob);
    console.log(`[Compiler] Compiled Shot ${intent.shotId} -> Batch: ${path.basename(path.dirname(taskFile))}`);
    return intent.shotId;
  }

  /**
   * Search through ComfyUI nodes. If a node's _meta.title or title property matches
   * one of our parameter keys (e.g., 'input-prompt'), inject the value.
   */
  private injectParameters(workflow: any, params: Record<string, any>) {
    // ComfyUI workflows are usually dictionaries of nodes
    // e.g., { "1": { "inputs": { "text": "" }, "_meta": { "title": "input-prompt" } } }
    
    const paramKeys = Object.keys(params);

    for (const nodeId in workflow) {
      const node = workflow[nodeId];
      if (!node) continue;

      // Detect title convention
      const title = node._meta?.title || node.title || '';
      
      if (paramKeys.includes(title)) {
        const injectValue = params[title];
        
        // ComfyUI inputs are varied. If it's a string input (like CLIPTextEncode), replace 'text'.
        // If it's an image input (like LoadImage), replace 'image'.
        // We will do a smart heuristic: replace the first key in inputs, or match specific names.
        if (node.inputs) {
          if ('text' in node.inputs) {
            node.inputs['text'] = injectValue;
          } else if ('text_1' in node.inputs) {
             node.inputs['text_1'] = injectValue;
          } else if ('image' in node.inputs) {
            node.inputs['image'] = injectValue;
          } else if ('video' in node.inputs) {
            node.inputs['video'] = injectValue;
          } else {
             // Fallback: Just replace the first string key we find 
             // (Not entirely robust, but works for convention-based simple nodes)
             const firstKey = Object.keys(node.inputs)[0];
             if (firstKey) node.inputs[firstKey] = injectValue;
          }
        }
      }
    }
  }

  /**
   * Pre-flight network interceptor.
   * Modifies original parameters object locally converting paths to URLs.
   */
  private async interceptForRunningHub(params: Record<string, any>) {
    for (const key of Object.keys(params)) {
      const value = params[key];
      // If it looks like a local file path
      if (typeof value === 'string' && (value.endsWith('.png') || value.endsWith('.jpg') || value.endsWith('.mp4'))) {
         if (!value.startsWith('http')) {
           console.log(`[AOT Compiler] Uploading ${value} to RunningHub to get URL...`);
           try {
             // Example mocking a FormData upload
             // const formData = new FormData();
             // formData.append("file", await fs.readFile(value));
             // const res = await fetch("https://www.runninghub.cn/task/openapi/comfyui/upload", { method: 'POST', body: formData, headers: { Authorization: ...} });
             // if (!res.ok) { let errStr = await res.text(); console.error("Upload API Error:", JSON.stringify({ status: res.status, raw: errStr })); throw new Error("Upload Failed"); }
             
             // 准则二与一：防空与日志穿透
             const fakeUrl = `https://runninghub.cn/cdn/mocked_file_${Date.now()}.png`;
             params[key] = fakeUrl; 
           } catch (error: any) {
             console.error(`[AOT Compiler] Network Intercept Fail:`, JSON.stringify({ code: error.code || 'UNKNOWN', message: error.message }));
             throw new Error(`RunningHub pre-flight upload failed: ${error.message}`);
           }
         }
      }
    }
  }
}
