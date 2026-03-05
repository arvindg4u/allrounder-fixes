# Step Sequence Cheatsheet

## 0) Select Side First

- If user already says `windows` or `linux/wsl`, use that side directly.
- If not, ask once: `Signup Windows side karna hai ya Linux/WSL side?`

## 1) Install Wrappers (if needed)

### Linux/WSL

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/linux/install_wrappers.sh
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\personal-codex-signup-workflow\scripts\windows\install_wrappers.ps1"
```

## 2) Preflight

### Linux/WSL

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/kill_stale_login.sh
node /home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs health --base-url https://app.arvindlab.dedyn.io
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\personal-codex-signup-workflow\scripts\windows\kill_stale_login.ps1"
node "$env:USERPROFILE\.codex\skills\control-cli\scripts\control-cli.mjs" health --base-url https://app.arvindlab.dedyn.io
```

## 3) Fresh Login + Alias

### Linux/WSL

```bash
# Run in interactive TTY. Do NOT run crelogin with nohup or detached background.
crelogin
lsof -i :1455 -sTCP:LISTEN -n -P
cat /home/rvndk/.codex/.last-login-link
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/create_alias.sh
```

### Windows

```powershell
crelogin
netstat -ano | findstr :1455
Get-Content "$env:USERPROFILE\.codex\.last-login-link"
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\personal-codex-signup-workflow\scripts\windows\create_alias.ps1"
```

## 4) OTP Polling

### Linux/WSL

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/get_code_for_alias.sh --alias-email app-xxxxxxxxxx@arvindlab.dedyn.io
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\personal-codex-signup-workflow\scripts\windows\get_code_for_alias.ps1" -AliasEmail app-xxxxxxxxxx@arvindlab.dedyn.io
```

## 5) Full Alias Cleanup (when requested)

### Linux/WSL

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/delete_all_aliases.sh --yes
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\personal-codex-signup-workflow\scripts\windows\delete_all_aliases.ps1" -Yes
```

## About-You DOB Input Note

- Birthday fields are contenteditable `spinbutton` controls.
- If generic form fill fails, type/evaluate directly into month/day/year fields.
- Submit with `Finish creating account`.
