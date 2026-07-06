---
name: hf-cli
description: Use the Hugging Face CLI (`hf`) to manage spaces, datasets, models, repos, upload/download files, secrets, env vars, webhooks, discussions, jobs, endpoints, buckets, collections, papers, sandboxes, and more on the Hub. Use when the user mentions Hugging Face, HF, spaces, datasets, models, or any Hub operations.
---

# hf CLI Complete Reference

The `hf` CLI is installed via `uv tool install huggingface-hub`. Authenticated as user **arvindclaw**.

## Execution

Run commands using `cmd //c` on Windows:
```
cmd //c "C:\Users\rvndk\.local\bin\uv.exe tool run --from huggingface-hub hf <command>"
```

Common flags: `--format json`, `--limit N`, `-q`/`--quiet`, `-R`/`--recursive`, `--tree`, `-h`/`--human-readable`

---

## AUTH
| Command | Description |
|---------|-------------|
| `hf auth whoami` | Check logged-in user |
| `hf auth login` | Login via browser or `--token <TOKEN>` |
| `hf auth login --token <TOKEN>` | Login with token |
| `hf auth logout` | Logout from a token |
| `hf auth list` | List stored tokens |
| `hf auth switch` | Switch between tokens |
| `hf auth token` | Print current token to stdout |

---

## SPACES
| Command | Description |
|---------|-------------|
| `hf spaces list --author arvindlabs` | List your spaces |
| `hf spaces list --search "chatbot"` | Search spaces |
| `hf spaces ls <repo_id>` | List files in a space |
| `hf spaces ls <repo_id> -R` | List files recursively |
| `hf spaces ls <repo_id> --tree -h` | Tree view |
| `hf spaces info <repo_id>` | Get detailed space info |
| `hf spaces card <repo_id>` | View space README |
| `hf spaces logs <repo_id>` | Fetch build/runtime logs |
| `hf spaces restart <repo_id>` | Restart a space |
| `hf spaces pause <repo_id>` | Pause a space |
| `hf spaces wait <repo_id>` | Wait for build to finish |
| `hf spaces hardware` | List available hardware options |
| `hf spaces settings <repo_id> --sleep-time <seconds>` | Update sleep timeout (-1 = never sleep) |
| `hf spaces settings <repo_id> --hardware t4-medium` | Change hardware flavor |
| `hf spaces dev-mode <repo_id>` | Toggle dev mode |
| `hf spaces ssh <repo_id>` | SSH into dev mode container |
| `hf spaces hot-reload <repo_id> <file.py>` | Hot-reload a Python file without rebuild |

### Spaces - Secrets
| Command | Description |
|---------|-------------|
| `hf spaces secrets list <repo_id>` | List secrets |
| `hf spaces secrets add <repo_id> -s KEY=value` | Add/update secret |
| `hf spaces secrets add <repo_id> -s HF_TOKEN` | Pass your HF token as secret |
| `hf spaces secrets add <repo_id> --secrets-file .env` | Add from .env file |
| `hf spaces secrets delete <repo_id> KEY` | Delete a secret |

### Spaces - Environment Variables
| Command | Description |
|---------|-------------|
| `hf spaces variables list <repo_id>` | List env vars |
| `hf spaces variables add <repo_id> -e KEY=VALUE` | Add/update env var |
| `hf spaces variables add <repo_id> -e KEY1=V1 -e KEY2=V2` | Add multiple |
| `hf spaces variables delete <repo_id> KEY` | Delete env var |

### Spaces - Volumes
| Command | Description |
|---------|-------------|
| `hf spaces volumes list <repo_id>` | List mounted volumes |
| `hf spaces volumes set <repo_id> -v hf://models/user/model:/models` | Set (replace) volumes |
| `hf spaces volumes set <repo_id> -v hf://datasets/user/ds:/data` | Mount a dataset volume |
| `hf spaces volumes set <repo_id> -v hf://buckets/user/b:/mnt:ro` | Mount bucket volume (read-only) |
| `hf spaces volumes set <repo_id> -v hf://buckets/user/b:/mnt` | Mount bucket volume (read-write) |
| `hf spaces volumes delete <repo_id>` | Remove all volumes from a Space |

---

## DATASETS
| Command | Description |
|---------|-------------|
| `hf datasets list --author arvindlabs` | List your datasets |
| `hf datasets list --search "weather"` | Search datasets |
| `hf datasets ls <repo_id>` | List dataset files |
| `hf datasets ls <repo_id> -R` | List recursively |
| `hf datasets info <repo_id>` | Get dataset info |
| `hf datasets card <repo_id>` | View dataset README |
| `hf datasets leaderboard <repo_id>` | View leaderboard scores |
| `hf datasets parquet <repo_id>` | List parquet file URLs |
| `hf datasets sql "SELECT COUNT(*) FROM read_parquet(...)"` | Run SQL on parquet data |
| `hf repos create <repo_id> --type dataset` | Create a dataset |

