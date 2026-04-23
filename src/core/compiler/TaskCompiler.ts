import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigLoader } from '../../utils/configLoader';
import { logger } from '../../utils/logger';
import { Job } from '../../types/PromptSchema';

/**
 * 检测是否为火山引擎 Seedance 2.0 Content Generation API
 */
function isContentGenerationApi(provider: string, modelCfg: any): boolean {
  return provider === 'volcengine' && modelCfg.api_url?.includes('content_generation');
}


/**
 * TaskCompiler: 将 jobs.json 编译为可直接执行的 Provider 任务 JSON。
 *
 * 设计原则：
 * 1. compile 时读取 api_config，生成完整的 API 请求体（含 URL、参数、reference 映射）
 * 2. run 时 Provider 不再读取 api_config，直接发送 .json 顶层字段
 * 3. references 通用化：compile 时根据 Provider 映射到正确字段（image/image_url/audio 等）
 * 4. queue.json 为只读索引，含 sourceHash 用于增量 compile
 */

export interface CompileResult {
  batchDir: string;
  batchNum: number;
  tasksCompiled: number;
  tasksSkipped: number;
}

export interface TaskJson {
  [key: string]: any;
  _opsv: {
    provider: string;
    modelKey: string;
    type: string;
    shotId: string;
    api_url: string;
    api_status_url?: string;
    references?: string[];
    compiledAt: string;
  };
}

export class TaskCompiler {
  private baseQueueDir: string;

  constructor(baseQueueDir: string) {
    this.baseQueueDir = baseQueueDir;
  }

  /**
   * 编译 jobs.json 为 Provider 批次任务。
   * 如果 jobs.json 内容与最新 batch 的 sourceHash 一致，则复用现有 batch。
   */
  async compile(
    jobsPath: string,
    providerModel: string,
    circle: string = 'zerocircle_1'
  ): Promise<CompileResult> {
    const [provider, modelKey] = providerModel.split('.');
    if (!provider || !modelKey) {
      throw new Error(`Invalid provider.model format: ${providerModel}. Expected "provider.modelKey"`);
    }

    const projectRoot = path.resolve(this.baseQueueDir, '..');
    const configLoader = ConfigLoader.getInstance(projectRoot);
    await configLoader.loadConfig(projectRoot);

    const modelCfg = configLoader.getModelConfig(provider, modelKey);
    if (!modelCfg) {
      throw new Error(`Model not found in api_config.yaml: ${provider}.${modelKey}`);
    }
    if (modelCfg.enable === false) {
      throw new Error(`Model is disabled in api_config.yaml: ${provider}.${modelKey}`);
    }

    // 读取 jobs
    const jobsContent = await fs.readFile(jobsPath, 'utf-8');
    const jobs: Job[] = JSON.parse(jobsContent);

    // 确定 batch 目录：compile 总是创建新 batch（queue_N+1）
    const providerDir = path.join(this.baseQueueDir, circle, provider);
    await fs.mkdir(providerDir, { recursive: true });

    const latestBatch = await this.getLatestBatchNum(providerDir);
    const batchNum = latestBatch + 1;
    const batchDir = path.join(providerDir, `queue_${batchNum}`);
    await fs.mkdir(batchDir, { recursive: true });

    let compiled = 0;
    let skipped = 0;
    const taskIndex: any[] = [];

    for (const job of jobs) {
      // 检查 model 是否支持该 job 类型
      if (modelCfg.type && modelCfg.type !== job.type) {
        logger.warn(`[Compile] Skipping job ${job.id}: model ${modelKey} type "${modelCfg.type}" does not match job type "${job.type}"`);
        skipped++;
        continue;
      }

      const jsonPath = path.join(batchDir, `${job.id}.json`);

      // 构建完整的 API 请求体
      const taskJson = this.buildTaskJson(job, provider, modelKey, modelCfg);

      await fs.writeFile(jsonPath, JSON.stringify(taskJson, null, 2), 'utf-8');

      taskIndex.push({
        id: job.id,
        type: job.type,
        jsonFile: `${job.id}.json`,
        model: modelCfg.model || modelKey
      });
      compiled++;
    }

    // 生成 compile.log
    const compileLog = {
      t: new Date().toISOString(),
      type: 'compile',
      provider,
      model: modelKey,
      circle,
      batch: `queue_${batchNum}`,
      jobsFile: path.basename(jobsPath),
      compiled,
      skipped
    };
    await fs.appendFile(path.join(batchDir, 'compile.log'), JSON.stringify(compileLog) + '\n', 'utf-8');

    logger.info(`[Compile] ${provider}.${modelKey} → ${circle}/queue_${batchNum} | compiled: ${compiled}, skipped: ${skipped}`);

    return { batchDir, batchNum, tasksCompiled: compiled, tasksSkipped: skipped };
  }

