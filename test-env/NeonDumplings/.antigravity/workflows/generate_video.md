# Workflow: Generate Video

This workflow orchestrates the creation of video clips from existing storyboards using Veo 3.1.

## Prerequisites
- **Storyboards**: You must have generated images in `artifacts/` (or `videospec/stories/storyboard/`).
- **Script**: `Script.md` should contain `Camera` directives (e.g., "Slow zoom in").

## Steps

### 1. Verification
1. Check `artifacts/` for source images (e.g., `shot_1.png`).
2. If images are missing, run the **Generate Storyboard** workflow first.

### 2. Job Configuration
*Note: Currently `opsv generate` defaults to image jobs. For video, we manually verify or update the queue.*

1. Open `queue/jobs.json`.
2. **Action**: Convert `image_generation` jobs to `video_generation` for the shots you want to animate.
   - Change `type` to `"video_generation"`.
   - Change `target_tool` to `"veo_3_1"`.
   - Ensure `payload.camera.motion` is populated.
   - Add `assets` pointing to the *generated storyboard image* (e.g., `.../artifacts/shot_1.png`) as the source for Image-to-Video.

### 3. Execute Batch Generation
Proceed to run the **Executor Workflow**.
> Ref: `.antigravity/workflows/executor.md`

1. Open `.antigravity/workflows/executor.md`.
2. Follow the "Browser Interaction (Veo 3.1)" section.
   - Login to Veo Console.
   - For each job, upload the *Action* (Storyboard Image) + *Prompt* + *Camera Motion*.
   - Save the resulting video (mp4) to `artifacts/videos/`.

### 4. Post-Processing
1. Rename files to match shot IDs (e.g., `shot_1_video.mp4`).
2. Update `artifacts/manifest.md` (if it exists) to log the new video assets.
