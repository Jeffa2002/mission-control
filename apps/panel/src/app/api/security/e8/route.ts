import { NextResponse } from 'next/server';
import { safeExec } from '../_security-logs';

type Status = 'compliant' | 'partial' | 'at-risk' | 'manual' | 'needs-review';

type Strategy = { id: string; name: string; status: Status; description: string; detail: string };

function mk(id: string, name: string, status: Status, description: string, detail: string): Strategy {
  return { id, name, status, description, detail };
}

export async function GET() {
  try {
    const upgradableRaw = safeExec("apt list --upgradable 2>/dev/null | wc -l");
    const upgradable = Math.max(0, Number.parseInt(upgradableRaw.trim(), 10) - 1 || 0);
    const patchStatus: Status = upgradable === 0 ? 'compliant' : upgradable <= 5 ? 'partial' : 'at-risk';

    const ufw = safeExec('/usr/sbin/ufw status 2>/dev/null');
    const sshd = safeExec("grep -E '^[#[:space:]]*PasswordAuthentication' /etc/ssh/sshd_config 2>/dev/null | tail -1");
    const restrictDetail = `ufw=${/active/i.test(ufw) ? 'active' : 'inactive'}; password_auth=${/yes/i.test(sshd) ? 'enabled' : /no/i.test(sshd) ? 'disabled' : 'unknown'}`;
    const restrictStatus: Status = /active/i.test(ufw) && /no/i.test(sshd) ? 'compliant' : 'partial';

    const unattended = safeExec("systemctl is-active unattended-upgrades 2>/dev/null || dpkg -s unattended-upgrades 2>/dev/null | grep -E '^Status:'");
    const patchAppsStatus: Status = /active|install ok installed/i.test(unattended) ? 'compliant' : 'partial';

    const fail2ban = safeExec("dpkg -l | grep -E 'fail2ban|crowdsec|sshguard' 2>/dev/null | head -5");
    const hardeningStatus: Status = fail2ban.trim() ? 'compliant' : 'partial';

    const backups = safeExec("crontab -l 2>/dev/null; grep -RHiE 'borg|restic|rsync|duplicity|backup' /etc/cron* /var/spool/cron 2>/dev/null | head -20");
    const backupStatus: Status = backups.trim() ? 'compliant' : 'partial';

    return NextResponse.json({
      strategies: [
        mk('patch-os', 'Patch OS', patchStatus, 'Keep the operating system patched.', `upgradable packages: ${upgradable}`),
        mk('restrict-admin', 'Restrict Administrative Privileges', restrictStatus, 'Reduce attack surface for admin access.', restrictDetail),
        mk('patch-apps', 'Patch Applications', patchAppsStatus, 'Keep application packages up to date.', unattended.trim() ? unattended.trim() : 'unattended-upgrades not clearly active'),
        mk('user-app-hardening', 'User Application Hardening', hardeningStatus, 'Harden exposed services and user applications.', fail2ban.trim() || 'fail2ban/crowdsec/sshguard not detected'),
        mk('mfa', 'MFA', 'manual', 'Configure multi-factor authentication where supported.', 'Manual review required to confirm MFA coverage.'),
        mk('backups', 'Backups', backupStatus, 'Ensure backups exist and are tested.', backups.trim() || 'No backup tooling detected from quick checks'),
        mk('application-control', 'Application Control', 'needs-review', 'Review application allowlisting and control options.', 'Manual review required.'),
        mk('multi-factor', 'Multi-factor Authentication', 'manual', 'Same control area as MFA.', 'Manual review required to configure and verify MFA.'),
      ],
    });
  } catch {
    return NextResponse.json({ strategies: [] });
  }
}