---

## MODELS
| Command | Description |
|---------|-------------|
| `hf models list --author arvindlabs` | List your models |
| `hf models list --sort downloads --limit 10` | Trending models |
| `hf models ls <repo_id>` | List model files |
| `hf models info <repo_id>` | Get model info |
| `hf models card <repo_id>` | View model README |

---

## PAPERS
| Command | Description |
|---------|-------------|
| `hf papers list` | List daily papers |
| `hf papers search "vision language"` | Search papers |
| `hf papers info <arxiv_id>` | Get paper info |
| `hf papers read <arxiv_id>` | Read paper as markdown |

---

## UPLOAD / DOWNLOAD / COPY
| Command | Description |
|---------|-------------|
| `hf upload <repo_id> <local_path> <remote_path>` | Upload file |
| `hf upload <repo_id> <folder>` | Upload entire folder |
| `hf upload <repo_id> . . --commit-message "msg"` | Upload with commit message |
| `hf upload <repo_id> . --create-pr` | Upload as a PR |
| `hf upload <repo_id> . . --delete "*.bin"` | Upload + delete matching files |
| `hf upload <repo_id> . . --commit-message "msg" --commit-description "details"` | Upload with full commit |
| `hf upload <repo_id> . . --every 5` | Upload every 5 min (background job) |
| `hf upload <repo_id> ./data /train --repo-type=dataset` | Upload to dataset |
| `hf download <repo_id>` | Download all files |
| `hf download <repo_id> config.json tokenizer.json` | Download specific files |
| `hf download <repo_id> --include "*.safetensors" --exclude "*.bin"` | Filtered download |
| `hf download <repo_id> --local-dir ./models/llama` | Download to specific folder |
| `hf download <repo_id> --repo-type dataset` | Download dataset |
| `hf cp hf://user/repo/file ./local/` | Copy from Hub to local |
| `hf cp ./file hf://user/repo/file` | Copy from local to Hub |
| `hf cp hf://user/repo/ hf://user/repo2/` | Remote-to-remote copy |

---

## BUCKETS (HF Storage)
| Command | Description |
|---------|-------------|
| `hf buckets list` | List buckets |
| `hf buckets ls user/my-bucket` | List bucket files |
| `hf buckets create my-bucket` | Create a bucket |
| `hf buckets delete user/my-bucket` | Delete a bucket |
| `hf buckets info user/my-bucket` | Get bucket info |
| `hf buckets move user/old user/new` | Rename bucket |
| `hf buckets remove user/my-bucket/file.txt` | Remove file from bucket |
| `hf buckets rm user/my-bucket/logs/ -R` | Remove files recursively |
| `hf buckets rm user/my-bucket --recursive --include "*.tmp"` | Remove matching files |
| `hf buckets rm user/my-bucket/ --dry-run` | Preview removal |
| `hf buckets cp hf://buckets/user/bkt/config.json .` | Copy from bucket |
| `hf buckets sync ./data hf://buckets/user/bkt` | Sync folder to bucket |
| `hf buckets sync hf://buckets/user/bkt ./data` | Sync bucket to local |
| `hf buckets sync ./data hf://buckets/user/bkt --delete` | Sync + delete extra files on dest |
| `hf buckets sync ./data hf://buckets/user/bkt --dry-run` | Preview sync plan |
| `hf buckets sync --apply sync-plan.jsonl` | Apply saved sync plan |

---

## REPOS MANAGEMENT
| Command | Description |
|---------|-------------|
| `hf repos create <repo_id> --type <model|dataset|space>` | Create repo |
| `hf repos delete <repo_id> --type <type>` | Delete repo |
| `hf repos list` | List all repos with storage info |
| `hf repos duplicate <repo_id>` | Duplicate a repo (defaults to your namespace) |
| `hf repos duplicate <repo_id> my-copy` | Duplicate with new name |
| `hf repos duplicate <repo_id> --type dataset` | Duplicate a dataset |
| `hf repos duplicate <space_id> --type space --flavor t4-medium --private` | Duplicate space with GPU + private |
| `hf repos duplicate <space_id> --type space --sleep-time 300` | Duplicate space with sleep settings |
| `hf repos duplicate <space_id> --type space -s HF_TOKEN -e KEY=VALUE` | Duplicate space with secrets/env |
| `hf repos duplicate <space_id> --type space -v hf://models/user/m:/models` | Duplicate space with volumes |
| `hf repos move old-ns/repo new-ns/repo` | Move repo to another namespace |
| `hf repos settings <repo_id> --private` | Make repo private |
| `hf repos settings <repo_id> --public` | Make repo public |
| `hf repos settings <repo_id> --gated auto` | Set gated access |
| `hf repos settings <space_id> --type space --protected` | Protect a space |
| `hf repos delete-files <repo_id> file.txt` | Delete files from repo |
| `hf repos branch create <repo_id> <branch>` | Create a branch |
| `hf repos branch delete <repo_id> <branch>` | Delete a branch |
| `hf repos tag create <repo_id> v1.0` | Create a tag |
| `hf repos tag delete <repo_id> v1.0` | Delete a tag |
| `hf repos tag list <repo_id>` | List tags |

