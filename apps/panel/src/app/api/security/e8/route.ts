import { NextResponse } from 'next/server';
import { safeExecAsync } from '../_security-logs';
import { requireSessionAuth } from '../../_session-auth';

type Status = 'compliant' | 'partial' | 'at-risk' | 'manual' | 'needs-review';

type Strategy = { id: string; name: string; status: Status; description: string; detail: string; host: 'bazza' | 'prod' };

function mk(id: string, name: string, status: Status, description: string, detail: string, host: 'bazza' | 'prod'): Strategy {
  return { id, name, status, description, detail, host };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const [
      upgradableRaw,
      ufwEnabled,
      ufwStatus,
      sshdAll,
      autoUpgradesConf,
      fail2banConf,
      crowdsecConf,
      backupLastRun,
      backupDbs,
    ] = await Promise.all([
      safeExecAsync("apt list --upgradable 2>/dev/null | wc -l"),
      safeExecAsync("grep -i '^ENABLED=yes' /host-logs/../etc/ufw/ufw.conf 2>/dev/null || grep -i '^ENABLED=yes' /etc/ufw/ufw.conf 2>/dev/null"),
      safeExecAsync('/usr/sbin/ufw status 2>/dev/null', 1000),
      safeExecAsync("grep -rh -i '^PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null | tail -1"),
      safeExecAsync('cat /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null'),
      safeExecAsync('ls /etc/fail2ban/jail.local /etc/fail2ban/jail.conf 2>/dev/null'),
      safeExecAsync('ls /etc/crowdsec/config.yaml 2>/dev/null'),
      safeExecAsync("ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=2 -p 2222 root@100.110.100.97 'ls -t /backups/timepulse/*.sql.gz 2>/dev/null | head -1' 2>/dev/null", 2500),
      safeExecAsync("ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=2 -p 2222 root@100.110.100.97 'ls /backups/timepulse/ /backups/venconx/ /backups/ordantra/ /backups/cutline/ /backups/projectxify/ 2>/dev/null | grep -c .sql.gz' 2>/dev/null", 2500),
    ]);
    const upgradable = Math.max(0, Number.parseInt(upgradableRaw.trim(), 10) - 1 || 0);
    const patchStatus: Status = upgradable === 0 ? 'compliant' : upgradable <= 5 ? 'partial' : 'at-risk';

    // UFW: check the config file directly (works inside Docker where ufw binary can't run iptables)
    const ufwActive = ufwEnabled.includes('yes') || /active/i.test(ufwStatus);
    // SSH: check main config + all drop-ins, take the last effective value
    const passwordAuthDisabled = /no/i.test(sshdAll);
    const restrictDetail = `ufw=${ufwActive ? 'active' : 'inactive'}; password_auth=${/yes/i.test(sshdAll) ? 'enabled' : passwordAuthDisabled ? 'disabled' : 'unknown'}`;
    const restrictStatus: Status = ufwActive && passwordAuthDisabled ? 'compliant' : 'partial';

    // Check config files directly (systemctl doesn't work inside Docker)
    const unattendedEnabled = autoUpgradesConf.includes('Unattended-Upgrade "1"') || autoUpgradesConf.includes("Unattended-Upgrade '1'");
    const periodicEnabled = autoUpgradesConf.includes('Update-Package-Lists "1"') || autoUpgradesConf.includes("Update-Package-Lists '1'");
    const patchAppsStatus: Status = unattendedEnabled && periodicEnabled ? 'compliant' : 'partial';
    const unattended = unattendedEnabled ? 'active; auto-upgrade enabled' : 'unattended-upgrades not configured';

    // Check for config files directly (dpkg not available inside Docker)
    const fail2ban = fail2banConf || crowdsecConf;
    const hardeningStatus: Status = fail2ban ? 'compliant' : 'partial';

    // Check backup server via SSH (bazza key, public IP)
    const backupStatus: Status = backupLastRun ? 'compliant' : 'partial';
    const backupDetail = backupLastRun
      ? `backup-melb (Melbourne): ${backupDbs} DB snapshots; last: ${backupLastRun.split('/').pop()}`
      : 'backup server unreachable or no backups found';

    return NextResponse.json({
      strategies: [
        mk('patch-os', 'Patch OS', patchStatus, 'Keep the operating system patched.', `upgradable packages: ${upgradable}`, 'bazza'),
        mk('restrict-admin', 'Restrict Administrative Privileges', restrictStatus, 'Reduce attack surface for admin access.', restrictDetail, 'bazza'),
        mk('patch-apps', 'Patch Applications', patchAppsStatus, 'Keep application packages up to date.', unattended.trim() ? unattended.trim() : 'unattended-upgrades not clearly active', 'bazza'),
        mk('user-app-hardening', 'User Application Hardening', hardeningStatus, 'Harden exposed services and user applications.', fail2ban.trim() || 'fail2ban/crowdsec/sshguard not detected', 'bazza'),
        mk('mfa', 'MFA', 'compliant', 'Configure multi-factor authentication where supported.', 'GitHub: passkey ✓; BinaryLane: OTP email ✓; TimePulse: opt-in TOTP (otpauth) ✓', 'bazza'),
        mk('backups', 'Backups', backupStatus, 'Daily encrypted backups to Melbourne backup server (backup-melb).', backupDetail, 'prod'),
        mk('application-control', 'Application Control', 'needs-review', 'Review application allowlisting and control options.', 'Manual review required.', 'bazza'),
        mk('multi-factor', 'Multi-factor Authentication', 'compliant', 'MFA across all admin surfaces.', 'GitHub: passkey ✓; BinaryLane: OTP email ✓; TimePulse: TOTP opt-in live ✓', 'bazza'),
      ],
    });
  } catch {
    return NextResponse.json({ strategies: [] });
  }
}
