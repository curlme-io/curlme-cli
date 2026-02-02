# curlme CLI

## Terminal-first HTTP request debugging

Capture, inspect, replay, and diff HTTP requests directly from your terminal.

Part of [curlme.io](https://curlme.io) - a terminal-first HTTP request debugging tool that keeps the entire debugging loop in the terminal. No dashboards required. No infrastructure setup.

## Installation

Install the CLI globally via npm:

```bash
npm install -g @curlme/cli
```

## Getting Started

1. **Login**: Generate an API key at [curlme.io/account](https://curlme.io/account) and authenticate:

    ```bash
    curlme auth login
    ```

2. **Create a Bin**: Create your first bin to start receiving requests:

    ```bash
    curlme bin create my-debug-bin
    ```

3. **Listen**: Start a real-time stream of incoming requests:

    ```bash
    curlme listen
    ```

## Command Reference

### Authentication (`auth`)

Commands to manage your session and account.

* **`curlme auth login`**: Log in using your API key.
* **`curlme auth whoami`**: Show the currently authenticated user.
* **`curlme auth logout`**: Remove the stored API key.

### Bin Management (`bin`)

Manage your request bins.

* **`curlme bin create [name]`**: Create a new bin. Sets it as the active bin automatically.
* **`curlme bin list`** (alias: `ls`): List all bins in your account.
* **`curlme bin use <id>`**: Set a specific bin as "active" for subsequent commands.
* **`curlme bin info <id>`**: Show detailed information, including endpoint URLs.
* **`curlme bin delete <id>`**: Permanently delete a bin and all its requests.

### Request Inspection

Inspect requests in your active bin.

* **`curlme listen [binId]`** (alias: `tail`): Stream incoming requests in real-time.

  * **Interactive Shortcuts**:

    * `[Enter]`: Inspect latest request
    * `[R]`: Replay latest request
    * `[D]`: Diff latest vs previous
    * `[O]`: Open bin in dashboard

* **`curlme latest [binId]`** (alias: `l`): Show the headers and body of the most recent request.
* **`curlme show <requestId> [binId]`** (alias: `s`): Show details for a specific request ID or short ID.

### Advanced Tools

* **`curlme replay [requestId] [binId] [--to <url>]`** (alias: `r`): Reforward a captured request to a local target (default: `http://localhost:3000`).
* **`curlme diff [id1] [id2] [binId]`** (alias: `d`): Compare two requests for differences in body or headers.
* **`curlme export [binId] [--format <json|curl>]`**: Export request data for use in other tools.
* **`curlme open [binId]`**: Open the bin's dashboard in your default web browser.

## Environment Variables

* `CURLME_API_URL`: Override the default API endpoint (defaults to `https://curlme.io`).

## License

MIT
