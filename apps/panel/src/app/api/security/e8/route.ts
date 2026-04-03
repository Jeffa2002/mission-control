import { NextResponse } from 'next/server';
import { safeExec } from '../_security-logs';

type Status = 'compliant' | 'partial' | 'at-risk' | 'manual' | 'needs-review';

type Strategy = { id: string; name: string; status: Status; description: string; detail: string; host: 'bazza' | 'prod' };

function mk(id: string, name: string, status: Status, description: string, detail: string, host: 'bazza' | 'prod'): Strategy {
  return { id, name, status, description, detail, host };
}

export async function GET() {
  try {
    const upgradableRaw = safeExec("apt list --upgradable 2>/dev/null | wc -l");
    const upgradable = Math.max(0, Number.parseInt(upgradableRaw.trim(), 10) - 1 || 0);
    const patchStatus: Status = upgradable === 0 ? 'compliant' : upgradable <= 5 ? 'partial' : 'at-risk';

    // UFW: check the config file directly (works inside Docker where ufw binary can't run iptables)
    const ufwEnabled = safeExec("grep -i '^ENABLED=yes' /host-logs/../etc/ufw/ufw.conf 2>/dev/null || grep -i '^ENABLED=yes' /etc/ufw/ufw.conf 2>/dev/null");
    const ufwActive = ufwEnabled.includes('yes') || /active/i.test(safeExec('/usr/sbin/ufw status 2>/dev/null'));
    // SSH: check main config + all drop-ins, take the last effective value
    const sshdAll = safeExec("grep -rh -i '^PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null | tail -1");
    const passwordAuthDisabled = /no/i.test(sshdAll);
    const restrictDetail = `ufw=${ufwActive ? 'active' : 'inactive'}; password_auth=${/yes/i.test(sshdAll) ? 'enabled' : passwordAuthDisabled ? 'disabled' : 'unknown'}`;
    const restrictStatus: Status = ufwActive && passwordAuthDisabled ? 'compliant' : 'partial';

    // Check config files directly (systemctl doesn't work inside Docker)
    const autoUpgradesConf = safeExec('cat /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null').trim();
    const unattendedEnabled = autoUpgradesConf.includes('Unattended-Upgrade "1"') || autoUpgradesConf.includes("Unattended-Upgrade '1'");
    const periodicEnabled = autoUpgradesConf.includes('Update-Package-Lists "1"') || autoUpgradesConf.includes("Update-Package-Lists '1'");
    const patchAppsStatus: Status = unattendedEnabled && periodicEnabled ? 'compliant' : 'partial';
    const unattended = unattendedEnabled ? 'active; auto-upgrade enabled' : 'unattended-upgrades not configured';

    const fail2ban = safeExec("dpkg -l | grep -E 'fail2ban|crowdsec|sshguard' 2>/dev/null | head -5");
    const hardeningStatus: Status = fail2ban.trim() ? 'compliant' : 'partial';

    const backups = safeExec("crontab -l 2>/dev/null; grep -RHiE 'borg|restic|rsync|duplicity|backup' /etc/cron* /var/spool/cron 2>/dev/null | head -20");
    const backupStatus: Status = backups.trim() ? 'compliant' : 'partial';

    return NextResponse.json({
      strategies: [
        mk('patch-os', 'Patch OS', patchStatus, 'Keep the operating system patched.', `upgradable packages: ${upgradable}`, 'bazza'),
        mk('restrict-admin', 'Restrict Administrative Privileges', restrictStatus, 'Reduce attack surface for admin access.', restrictDetail, 'bazza'),
        mk('patch-apps', 'Patch Applications', patchAppsStatus, 'Keep application packages up to date.', unattended.trim() ? unattended.trim() : 'unattended-upgrades not clearly active', 'bazza'),
        mk('user-app-hardening', 'User Application Hardening', hardeningStatus, 'Harden exposed services and user applications.', fail2ban.trim() || 'fail2ban/crowdsec/sshguard not detected', 'bazza'),
        mk('mfa', 'MFA', 'manual', 'Configure multi-factor authentication where supported.', 'Manual review required to confirm MFA coverage.', 'bazza'),
        mk('backups', 'Backups', backupStatus, 'Ensure backups exist and are tested.', backups.trim() || 'No backup tooling detected from quick checks', 'bazza'),
        mk('application-control', 'Application Control', 'needs-review', 'Review application allowlisting and control options.', 'Manual review required.', 'bazza'),
        mk('multi-factor', 'Multi-factor Authentication', 'manual', 'Same control area as MFA.', 'Manual review required to configure and verify MFA.', 'bazza'),
      ],
    });
  } catch {
    return NextResponse.json({ strategies: [] });
  }
}
