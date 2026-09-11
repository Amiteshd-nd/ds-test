# Repo guardrails

These rules are non-negotiable for any work in this repository.

## 1. Scope — changes stay in this repo

Every change made for this repo happens **exclusively inside this repository directory**
(`cloud-march/`). Never create, edit, move, or delete files outside it (no global configs,
no other projects, no home-directory files) as part of repo work.

## 2. Ports — never start with 4 or 5

**Do not use any port that begins with the digit 4 or 5.** This rules out the whole 4xxx
and 5xxx ranges (including Vite's 5173 default). When adding a project or picking any port,
choose one outside those ranges.

Current allocation (all compliant):

| Service       | Port |
| ------------- | ---- |
| blockmodel    | 6176 |
| personal-doc  | 6173 |
| game          | 6174 |
| gully         | 6175 |
| discovery     | 6177 |
| trimension    | 6178 (web), 8788 (session server) |
| hub           | 8787 |

Set the port explicitly (e.g. Vite `server.port` + `strictPort`, Next `-p`) so it holds
when a package is run directly, not just via the hub. Note: numbers like `4326` in
gully's SQL are an EPSG coordinate-system code, **not** a port — leave them alone.