  /**
   * 构建可直接发送的 API 请求体 JSON。
   */
  private buildTaskJson(job: Job, provider: string, modelKey: string, modelCfg: any): TaskJson {
    const defaults = modelCfg.defaults || {};
    const userParams = (job.payload as any).global_settings || {};
    const requestBody: any = { ...defaults, ...userParams };

    // 注入核心字段
    const modelName = modelCfg.model || modelKey;
    requestBody.model = modelName;
    requestBody.prompt = job.prompt_en || (job.payload as any).prompt || '';

    // 参数防御
    this.applyParameterDefense(provider, modelKey, requestBody);

    const refs = job.reference_images || [];
    const frameRef = (job.payload as any).frame_ref;

    if (isContentGenerationApi(provider, modelCfg)) {
      // Seedance 2.0: 构建 content 数组格式的请求体
      this.buildContentGenerationBody(requestBody, job, refs, frameRef, modelCfg);
    } else {
      // 旧版 API：注入 references（通用化，根据 Provider 映射到正确字段）
      if (refs.length > 0) {
        this.injectReferences(provider, job.type, requestBody, refs, modelCfg.max_reference_images);
      }
      // 视频任务：注入 frame_ref 为首帧/尾帧
      if (frameRef && job.type === 'video_generation') {
        this.injectFrameRefs(provider, requestBody, frameRef);
      }
    }

    // 构建元数据
    const meta: TaskJson['_opsv'] = {
      provider,
      modelKey,
      type: job.type,
      shotId: job.id,
      api_url: modelCfg.api_url || '',
      compiledAt: new Date().toISOString(),
      references: refs.length > 0 ? refs : undefined
    };

    if (modelCfg.api_status_url) {
      meta.api_status_url = modelCfg.api_status_url;
    }

    return {
      ...requestBody,
      _opsv: meta
    };
  }