---

## DISCUSSIONS & PRs
| Command | Description |
|---------|-------------|
| `hf discussions list <repo_id>` | List discussions/PRs |
| `hf discussions info <repo_id> <num>` | Get discussion info |
| `hf discussions create <repo_id> --title "Title"` | Create discussion |
| `hf discussions comment <repo_id> <num> --body "text"` | Add comment |
| `hf discussions edit <repo_id> <num> <comment_id> --body "new"` | Edit comment |
| `hf discussions close <repo_id> <num>` | Close discussion |
| `hf discussions reopen <repo_id> <num>` | Reopen discussion |
| `hf discussions rename <repo_id> <num> "New title"` | Rename discussion |
| `hf discussions diff <repo_id> <num>` | View PR diff |
| `hf discussions merge <repo_id> <num>` | Merge a PR |

---

## JOBS
| Command | Description |
|---------|-------------|
| `hf jobs list` | List running jobs |
| `hf jobs logs <job_id>` | View job logs |
| `hf jobs inspect <job_id>` | Detailed job info |
| `hf jobs cancel <job_id>` | Cancel a job |
| `hf jobs stats <job_id>` | Resource usage stats |
| `hf jobs wait <job_id>` | Wait for job to finish |
| `hf jobs hardware` | Available hardware options |
| `hf jobs ssh <job_id>` | SSH into a running job |
| `hf jobs run python:3.12 python -c 'print("hi")'` | Run a job |
| `hf jobs labels <job_id> --label env=prod` | Add labels to job |
| `hf jobs uv run my_script.py` | Run Python script with inline deps |
| `hf jobs scheduled list` | List scheduled jobs |
| `hf jobs scheduled run "0 0 * * *" python:3.12 python script.py` | Schedule recurring job |
| `hf jobs scheduled run daily python:3.12 python script.py` | Schedule with preset (daily/weekly/hourly...) |
| `hf jobs scheduled run "*/5 * * * *" python:3.12 script.py --flavor t4-small` | Schedule with GPU |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py -e KEY=VALUE -s SECRET=val` | Schedule with env + secrets |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py -v hf://buckets/user/b:/data` | Schedule with volume mounts |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py --expose 8000` | Schedule with public port |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py --timeout 1h` | Schedule with max duration |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py --suspend` | Create suspended (paused) schedule |
| `hf jobs scheduled run "0 0 * * *" python:3.12 script.py --concurrency` | Allow concurrent runs |
| `hf jobs scheduled uv "*/5 * * * *" my_script.py` | Schedule UV script |
| `hf jobs run python:3.12 python -c 'print("hi")'` | Run a one-off job |
| `hf jobs run python:3.12 script.py --flavor a10g-large` | Run job with GPU |
| `hf jobs run python:3.12 script.py -e KEY=VALUE -s SECRET=val` | Run job with env + secrets |
| `hf jobs run python:3.12 script.py -v hf://buckets/user/b:/data` | Run job with volume mount |
| `hf jobs run python:3.12 script.py --expose 8000` | Run job with public port |
| `hf jobs run python:3.12 script.py --timeout 30m` | Run job with max duration |
| `hf jobs run python:3.12 script.py --namespace my-org` | Run job in org namespace |
| `hf jobs scheduled inspect <id>` | Scheduled job details |
| `hf jobs scheduled suspend <id>` | Pause scheduled job |
| `hf jobs scheduled resume <id>` | Resume scheduled job |
| `hf jobs scheduled trigger <id>` | Trigger immediately |
| `hf jobs scheduled delete <id>` | Delete scheduled job |
| `hf jobs scheduled labels <id> --label env=prod` | Label scheduled job |
| `hf jobs scheduled uv "*/5 * * * *" my_script.py` | Schedule UV script |

---

