## Local Setup

Follow these steps to get the project running on your local machine.

### Prerequisites
* **Node.js:** v18.x or higher
* **Package Manager:** `npm` (or `yarn`/`pnpm`)

### Installation Steps

1.  **Change directory:**
    ```bash
    cd web
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
    the backend bootstraps for itself via
    `python -m python.srv.core.tls_bootstrap` (see
    [python/srv/core/tls_bootstrap.py](../python/srv/core/tls_bootstrap.py)),
    so a Python checkout with `cryptography` installed must be available on
    `PATH` as `python3` (override with `PYTHON_BIN`). If it can't be found or
    run, the dev server falls back to plain HTTP and logs a warning instead
    of failing. Since the certificate is self-signed, the browser will show
    an untrusted-certificate warning the first time -- accept it, the same as
    for the API on port 8443.

### Build and Lint Commands
* `npm run build`: Compiles TypeScript and builds the application for production.
* `npm run preview`: Bootstraps a local static web server (also over HTTPS, same as `npm run dev`) to serve the production build.
* `npm run lint`: Runs ESLint to catch syntax and style issues.
