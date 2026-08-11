import { RhCliProbe } from '../RhCliProbe';
import { RhCliCheckResult, RhRunner } from '../../rh-runner/index';

class CheckRunner implements RhRunner {
  calls = 0;
  result: RhCliCheckResult = { status: 'ready', capabilities: ['json-check', 'model-run'] };

  async check(): Promise<RhCliCheckResult> {
    this.calls++;
    return this.result;
  }

  async run(): Promise<any> {
    throw new Error('not used');
  }
}

describe('RhCliProbe', () => {
  it('fails closed when the check response is not a ready capability contract', async () => {
    const runner = new CheckRunner();
    const probe = new RhCliProbe(runner);

    runner.result = { status: 'degraded', capabilities: ['json-check', 'model-run'] };
    await expect(probe.probe({ binary: '/opt/rh', apiKey: 'key', requiredCapabilities: ['json-check'] }))
      .rejects.toMatchObject({ kind: 'cli-incompatible' });

    runner.result = { status: 'ready', capabilities: undefined as any };
    await expect(probe.probe({ binary: '/opt/rh', apiKey: 'key-2', requiredCapabilities: ['json-check'] }))
      .rejects.toMatchObject({ kind: 'cli-incompatible' });
  });

  it('requires each configured capability and scopes cache by binary, credential, and requirement set', async () => {
    const runner = new CheckRunner();
    const probe = new RhCliProbe(runner);
    const input = { binary: '/opt/rh', apiKey: 'key', requiredCapabilities: ['json-check'] };

    await probe.probe(input);
    await probe.probe(input);
    expect(runner.calls).toBe(1);

    await probe.probe({ ...input, requiredCapabilities: ['json-check', 'model-run'] });
    await probe.probe({ ...input, apiKey: 'another-key' });
    await probe.probe({ ...input, binary: '/opt/another-rh' });
    expect(runner.calls).toBe(4);

    await expect(probe.probe({ ...input, apiKey: 'missing-cap', requiredCapabilities: ['app-run'] }))
      .rejects.toMatchObject({ kind: 'cli-incompatible' });
  });
});
