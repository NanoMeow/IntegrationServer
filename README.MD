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

All request payloads must be JSON. The entirety or part of request payload may
be ignored, depending on the endpoint.

For endpoints that requires authentication, the request payload must have:
- `auth: string|undefined` - Authentication key, if production.

All response payloads will be JSON. Beside content specific to endpoint, the
response payload will also have:
- `success: boolean` - Result state.
- `message: string|undefined` - Result message, if any.

Debug endpoints will send back formatted JSON, others minified.

Some endpoints may be disabled.

### GET `/`

Do nothing.

### POST `/`

Do nothing, request payload not read.

### POST `/echo` PRETTY

Send back request headers and payload.

Request payload:
- `...*: ...Any` - Anything.

Response payload:
- `headers: Object` - Request headers.
- `payload: Any` - Request payload.

### POST `/dbinit` AUTH

Initialize database.

### POST `/dbgc` AUTH

Vacuum database.

### GET `/info` PRETTY

Get debug information.

Response payload:
- `method: string` - Request method.
- `url: string` - Request URL.
- `host: string` - Host header.
- `ip: string` - Request IP.
- `proto: string` - Request protocol.
- `ua: string` - Request user agent.
- `headers: Object` - Request headers.
- `socket_ip: string` - IP of proxy server, or request IP if there is no proxy.
- `started: string` - Time when server started.
- `production: boolean` - Server mode.

### POST `/info`

Same as GET `/info`, payload not read.

### POST `/mapget`

Read entry of map.

Request payload:
- `key: string` - Entry key.

### POST `/mapset` AUTH

Write entry of map.

Request payload:
- `key: string` - Entry key.
- `val: string` - Entry value.

### GET `/noop`

Same as GET `/`.

### POST `/noop`

Same as POST `/`.

### POST `/repget` AUTH

Read 20 reports. Any order.

Response payload:
- `val: Array` - Reports.

### POST `/repset`

Send a report.

Request payload:
- `app: string` - Host name.
- `ver: string` - Host version.
- `cat: string` - Report category.
- `url: stirng` - Report URL.
- `msg: string` - Report message.

### POST `/repdel` AUTH

Delete a report.

Request payload:
- `id: string` - Serial number.

### POST `/solget`

Lookup solution.

Request payload:
- `dom: string` - Domain.

Response payload:
- `val: string|null` - Solution, if exists.

### POST `/solset` AUTH

Create or update solution.

Request payload:
- `dom: string` - Domain.
- `sol: string` - Solution.

### POST `/soldel` AUTH

Delete solution.

Request payload:
- `dom: string` - Domain.
