# Workflow: Auto Executor (Batch Processing)

This workflow guides the Agent to execute video/image generation tasks defined in the `queue/jobs.json`.

## Prerequisites
- The `queue/jobs.json` file must be generated via `npm start`.
- The Agent must have access to `browser_subagent`.

## Execution Steps

### 1. Load Job Queue
1. Read the file `project-demo/queue/jobs.json`.
2. Parse the JSON content to get a list of jobs.
3. Identify jobs where `output_path` does not exist (Pending Jobs).

### 2. Job Execution Loop
For each **Pending Job**:

#### A. Analyze Job Payload
- **Type**: Check if it is `image_generation` (`nano_banana_pro`) or `video_generation` (`veo_3_1`).
- **Assets**: Note the absolute paths of `assets` (Reference Sheets).
- **Prompt**: Extract the `subject`, `environment`, and `global_settings` from `payload`.

#### B. Browser Interaction (Nano Banana Pro)
If `target_tool` is `nano_banana_pro`:
1. **Launch**: Open Browser and navigate to the generation tool URL (Mock: `https://higgsfield.ai/nano-banana-2-intro` or internal URL).
2. **Setup**:
   - Locate the "Prompt" input area.
   - Locate the "Upload Reference" button.
3. **Action**:
   - Type the constructed prompt: `[Subject Description] [Action] in [Environment]`.
   - Upload the reference image(s) from `assets` list.
   - Click "Generate".
4. **Capture**:
   - Wait for the generation to complete (look for progress bar or result).
   - Click the image to view full size.
   - Take a screenshot or download the image.
   - **CRITICAL**: Save the result to the `output_path` defined in the job.

#### C. Browser Interaction (Veo 3.1)
If `target_tool` is `veo_3_1`:
1. **Launch**: Navigate to Veo console.
2. **Setup**: Select "Image-to-Video" mode.
3. **Action**:
   - Upload the *Source Image* (this might be the output of a previous `image_generation` job).
   - Enter the motion prompt from `camera.motion`.
   - Click "Generate".
4. **Capture**: Save the video file to `output_path`.

### 3. Verification
- After processing all jobs, list the `artifacts/` directory to confirm file creation.
- Update `task.md` or a log file to mark jobs as "Done".
