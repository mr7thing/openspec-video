// ============================================================================
// Review Protocol v1 — canonical state endpoints
//
// Review is a state mutation, not a comment thread. These endpoints read and
// mutate the Asset State Machine (.opsv/state/<asset>.jsonl) through the
// TransitionStore. Existing review-ui routes are preserved alongside.
// Spec: .trellis/spec/canonical-model/asset-state-machine.md
// ============================================================================

import { Request, Response } from 'express';
import {
  currentState,
  transitionToState,
  AssetTransition,
  TransitionBase,
} from '../../canonical/state/TransitionStore';

export interface CanonicalReviewRequest {
  asset: string;
  artifact?: string;
  /** 'reject' closes review as rejected; 'revise' reopens the revision loop. */
  action: 'reject' | 'revise';
  comment?: string;
}

export interface CanonicalApproveRequest {
  asset: string;
  artifact?: string;
  reason?: string;
}

function actorOf(req: Request): { type: 'human' | 'agent' | 'system'; id: string } {
  const actor = (req.body as Record<string, unknown>)?.actor;
  if (actor && typeof actor === 'object') {
    const { type, id } = actor as { type?: string; id?: string };
    if (type === 'human' || type === 'agent' || type === 'system') {
      if (typeof id === 'string' && id) return { type, id };
    }
  }
  return { type: 'human', id: 'reviewer' };
}

function transitionBase(
  req: Request,
  body: { asset: string; artifact?: string },
  reason?: string,
): TransitionBase {
  return {
    asset: body.asset,
    artifact: body.artifact,
    actor: actorOf(req),
    reason,
    timestamp: new Date().toISOString(),
  };
}

export function createCanonicalController(projectRoot: string) {
  return {
    async getAssetState(req: Request, res: Response): Promise<void> {
      try {
        const asset = String(req.params.id ?? '');
        if (!asset) {
          res.status(400).json({ error: 'asset id is required' });
          return;
        }
        const { state, transitions } = await currentState(projectRoot, asset);
        res.json({ asset, state, transitions });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },

    async review(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Partial<CanonicalReviewRequest>;
        if (!body.asset || !body.action) {
          res.status(400).json({ error: 'asset and action are required' });
          return;
        }
        if (body.action !== 'reject' && body.action !== 'revise') {
          res.status(400).json({ error: `unknown review action: ${body.action}` });
          return;
        }

        const base = transitionBase(req, { asset: body.asset, artifact: body.artifact }, body.comment);
        const appended: AssetTransition[] = [];

        if (body.action === 'reject') {
          appended.push(...(await transitionToState(projectRoot, base, 'rejected')));
        } else {
          // revise = reject → candidate (reopen the revision loop)
          appended.push(...(await transitionToState(projectRoot, base, 'rejected')));
          appended.push(...(await transitionToState(projectRoot, { ...base }, 'candidate')));
        }

        const { state } = await currentState(projectRoot, body.asset);
        res.json({ ok: true, asset: body.asset, state, transitions: appended });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },

    async approve(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Partial<CanonicalApproveRequest>;
        if (!body.asset) {
          res.status(400).json({ error: 'asset is required' });
          return;
        }
        const appended = await transitionToState(
          projectRoot,
          transitionBase(req, { asset: body.asset, artifact: body.artifact }, body.reason ?? 'approved via review protocol'),
          'approved',
        );
        const { state } = await currentState(projectRoot, body.asset);
        res.json({ ok: true, asset: body.asset, state, transitions: appended });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  };
}

export type CanonicalController = ReturnType<typeof createCanonicalController>;
