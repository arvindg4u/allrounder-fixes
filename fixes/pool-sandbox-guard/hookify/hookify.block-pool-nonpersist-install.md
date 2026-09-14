---
name: block-pool-nonpersist-install
enabled: true
event: bash
pattern: (?:^(?![\s\S]*?(?:venv/bin/activate|\.venv/bin/|VIRTUAL_ENV|CONDA_PREFIX|PIP_TARGET|UV_PROJECT_ENVIRONMENT|PYTHONUSERBASE|--target|--prefix|--root))[\s\S]*?\b(?:pip3?|python3?\s+-m\s+pip|uv\s+pip)\s+install\b)|(?:^(?![\s\S]*?(?:venv/bin/activate|\.venv/bin/|VIRTUAL_ENV|CONDA_PREFIX|PIP_TARGET|UV_PROJECT_ENVIRONMENT|PYTHONUSERBASE|--target|--prefix|--root))[\s\S]*?\buv\s+add\b)|(?:\bnpm\b[^\n;&|]*?\s(?:-g|--global)(?=[\s=]|$))|(?:\byarn\s+global\b)|(?:\b(?:pnpm|bun)\b[^\n;&|]*?\s(?:-g|--global)(?=[\s=]|$))|(?:(?<![\w-])(?:apt|apt-get|yum|dnf|microdnf|pacman|yay|paru|apk|zypper|emerge|snap|pkg|brew|dpkg|rpm)\s+(?:install|uninstall|remove|upgrade|update|reinstall|purge|autoremove|dist-upgrade|full-upgrade|clean|tap|untap|link|unlink|-i)\b)|(?:^(?![\s\S]*?(?:CARGO_HOME=(?:~/|__POOL_ROOT_RX__|\$HOME|__POOL_ALIAS_RX__)|--root\s+(?:~/|__POOL_ROOT_RX__|\$HOME)))[\s\S]*?\bcargo\s+install\b)|(?:^(?![\s\S]*?(?:GOBIN=(?:~/|__POOL_ROOT_RX__|\$HOME|__POOL_ALIAS_RX__)|GOPATH=(?:~/|__POOL_ROOT_RX__|\$HOME|__POOL_ALIAS_RX__)))[\s\S]*?\bgo\s+install\b)|(?:^(?![\s\S]*?(?:GEM_HOME=(?:~/|__POOL_ROOT_RX__|\$HOME|__POOL_ALIAS_RX__)|--install-dir\s+))[\s\S]*?\bgem\s+install\b)|(?:^(?![\s\S]*?(?:PREFIX=(?:~/|__POOL_ROOT_RX__|\$HOME)|DESTDIR=))[\s\S]*?\bmake\s+[^\n;&|]*?\binstall\b)|(?:^(?![\s\S]*?--prefix\s+(?:~/|__POOL_ROOT_RX__|\$HOME))[\s\S]*?\bcmake\s+[^\n;&|]*?--install\b)|(?:\bmeson\s+install\b)|(?:\bninja\s+install\b)|(?:\bpipx\s+(?:install|inject|upgrade|reinstall)\b)|(?:(?<![\w-])(?:cpan|cpanm)\b)|(?:(?<![\w-])(?:systemctl|service)\s+(?:start|stop|restart|enable|disable|mask)\b)
action: block
---

Blocked: global/system installs do NOT persist on this pool-machine sandbox. Only __POOL_ROOTS__ survives restart.

Detected: a system package manager (apt/yum/dnf/apk/brew/snap), a global JS install (npm -g, yarn global, pnpm/bun -g), a system-wide Python install (plain `pip install` outside a studio venv and without `--target`), `cargo`/`go`/`gem` install without a studio-local home, `make`/`cmake`/`meson`/`ninja` install without a studio prefix, `pipx`/`cpan`, or a `systemctl`/`service` change. All of it is wiped on restart.

Install inside the studio instead (never use sudo): `python -m venv ~/venv && source ~/venv/bin/activate` then pip install, or `pip install --target=~/libs`, `npm i` / `npm i --prefix ~/...`, `CARGO_HOME=~/cargo`, `GOBIN=~/go/bin`, `make install PREFIX=~/...`, `cmake --install ... --prefix ~/...`.
