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

Some endpoints may be disabled. All returned payloads have the following
entry keys:
entry keys:
- `success`: `boolean` - Result state.
- `message`: `string|undefined` - Result message, if there is any.

### GET `/` or 

Do nothing.

### POST `/`

Do nothing, payload not read.

### POST `/echo`

Send back request payload, with a bit more debug information.

Required payload:
- `*`: `Any` - Anything.

Returned payload:
- `headers`: `Object` - Request headers.
- `payload`: `Any` - Request payload.

### POST `/dbinit`

Initialize 

### GET `/info`

Send back debug information.

Returned payload:
- `method`: `string` - Request method.
- `url`: `string` - Request URL.
- `host`: `string` - Host header.
- `ip`: `string` - Request IP.
- `proto`: `string` - Request protocol.
- `ua`: `string` - Request user agent.
- `headers`: `Object` - Request headers.
- `socket_ip`: `string` - IP of proxy server.
- `started`: `string` - Time when server started.
- `production`: `boolean` - Server mode

### POST `/info`

Same as GET `/info`, payload not read.

### GET `/noop`

Same as GET `/`.

### POST `/noop`

Same as POST `/`.
