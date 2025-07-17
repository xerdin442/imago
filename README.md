# Wager Application

This API is a robust backend service for a stablecoin-powered wager application that enables users create and join wagers, as well as dispute and resolve wagers. I also designed this app in a microservice architecture; [check here](https://github.com/xerdin442/wager-application)

## Features

- **User Authentication**: Secure user authentication system - with an option to enable 2FA for added security - and role-based access control for users and admins.
- **Social Authentication**: Google authentication for quicker user sign-in or onboarding.
- **Wager Management**: Creation and joining of head-to-head wagers on any topic of choice across diverse categories.
- **Dispute Resolution**: Evidence-based resolution mechanism to address disputes between wager players, with a focus on fairness and transparency.
- **Stablecoin Integration**: USDC deposits and withdrawals (on Base and Solana) to enhance borderless payments.
- **Domain Names**: Supports the use of Basenames and SNS domains for withdrawals.
- **Notifications**: Websockets for real-time transaction updates and chat rooms for dispute resolution.
- **Queue Management**: Optimized asynchronous processing by using queues to abstract transaction processing, dispute resolution and email notifications from the main application workflow.
- **Metrics and Analytics**: Tracks important metrics like transaction volumes and dispute resolution rates

## Coming up...

- **Multi-Player Contests**: Multi-player prize contests for games such as Call of Duty Mobile and Fantasy Premier League (FPL). Also, adding support for creating multi-player prize tournaments in football games (such as EA FC or eFootball).
- **Savings**: Feature to enable auto-save on winnings. The savings will be staked onchain, and yields will be accumulated to grow the user's balance over time.
- **Rewards**: Onchain reward system to allocate points on public leaderboard for consistent players based on individual wins and winning streak. The points can be redeemed to get a platform-supported SPL token, which can be withdrawn at any time or swapped to USDC and added to user balance.

## Deployment

:globe_with_meridians: **A live deployment link and Postman collection is available upon request**

## Prerequisites

- Node.js
- Docker
- Docker Desktop

## Tech Stack

- **Framework**: NestJS
- **Database**: Postgres
- **File Storage**: AWS S3
- **Queues**: BullMQ
- **Mail**: Resend
- **Tests**: Jest & Supertest
- **Secrets**: AWS SecretsManager
- **Blockchain RPC Providers**: Helius (Solana) & Alchemy (Base)

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
- Apply the migrations: `npm run migrate:local`

### 4. Initialization

- Start the dev containers `npm run compose:dev`
- Check the logs of the `backend` container on Docker Desktop. When the Nest application is fully initialized, the application should be running at: `http://localhost:3000/`
- If you make changes to the backend code, restart the service using: `npm run compose:restart -- backend`

### 5. Tests

- For unit tests, run: `npm run test`
- For end-to-end tests, run;
  - Start the test containers: `npm run compose:test`
  - Run the tests: `npm run test:e2e`

<br>

> If you make changes to any of the compose files in test or development, stop the containers using: `npm run compose:down`. Then, rebuild the docker images using: `npm run compose:build`

## Endpoints

### App

| Method | Path     | Description                          |
| ------ | -------- | ------------------------------------ |
| GET    | /metrics | Retrieve all app-related metrics     |
| GET    | /health  | Health check endpoint for deployment |

### Auth API

| Method | Path                      | Description                                               |
| ------ | ------------------------- | --------------------------------------------------------- |
| POST   | /auth/signup              | Sign up a new user                                        |
| POST   | /auth/login               | Sign in an existing user                                  |
| POST   | /auth/logout              | Sign out a logged in user                                 |
| POST   | /auth/2fa/enable          | Enable 2FA                                                |
| POST   | /auth/2fa/disable         | Disable 2FA                                               |
| POST   | /auth/2fa/verify          | Verify code from authenticator app                        |
| POST   | /auth/password/reset      | Request a password reset                                  |
| POST   | /auth/password/resend-otp | Resend password reset OTP                                 |
| POST   | /auth/password/verify-otp | Verify password reset OTP                                 |
| POST   | /auth/password/new        | Change current password                                   |
| GET    | /auth/google              | Redirect to Google's authentication page                  |
| GET    | /auth/google/callback     | Callback added to OAuth client details on Google console  |
| POST   | /auth/google/details      | Retrieve user details and JWT after Google authentication |

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
| GET    | /user/profile                           | Get user profile                    |
| PATCH  | /user/profile                           | Update user profile                 |
| DELETE | /user/profile                           | Delete user profile                 |
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
| POST   | /wagers/:wagerId/join                   | Join a pending wager                   |
| POST   | /wagers/:wagerId/claim                  | Claim wager prize                      |
| POST   | /wagers/:wagerId/claim/accept           | Accept wager prize claim               |
| POST   | /wagers/:wagerId/claim/contest          | Contest wager prize claim              |
| GET    | /wagers/:wagerId/dispute/chat           | Retrieve dispute chat messages         |
| GET    | /wagers/:wagerId/dispute/resolve?admin= | Assign winner after dispute resolution |
| DELETE | /wagers/:wagerId                        | Delete a pending wager                 |

### Wallet API

| Method | Path             | Description                    |
| ------ | ---------------- | ------------------------------ |
| POST   | /wallet/deposit  | Initiate deposit processing    |
| POST   | /wallet/withdraw | Initiate withdrawal processing |

## Google Authentication

- The frontend client sends a login request to `auth/google` with a required query parameter to indicate the redirect URL.
- The client is redirected to Google's onboarding page and the user completes the authentication.
- Google redirects the frontend client to the success page rendered by the backend. From here, the user is redirected to the frontend client using the earlier specified redirect URL when the `Return` button is clicked on the success page.
- During the redirect to the frontend client, the backend attaches a `googleAuth` query parameter to the URL.
- On page load after the redirect, the frontend client should send a request to `auth/google/details` using the `googleAuth` parameter. The value of this parameter is a unique identifier that will be used by the client to retrieve the JWT and other authentication details from the backend.

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