  private async getLatestBatchNum(providerDir: string): Promise<number> {
    const entries = await fs.readdir(providerDir).catch(() => [] as string[]);
    const batchFolders = entries.filter(e => /^queue_\d+$/.test(e));
    if (batchFolders.length === 0) return 0;
    const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''), 10)).filter(n => !isNaN(n));
    return Math.max(...nums);
  }

  /**
   * 构建 Seedance 2.0 Content Generation API 的请求体（content 数组格式）。
   *
   * 参考: https://www.volcengine.com/docs/82379/2291680
   * content 数组支持: text(1) + image_url(0~9) + video_url(0~3) + audio_url(0~3)
   */
  private buildContentGenerationBody(
    requestBody: any,
    job: Job,
    refs: string[],
    frameRef: any,
    modelCfg: any
  ) {
    const content: any[] = [];
    const seenUrls = new Set<string>();

    const addContent = (item: any) => {
      const url = item.image_url?.url || item.video_url?.url || item.audio_url?.url;
      if (url) {
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
      }
      content.push(item);
    };

    // 1. 文本提示词
    if (requestBody.prompt) {
      content.push({ type: 'text', text: requestBody.prompt });
      delete requestBody.prompt;
    }

    // 2. 参考图（最多 max_reference_images 张）
    const maxImages = modelCfg.max_reference_images || 9;
    for (const imgUrl of refs.slice(0, maxImages)) {
      if (imgUrl.startsWith('@FRAME:')) continue;
      addContent({ type: 'image_url', image_url: { url: imgUrl }, role: 'reference_image' });
    }

    // 3. 首帧/尾帧
    if (frameRef?.first && !frameRef.first.startsWith('@FRAME:')) {
      addContent({ type: 'image_url', image_url: { url: frameRef.first }, role: 'reference_image' });
    }
    if (frameRef?.last && !frameRef.last.startsWith('@FRAME:')) {
      addContent({ type: 'image_url', image_url: { url: frameRef.last }, role: 'reference_image' });
    }

    // 4. 媒体引用 (video/audio)
    const mediaRefs = (job.payload as any).extra?.media_refs || [];
    for (const mediaUrl of mediaRefs) {
      const ext = path.extname(mediaUrl).toLowerCase();
      if (ext === '.mp4') {
        addContent({ type: 'video_url', video_url: { url: mediaUrl }, role: 'reference_video' });
      } else if (ext === '.mp3' || ext === '.wav') {
        addContent({ type: 'audio_url', audio_url: { url: mediaUrl }, role: 'reference_audio' });
      }
    }

    requestBody.content = content;

    // 5. 防御性参数处理
    // duration 从字符串 '5s' 转换为整数 5
    if (typeof requestBody.duration === 'string') {
      const match = requestBody.duration.match(/^(\d+)/);
      if (match) {
        requestBody.duration = parseInt(match[1], 10);
      }
    }
    // ratio 从 global_settings.aspect_ratio 映射，默认已存在
    // generate_audio / watermark 由 defaults 覆盖
  }

  /**
   * Provider 参数防御。
   */
  private applyParameterDefense(provider: string, model: string, params: any) {
    if (provider === 'siliconflow') {
      const recommended = ['1024x1024', '512x1024', '768x1024', '1024x512', '1024x768', '1440x720', '720x1440', '1664x928', '928x1664', '1472x1140', '1140x1472', '1584x1056', '1056x1584', '1328x1328'];
      const currentSize = params.image_size || params.size || params.resolution || '1024x1024';
      if (!recommended.includes(currentSize)) {
        logger.warn(`[Defense] SiliconFlow: Size ${currentSize} not in recommended list. Fallback to 1024x1024`);
        params.image_size = '1024x1024';
      } else {
        params.image_size = currentSize;
      }
      delete params.size;
      delete params.resolution;
    }

    if (provider === 'volcengine') {
      if (params.size === '2K') params.size = '1920x1080';
      if (params.size === '2K-Square') params.size = '1440x1440';
      if (!params.size) params.size = '1280x720';
    }

    if (provider === 'minimax') {
      if (!params.prompt_optimizer) params.prompt_optimizer = true;
    }
  }

  /**
   * 将通用 references 映射到 Provider 特定的 API 字段。
   */
  private injectReferences(provider: string, jobType: string, requestBody: any, refs: string[], maxRefs?: number) {
    const limitedRefs = maxRefs ? refs.slice(0, maxRefs) : refs;

    if (provider === 'volcengine') {
      if (jobType === 'image_generation') {
        requestBody.image = limitedRefs.map(r => ({ url: r }));
      } else if (jobType === 'video_generation') {
        requestBody.image_url = limitedRefs[0];
      }
    } else if (provider === 'siliconflow') {
      if (jobType === 'image_generation') {
        requestBody.image = limitedRefs[0];
      } else if (jobType === 'video_generation') {
        requestBody.image = limitedRefs[0];
      }
    } else if (provider === 'minimax') {
      if (jobType === 'image_generation') {
        requestBody.subject_reference = limitedRefs.map(r => ({ type: 'character', image_file: r }));
      } else if (jobType === 'video_generation') {
        // Minimax 视频参考图由 Provider 轮询后获取，不在提交时注入
      }
    }
  }

  private injectFrameRefs(provider: string, requestBody: any, frameRef: any) {
    if (!frameRef) return;
    if (provider === 'volcengine') {
      if (frameRef.first) requestBody.first_frame = frameRef.first;
      if (frameRef.last) requestBody.last_frame = frameRef.last;
    } else if (provider === 'siliconflow') {
      if (frameRef.first) requestBody.image = frameRef.first;
    }
  }
}
