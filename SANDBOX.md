# Delivery Sandbox: running it

An isolated copy of a delivery and wallet system for the QA assessment. It runs entirely on your machine and holds no real data. Nobody else can see what you do in it.

## Run it

You need Docker. From the folder containing `docker-compose.yml`:

```
docker compose up
```

The first run downloads the image. To stop it, press Ctrl+C, then `docker compose down`.

Then open:

- Dashboard: http://localhost:4000
- API docs (Swagger): http://localhost:4000/docs
- OpenAPI file for Postman import: http://localhost:4000/openapi.json

## Test accounts

All passwords are `Password123!`.

| Role | Email |
| --- | --- |
| Business 1 (wallet NGN 50,000) | business1@sandbox.test |
| Business 2 (wallet NGN 50,000) | business2@sandbox.test |
| Courier 1 | courier1@sandbox.test |
| Courier 2 | courier2@sandbox.test |

Log in through `POST /api/v1/auth/login` to get a bearer token. Business API keys also work as bearer tokens (see `GET /api/v1/api-keys`).

## Notes

- The dashboard is for businesses. Courier actions (accept, pick up, deliver, cancel) are available through the API only.
- Fee = 1500 + 200 x weight in kg (NGN). The courier is paid 80% of the fee.
- To get a clean state at any time: `POST /api/v1/reset`, or restart the server.
- Webhooks are sent to the URL you set with `PUT /api/v1/webhook`. Use a free receiver such as webhook.site.
- All data is held in memory and is lost when the server stops.
