# Step Sequence Cheatsheet

## Preflight

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/kill_stale_login.sh
node /home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs health --base-url https://app.arvindlab.dedyn.io
```

## Fresh Login + Alias

```bash
# Run in interactive TTY. Do NOT run crelogin with nohup or detached background.
crelogin
# Optional sanity check:
lsof -i :1455 -sTCP:LISTEN -n -P
cat /home/rvndk/.codex/.last-login-link
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/create_alias.sh
```

## About-You DOB Input Note

- Birthday fields are contenteditable `spinbutton` controls.
- If generic form fill fails, type/evaluate directly into month/day/year fields.
- Submit with `Finish creating account`.

## OTP Polling

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/get_code_for_alias.sh --alias-email app-xxxxxxxxxx@arvindlab.dedyn.io
```

## Full Alias Cleanup (when requested)

```bash
bash /home/rvndk/.codex/skills/personal-codex-signup-workflow/scripts/delete_all_aliases.sh --yes
```
