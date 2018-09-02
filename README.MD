# Integration Server

Solutions database and reports processor

## Setup

Adapt when appropriate.

1. Run `git remote add heroku https://git.heroku.com/nanoserver.git`
2. Run `heroku login`
3. Run `heroku addons:create heroku-postgresql:hobby-dev`
3. Run `heroku config:set MY_DB_SECRET=BXJVcouAWC9Fg8iKmVBDITCbzqqJ8Jf6`

## Deploy

1. Run `git push heroku master`

## Endpoints

The entire or some part of request payload may be ignored.

All response payloads will be JSON. They have the following entry keys, plus
specific keys depending on the endpoint:
- `success: boolean` - Result state.
- `message: string|undefined` - Result message, if there is any.

Some endpoints may be disabled.

### GET `/` or 

Do nothing.

### POST `/`

Do nothing, payload not read.

### POST `/echo`

Send back request payload, with a bit more debug information.

Request payload:
- `*: Any` - Anything.

Response payload:
- `headers: Object` - Request headers.
- `payload: Any` - Request payload.

### POST `/dbinit`

Initialize database.

Request payload:
- `auth: string|undefined` - Authentication key, only needed for production
  mode.

### POST `/dbgc`

Vacuum database.

Request payload:
- `auth: string|undefined` - Authentication key, only needed for production
  mode.

### GET `/info`

Send back debug information.

Response payload:
- `method: string` - Request method.
- `url: string` - Request URL.
- `host: string` - Host header.
- `ip: string` - Request IP.
- `proto: string` - Request protocol.
- `ua: string` - Request user agent.
- `headers: Object` - Request headers.
- `socket_ip: string` - IP of proxy server.
- `started: string` - Time when server started.
- `production: boolean` - Server mode

### POST `/info`

Same as GET `/info`, payload not read.

### GET `/noop`

Same as GET `/`.

### POST `/noop`

Same as POST `/`.
