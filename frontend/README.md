# Frontend (Multi-Page Flow)

This frontend now uses a strict page flow:

1. `index.html` -> Login/Signup
2. `upload.html` -> Upload 1-2 reference documents (optional) + final document (required), then run analysis
3. `issues.html` -> Line-level issue page (duplication, inconsistency, contradiction)
4. `summary.html` -> Final full-document summary
5. `dashboard.html` -> Final error dashboard (Reference vs Final comparison + line-level table)

## Run

Serve this folder using any static server from `frontend/`:

```bash
python -m http.server 8080
```

Open:

- `http://127.0.0.1:8080/index.html`

## Backend dependency

Frontend expects Flask backend endpoints:

- `POST /api/register`
- `POST /api/login`
- `POST /api/analyze` (multipart: `file` final doc, optional `referenceFiles[]`, `scanMode`)

Fallback aliases are also supported in client code (`/register`, `/login`, `/analyze`) across ports `5000` and `5001`.

## Notes

- Login state and analysis payload are stored in `sessionStorage`.
- If user session is missing, `upload.html`, `issues.html`, and `summary.html` redirect to `index.html`.
- If analysis payload is missing, `issues.html` and `summary.html` redirect to `upload.html`.
