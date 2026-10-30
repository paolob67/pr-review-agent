# notes-sandbox

A tiny in-memory notes API. It exists only as the target repository for the AI Assisted pull
request reviewer. It is not a real product.

## Run

```sh
npm start        # listens on PORT or 3000
npm test
```

## API

| Method | Path | Result |
|---|---|---|
| GET | `/notes` | List notes |
| POST | `/notes` with `{"text": "..."}` | Create a note (1 to 500 characters) |
| DELETE | `/notes/:id` | Delete a note, 404 if unknown |

## Review rules

Team rules and standards the reviewer applies live in [`.bob-review/`](.bob-review/).
