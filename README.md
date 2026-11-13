# Vastrack QA Engineer Assessment

**Role:** QA Engineer (mid-level, manual + automation)  
**Time allowed:** about 3 hours of actual work, spread over the weekend as suits you. Three hours is a guideline, not a reason to rush or compromise quality.  
**Deadline:** Monday 16 November 2026, 6:00 PM WAT.

## About the product

Routag is a logistics and courier delivery platform in Lagos, Nigeria. Businesses (online stores, restaurants, pharmacies) sign up, fund a prepaid Naira wallet and create deliveries through a web dashboard or API. Couriers accept deliveries on a mobile app, pick up the package and deliver it. Money moves through the wallet: the business is charged, the courier is credited, and a cancelled delivery is refunded.

You will test a **sandbox**: a self-contained delivery and wallet application that runs on your own machine. It holds no real data and is not connected to any live system. Do not test or probe any other system. See "Running the sandbox" below.

**What you will need:** Docker or Node 18+ to run the sandbox; a runtime for your automation framework (for example Node, Java or Python); and Postman or an equivalent API tool. You need internet to download the sandbox the first time (the Docker image, or the repository), and for a webhook receiver such as webhook.site if you test webhooks.

## Running the sandbox

Pick one.

**Option A: Docker.**

```
docker run --rm -p 4000:4000 ghcr.io/vastrack-tech/qa-sandbox:1.0
```

**Option B: Node 18 or later, from this repository.** Either clone it (GitHub will ask you to sign in) or use Code, then Download ZIP on the repository page:

```
git clone https://github.com/Vastrack-Tech/QA-Assessment-Nov-2026.git
cd QA-Assessment-Nov-2026/sandbox
npm install
npm start
```

Press Ctrl+C to stop it. Everything is held in memory, so stopping and restarting gives you clean data. You can also reset at any time with `POST /api/v1/reset`.

Then open:

- Dashboard: http://localhost:4000
- API docs (Swagger): http://localhost:4000/docs
- OpenAPI file for Postman import: http://localhost:4000/openapi.json

Test accounts (all passwords are `Password123!`):

| Role | Email |
| --- | --- |
| Business 1 (wallet NGN 50,000) | business1@sandbox.test |
| Business 2 (wallet NGN 50,000) | business2@sandbox.test |
| Courier 1 | courier1@sandbox.test |
| Courier 2 | courier2@sandbox.test |

Log in with `POST /api/v1/auth/login` to get a bearer token. Business API keys also work as bearer tokens (`GET /api/v1/api-keys`).

Notes:

- The dashboard is for businesses. Courier actions (accept, pick up, deliver, cancel) are available through the API only.
- Fee = 1500 + 200 x weight in kg (NGN). The courier is paid 80% of the fee.
- Webhooks are sent to the URL you set with `PUT /api/v1/webhook`.

## The journey you are testing

1. A business gets a delivery quote and creates a delivery.
2. The business publishes the delivery.
3. A courier accepts it. The delivery fee is held from the business wallet.
4. The courier picks up the package and delivers it using the delivery code.
5. The fee is settled: the business is debited and the courier is credited.
6. At any point before completion the delivery can be cancelled, and the held money must be handled correctly.
7. Status changes and tracking update in near real time, and the business can be notified by webhook.

## Tasks

### Task A: Test design and manual testing

1. Write about 20 to 25 test cases for the journey above in a spreadsheet, focused on the areas you judge riskiest. Columns: ID, area, scenario, preconditions, steps, expected result, type (positive, negative, edge), priority.
2. Cover valid and invalid inputs and boundary values. Beyond that, decide for yourself what matters and what could go wrong.
3. Execute at least 10 of them against the sandbox. Record pass/fail and evidence.

Quality matters more than volume.

### Task B: API testing

Using Postman (or equivalent), build a collection of 8 to 10 requests that tests the delivery and wallet APIs, with automated assertions. Decide for yourself what to cover and why.

### Task C: UI automation

Automate these two scenarios against the dashboard:

1. A business successfully creates a delivery.
2. Validation errors appear when required fields are missing.

Use Playwright, Cypress or Selenium, in whichever language you are strongest in. Keep the tests independent, avoid fixed sleeps, make the assertions meaningful, and read configuration from environment variables.

Bonus (not required): a test that checks a delivery's status after courier acceptance (you may drive the courier step through the API), or the wallet balance after a delivery.

### Task D: Bug reporting

Report **two** bugs. Real defects you found in the sandbox are preferred. If you found fewer than two, write realistic hypothetical ones for this domain and mark them clearly as hypothetical.

Each report: title, environment, steps to reproduce, expected result, actual result, severity, priority, and evidence (screenshot, video, logs or request/response). Explain in one line why you chose that severity and priority.

### Task E: QA reasoning

Answer in your own words, at most 150 words each:

1. A release is two days away and you have one day of testing time. How do you decide what to test?
2. How would you test the wallet so a business is never debited twice for one delivery?
3. How would you put your automated tests into a CI/CD pipeline?

## What to submit

Submit the following, in a ZIP or in a GitHub repository:

1. `test-cases.xlsx` (or a Google Sheet link): Task A.
2. A Postman collection and environment export (JSON): Task B.
3. The automation project source: Task C.
4. `bug-reports.md` (or PDF): Task D.
5. `answers.md`: Task E.
6. `README.md`: how to install and run your tests in under five minutes, plus any assumptions you made and anything you would do with more time.

Do not commit credentials. Use environment variables and provide a `.env.example`.

**How to submit.** Submit before Monday 16 November 2026, 6:00 PM WAT. We will confirm receipt.

- **If you prefer GitHub:** put the items in your own repository and send us the link. If it is private, add the GitHub user `OWL-vasttrack` as a collaborator.
- **Otherwise:** reply to the email you received this assessment in, with a ZIP attached. Keep it under about 20 MB and leave out `node_modules`.

## Rules

- You may use documentation, search and AI tools. If you use AI, say so in the README of your submission and say what you checked yourself. You will be asked to explain and defend any part of your submission in the follow-up interview.
- If something in the brief is unclear, state your assumption and carry on. Questions to the hiring team are allowed, and the quality of your questions is noted.
- Test only the sandbox you were given. The source is in the repository only so you can run it without Docker. Do not read it to look for bugs. We want to see how you test it as a user and API consumer, and you will be asked in the interview how you found each issue.

## How you will be assessed

We value judgement over tooling. We look at whether you understand what to test and why, whether you find real problems, and whether your work is clear, reproducible and maintainable. Writing automation scripts alone will not earn a high score.
