# Backend Service

This backend service is also designed in a microservice architecture; [check here](https://github.com/xerdin442/wager-application)

## Deployment

:globe_with_meridians: **A live deployment link and Postman collection is available upon request**

## Prerequisites

- Node.js
- Docker
- Docker Desktop

## Tech Stack

- **Framework**: NestJS
- **Database**: Postgres
- **File Storage**: Cloudinary
- **Queues**: BullMQ
- **Mail**: Resend
- **Tests**: Jest & Supertest
- **Blockchain RPC Providers**: Helius (Solana) & Alchemy (Base)
- **Observability & Monitoring**: Prometheus and Grafana

## Getting Started

Clone this repository and follow the instructions to set up the project locally:

### 1. Installation

- Run `npm install` to install all the project dependencies.

### 2. Environment Variables

- [Use the sample here](./.env.example) to create three files - `.env`, `.env.test` and `.env.local` - for storing and managing the required global environment variables in test and development environments.
- `localhost` should be the hostname for all external service urls (database and redis) in the `.env.test` file. This will connect the test environment to the same docker instances as `docker.host.internal` in the `compose.test.yml` file.

### 3. Database Migrations

The database schema is located [here](prisma/schema.prisma). If no schema changes are needed, move to the next step. If you make changes to the schema, follow these steps to run migrations locally:

- Start the database container: `npm run compose:db` (**ensure Docker Desktop is running!**)
- Apply the migrations: `npm run migrate`

### 4. Initialization

- Start the storage and monitoring services: `npm run compose:up`
- Start the server: `npm run start:dev`
- When the Nest application is fully initialized, the server should be running at: `http://localhost:3000`
> The Nest application runs outside Docker.

### 5. Tests

- For unit tests, run: `npm run test`
- For end-to-end tests, run;
  - Start the test containers: `npm run compose:test`
  - Run the tests: `npm run test:e2e`

### 6. Monitoring

- To view the custom application metrics on Grafana, visit: `http://localhost:3002`.
- If you add new metrics, update the dashboard [config file](./monitoring/grafana/dashboards/observability.json).

<br>

> If you make changes to any of the compose files in test or development, restart the containers using: `npm run compose:restart`.
> To kill the containers, run `npm run compose:down`.

## Endpoints

### App

| Method | Path            | Description                          |
| ------ | --------------- | ------------------------------------ |
| GET    | /metrics?admin= | Retrieve all app-related metrics     |
| GET    | /health         | Health check endpoint for deployment |

### Auth API

| Method | Path                             | Description                                               |
| ------ | -------------------------------- | --------------------------------------------------------- |
| POST   | /auth/signup                     | Sign up a new user                                        |
| POST   | /auth/login                      | Sign in an existing user                                  |
| POST   | /auth/logout                     | Sign out a logged in user                                 |
| POST   | /auth/2fa/enable                 | Retrieve QRcode image url to enable 2FA                   |
| POST   | /auth/2fa/disable                | Disable 2FA                                               |
| POST   | /auth/2fa/verify                 | Verify code from authenticator app                        |
| POST   | /auth/password/reset             | Request a password reset                                  |
| POST   | /auth/password/resend-otp        | Resend password reset OTP                                 |
| POST   | /auth/password/verify-otp        | Verify password reset OTP                                 |
| POST   | /auth/password/new               | Change current password                                   |
| GET    | /auth/google                     | Redirect to Google's authentication page                  |
| GET    | /auth/google/callback            | Callback added to OAuth client details on Google console  |
| GET    | /auth/apple                      | Redirect to Apple's authentication page                   |
| POST   | /auth/apple/callback             | Callback endpoint whitelisted on Apple developer console  |
| GET    | /auth/social/details?socialAuth= | Retrieve user details and JWT after social authentication |

### Admin API

| Method | Path                          | Description                             |
| ------ | ----------------------------- | --------------------------------------- |
| POST   | /admin/signup                 | Create Super Admin profile              |
| POST   | /admin/login                  | Sign in an existing admin               |
| GET    | /admin?email=                 | Retrieve all admins                     |
| POST   | /admin/add?email=             | Add new admin                           |
| POST   | /admin/remove/:adminId?email= | Remove existing admin                   |
| POST   | /admin/disputes/:adminId      | Retrieve all dispute chats for an admin |

### Users API

| Method | Path                                    | Description                         |
| ------ | --------------------------------------- | ----------------------------------- |
| GET    | /user/profile                           | Get profile of logged in user       |
| PATCH  | /user/profile                           | Update user profile                 |
| DELETE | /user/profile                           | Delete user profile                 |
| GET    | /user/:userId                           | Get details of any user             |
| GET    | /user/wagers                            | Get all wagers for a user           |
| GET    | /user/transactions?chain=&status=&type= | Retrieve user transaction history   |
| POST   | /user/wallet/transfer                   | In-app funds transfer between users |

### Wagers API

| Method | Path                                    | Description                            |
| ------ | --------------------------------------- | -------------------------------------- |
| POST   | /wagers/create                          | Create new wager                       |
| POST   | /wagers/invite                          | Find wager by invite code              |
| GET    | /wagers/:wagerId                        | Get wager details                      |
| PATCH  | /wagers/:wagerId                        | Update wager details                   |
| GET    | /wagers/marketplace                     | Return wager marketplace               |
| POST   | /wagers/:wagerId/marketplace/add        | Add a wager to the marketplace         |
| POST   | /wagers/:wagerId/join                   | Join a pending wager                   |
| POST   | /wagers/:wagerId/claim                  | Claim wager prize                      |
| POST   | /wagers/:wagerId/claim/accept           | Accept wager prize claim               |
| POST   | /wagers/:wagerId/claim/contest          | Contest wager prize claim              |
| GET    | /wagers/:wagerId/dispute/chat           | Retrieve dispute chat messages         |
| POST   | /wagers/:wagerId/dispute/resolve?admin= | Assign winner after dispute resolution |
| DELETE | /wagers/:wagerId                        | Delete a pending wager                 |

### Wallet API

| Method | Path                    | Description                                    |
| ------ | ----------------------- | ---------------------------------------------- |
| POST   | /wallet/deposit         | Initiate deposit processing                    |
| POST   | /wallet/withdraw        | Initiate withdrawal processing                 |
| GET    | /wallet/rewards         | Get user rewards in BONK tokens                |
| POST   | /wallet/rewards/redeem  | Withdraw BONK token equivalent of user rewards |
| POST   | /wallet/rewards/convert | Convert reward points and add to user balance  |

## Social Authentication

- The frontend client sends a login request to `auth/google` or `auth/apple` endpoints. A query parameter, `redirectUrl`, is required to indicate the final redirect URL.
- The client is redirected to the auth provider's sign-in page and the user completes the authentication.
- The auth provider redirects the frontend client to the success page rendered by the backend. From here, the user is redirected to the frontend client using the earlier specified redirect URL when the `Return` button is clicked on the success page.
- During the redirect to the frontend client, the backend attaches a `socialAuth` query parameter to the URL.
- On page load after the redirect, the frontend client should send a request to `auth/social/details` using the `socialAuth` parameter. The value of this parameter is a unique identifier that will be used by the client to retrieve the JWT and other authentication details from the backend.

## Deposit Transactions

- The frontend client integrates a wallet kit (e.g Reown Appkit or Solana Mobile Wallet Adapter).
- To make a deposit, the user initiates a wallet connection request through the wallet kit.
  > Before the connection, the user should have Base Mainnet as the default for Ethereum in their wallet to enable transactions on Base.
- The wallet kit connects the user wallet and returns the connection details to the frontend client.
- The user specifies the amount in USDC to deposit, and signs a transaction request to transfer that amount from the connected wallet to the platform wallet.
- The wallet kit broadcasts the signed transaction to the network and returns the transaction identifier (hash or signature).
- The frontend client sends the transaction identifier and other details (as required by the `/wallet/deposit` endpoint) to the backend.
- The backend records the transaction as pending and notifies the user that deposit confirmation has been initiated.
- The backend confirms the deposit by comparing the onchain data from the transaction identifier with the details sent by the frontend client.
- The backend notifies the frontend client of the transaction status (success or failed) in real time using websockets.

## Withdrawal Transactions

- The frontend client sends the user's wallet adrress or domain name (only Basenames and SNS domains are supported for now), and other details (as required by the `/wallet/withdraw` endpoint) to the backend. An idempotency key header is also required to prevent duplicate transactions within a 15-minute period.
- The backend records the transaction as pending and notifies the user that withdrawal processing has been initiated.
- If the user attempts a similar withdrawal within 15 mins, the backend notifies the user that the initial withdrawal is still being processed.
- The backend verifies the wallet address or domain name, and initiates a transfer from the platform wallet to the user wallet.
- The backend notifies the frontend client of the transaction status (success or failed) in real time using websockets.

## Dispute Resolution

- In the event where one player contests the other player's prize claim in a wager, a dispute resolution chat is created with an admin and the two players.
- After presentation of evidence from both sides and proper verification, the admin assigns a winner and the chat is closed from further discussion.

Happy Wagering! :rocket:
