/**
 * opsv login — OAuth Device Flow authentication
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { DeviceFlowClient } from '../auth/DeviceFlowClient';
import { CredentialManager } from '../auth/CredentialManager';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with OpsV Cloud via browser')
    .option('--cloud-url <url>', 'OpsV Cloud base URL (or OPSV_CLOUD_URL env)')
    .action(async (options: { cloudUrl?: string }) => {
      const cloudUrl = options.cloudUrl || process.env.OPSV_CLOUD_URL;
      if (!cloudUrl) {
        console.error(chalk.red('请设置 --cloud-url 或 OPSV_CLOUD_URL 环境变量'));
        process.exit(1);
      }

      try {
        const client = new DeviceFlowClient(cloudUrl.replace(/\/+$/, ''));
        const { email, plan } = await client.login();
        console.log(chalk.green(`\n✓ 登录成功: ${email} (${plan})`));
      } catch (err: any) {
        console.error(chalk.red(`登录失败: ${err.message}`));
        process.exit(1);
      }
    });

  program
    .command('whoami')
    .description('Show current logged-in user')
    .action(() => {
      const creds = CredentialManager.getCredentials();
      if (!creds) {
        console.log(chalk.yellow('未登录。运行 opsv login 进行登录。'));
        return;
      }
      console.log(chalk.green(`${creds.email} (${creds.plan})`));
    });

  program
    .command('logout')
    .description('Clear local credentials')
    .action(() => {
      CredentialManager.clearCredentials();
      console.log(chalk.green('已退出登录'));
    });
}