## SANDBOX
| Command | Description |
|---------|-------------|
| `hf sandbox create` | Create a sandbox VM |
| `hf sandbox create ubuntu:24.04` | Create with custom image |
| `hf sandbox create --flavor a10g-small` | Create with GPU |
| `hf sandbox create --pool <pool_id> --env LOG_LEVEL=debug` | Cheap shared sandbox from pool |
| `hf sandbox create --forward-hf-token` | Inject HF_TOKEN into sandbox |
| `hf sandbox create --idle-timeout 10m` | Auto-terminate after inactivity |
| `hf sandbox exec <id> -- python -c "print(42)"` | Run command in sandbox |
| `hf sandbox spawn <id> -- python -m http.server 8000` | Run background process |
| `hf sandbox cp data.csv <id>:/data/data.csv` | Copy file to sandbox |
| `hf sandbox kill <id>` | Terminate a sandbox |
| `hf sandbox process ls <id>` | List background processes |
| `hf sandbox process kill <id> <pid>` | Stop a background process |
| `hf sandbox pool create` | Warm a pool (boot host VM) |
| `hf sandbox pool ls` | List running pools |
| `hf sandbox pool delete <pool_id>` | Terminate pool + all sandboxes |

---

## INFERENCE ENDPOINTS
| Command | Description |
|---------|-------------|
| `hf endpoints list` | List endpoints |
| `hf endpoints describe <name>` | Endpoint details |
| `hf endpoints deploy <name> --repo gpt2 --framework pytorch --accelerator cpu --instance-size x4 --instance-type intel-icl --region us-east-1 --vendor aws` | Deploy endpoint (min required args) |
| `hf endpoints deploy <name> --repo model --framework vllm --accelerator gpu --instance-size x4 --instance-type nvidia-a100 --region us-east-1 --vendor aws --min-replica 2 --max-replica 5` | Deploy with autoscaling |
| `hf endpoints deploy <name> --repo model --framework vllm --accelerator gpu --instance-size x4 --instance-type nvidia-a100 --region us-east-1 --vendor aws --scale-to-zero-timeout 30` | Deploy with scale-to-zero |
| `hf endpoints deploy <name> --repo model --custom-image nexagi/sglang:v0.5.12 --framework custom --health-route /health --port 30000` | Deploy custom container |
| `hf endpoints deploy <name> --repo model --type protected` | Deploy with protected access |
| `hf endpoints deploy <name> --repo model --revision v1.0` | Deploy specific revision |
| `hf endpoints update <name> --min-replica 2` | Update endpoint |
| `hf endpoints pause <name>` | Pause endpoint |
| `hf endpoints resume <name>` | Resume endpoint |
| `hf endpoints scale-to-zero <name>` | Scale to zero |
| `hf endpoints delete <name>` | Delete endpoint |

---

## COLLECTIONS
| Command | Description |
|---------|-------------|
| `hf collections list` | List collections |
| `hf collections info <user>/<slug>` | Collection details |
| `hf collections create "My Models"` | Create collection |
| `hf collections delete <user>/<slug>` | Delete collection |
| `hf collections update <slug> --title "New Title"` | Update metadata |
| `hf collections add-item <slug> <repo_id> model` | Add model to collection |
| `hf collections delete-item <slug> <item_id>` | Remove item |
| `hf collections update-item <slug> <id> --note "text"` | Update item note |

---

## WEBHOOKS
| Command | Description |
|---------|-------------|
| `hf webhooks list` | List webhooks |
| `hf webhooks info <id>` | Webhook details |
| `hf webhooks create --url https://example.com/hook --watch model:repo` | Create webhook |
| `hf webhooks update <id> --url https://new-url.com/hook` | Update webhook |
| `hf webhooks enable <id>` | Enable webhook |
| `hf webhooks disable <id>` | Disable webhook |
| `hf webhooks delete <id>` | Delete webhook |

---

## EXTENSIONS
| Command | Description |
|---------|-------------|
| `hf extensions list` | List installed extensions |
| `hf extensions search` | Search available extensions |
| `hf extensions install <repo>` | Install extension from GitHub |
| `hf extensions exec <name>` | Execute an extension |
| `hf extensions remove <name>` | Remove extension |

---

## SKILLS
| Command | Description |
|---------|-------------|
| `hf skills list` | List marketplace skills |
| `hf skills add` | Download & install a skill |
| `hf skills update` | Update installed skills |
| `hf skills preview` | Preview generated skill |

---

## CACHE
| Command | Description |
|---------|-------------|
| `hf cache list` | List cached repos |
| `hf cache prune` | Remove detached revisions |
| `hf cache rm <repo>` | Remove cached repo |
| `hf cache verify <repo>` | Verify checksums |

---

## ENV / VERSION
| Command | Description |
|---------|-------------|
| `hf env` | Print environment info |
| `hf version` | Print CLI version |
| `hf update` | Update CLI to latest |

---

## User Info
- **Username:** arvindclaw
- **Token:** stored at `C:\Users\rvndk\.cache\huggingface\token`
- **Spaces:** arvindlabs/HuggingMes, arvindlabs/AIBat, arvindlabs/ha-space
