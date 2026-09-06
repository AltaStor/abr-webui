## Local Setup

Follow these steps to get the project running on your local machine.

### Prerequisites
* **Node.js:** v18.x or higher
* **Package Manager:** `npm` (or `yarn`/`pnpm`)
* **Backend checkout:** the `abr-core` repository, for the dev server's TLS
  certificate (see step 3). A sibling `../abr-core` is found automatically;
  anywhere else, point `ABR_CORE_ROOT` at it.

### Installation Steps

1.  **Change directory:**
    ```bash
    cd abr-webui
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `https://localhost:3000`.

    The dev server generates (or reuses) the same self-signed TLS certificate
    the backend bootstraps for itself, by running
    `python -m python.srv.core.tls_bootstrap` inside the `abr-core` checkout
    (`python/srv/core/tls_bootstrap.py` there), so that checkout must be
    reachable -- as a sibling `../abr-core`, or via `ABR_CORE_ROOT` -- and
    `python3` on `PATH` must have `cryptography` installed (override the
    interpreter with `PYTHON_BIN`). If the checkout can't be found or the
    command can't be run, the dev server falls back to plain HTTP and logs a
    warning naming which of the two it was, instead of failing. Since the
    certificate is self-signed, the browser will show an untrusted-certificate
    warning the first time -- accept it, the same as for the API on port 443.

### Build and Lint Commands
* `npm run build`: Compiles TypeScript and builds the application for production.
* `npm run preview`: Bootstraps a local static web server (also over HTTPS, same as `npm run dev`) to serve the production build.
* `npm run lint`: Runs ESLint to catch syntax and style issues.
