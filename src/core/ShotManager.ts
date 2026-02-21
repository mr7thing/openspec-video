import fs from 'fs-extra';
import path from 'path';

export interface ShotStatus {
    id: string;
    act: string;
    scene: string;
    description: string;
    status: 'Pending' | 'Draft' | 'Approved' | 'Revision';
    reference?: string;
}

export class ShotManager {
    private projectRoot: string;
    private shotsListPath: string;

    constructor(projectRoot: string) {
        this.projectRoot = path.resolve(projectRoot);
        this.shotsListPath = path.join(this.projectRoot, 'videospec/shotslist.md');
    }

    /**
     * Parsing the shotslist.md markdown table manually for robustness.
     */
    getShotList(): ShotStatus[] {
        if (!fs.existsSync(this.shotsListPath)) return [];

        const content = fs.readFileSync(this.shotsListPath, 'utf-8');
        const lines = content.split('\n');
        const shots: ShotStatus[] = [];

        let inTable = false;

        for (const line of lines) {
            if (line.trim().startsWith('| Shot ID')) {
                inTable = true;
                continue;
            }
            if (line.trim().startsWith('| ---')) continue;

            if (inTable && line.trim().startsWith('|')) {
                const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
                // Expecting: Shot ID | Act | Scene | Description | Status | Reference
                if (parts.length >= 5) {
                    shots.push({
                        id: parts[0].replace(/\*\*/g, ''), // Remove bolding
                        act: parts[1],
                        scene: parts[2],
                        description: parts[3],
                        status: parts[4].replace(/`/g, '') as any,
                        reference: parts[5] === '-' ? undefined : parts[5]
                    });
                }
            }
        }
        return shots;
    }

    updateShotStatus(shotId: string, status: 'Pending' | 'Draft' | 'Approved' | 'Revision') {
        if (!fs.existsSync(this.shotsListPath)) return;

        let content = fs.readFileSync(this.shotsListPath, 'utf-8');
        const lines = content.split('\n');
        const newLines: string[] = [];

        for (const line of lines) {
            if (line.trim().startsWith(`| **${shotId}**`) || line.trim().startsWith(`| ${shotId}`)) {
                // Reconstruct the line with new status
                const parts = line.split('|');
                // parts[0] is empty (split matches start), parts[1] is ID, ..., parts[5] is Status
                if (parts.length >= 6) {
                    parts[5] = ` \`${status}\` `;
                    newLines.push(parts.join('|'));
                } else {
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }

        fs.writeFileSync(this.shotsListPath, newLines.join('\n'), 'utf-8');
        console.log(`Updated Shot ${shotId} status to ${status}`);
    }

    /**
     * Initializes the shots list file if it doesn't exist.
     */
    initShotsList() {
        if (fs.existsSync(this.shotsListPath)) return;

        const template = `# Master Shot List

| Shot ID | Act | Scene | Description | Status | Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;
        fs.ensureDirSync(path.dirname(this.shotsListPath));
        fs.writeFileSync(this.shotsListPath, template, 'utf-8');
    }
}
