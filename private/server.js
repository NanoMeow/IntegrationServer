/******************************************************************************

    Integration Server - Solutions database and reports processor
    Copyright (C) 2018  Hugo Xu

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*******************************************************************************

    Server engine.

******************************************************************************/

"use strict";

/*****************************************************************************/

const assert = require("assert");
const error = require("./error.js");
const http = require("http");

/*****************************************************************************/

const DEBUG_PORT = "8888";

/*****************************************************************************/

const port = PROD ? process.env.PORT : DEBUG_PORT;

assert(typeof port === "string");

console.log("Server started on port " + port);

/*****************************************************************************/

let host = "localhost";

const set_host = (h) => {
    assert(typeof h === "string");

    host = h;
};

/*****************************************************************************/

let enabled = true;

const set_enabled = (v) => {
    assert(typeof v === "boolean");

    enabled = v;
};

/*****************************************************************************/

const headers = Object.freeze({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",

    "Access-Control-Allow-Origin": "*",
    "Strict-Transport-Security": "max-age=604800",

    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
});

/*****************************************************************************/

const apps = new Map();

const bind = (token, handler) => {
    assert(!apps.has(token));

    apps.set(token, handler);
};

const alias = (existing, new_name) => {
    assert(apps.has(existing) && !apps.has(new_name));

    apps.set(new_name, apps.get(existing));
};

/*****************************************************************************/

// https://devcenter.heroku.com/articles/http-routing#heroku-headers

const parse_host = (req, def = "0.0.0.0") => {
    let host = req.headers["host"];

    if (typeof host !== "string")
        host = def;
    else
        host = host.trim();

    return host;
};

const parse_ip = (req, def = "::ffff:0.0.0.0") => {
    let ip = req.socket.remoteAddress;

    // This happens when the client is already disconnected
    if (typeof ip !== "string")
        ip = def;

    if (PROD) {
        const _ip = req.headers["x-forwarded-for"];
        if (typeof _ip === "string") {
            const i = _ip.indexOf(",");
            if (i === -1)
                ip = _ip;
            else
                ip = _ip.substring(0, i);
        } else {
            console.warn("Proxy server did not set forwarded IP");
        }
    }

    ip = ip.trim();

    if (!ip.includes(":"))
        ip = "::ffff:" + ip;

    return ip;
};

const parse_origin = (req, def = "Unknown") => {
    let origin = req.headers["origin"];

    if (typeof origin !== "string")
        origin = def;
    else
        origin = origin.trim();

    return origin;
};

const parse_proto = (req, def = "http") => {
    let proto = def;

    if (PROD) {
        const _proto = req.headers["x-forwarded-proto"];
        if (typeof _proto === "string") {
            proto = _proto.trim();
        } else {
            console.warn("Proxy server did not set forwarded protocol");
        }
    }

    return proto;
};

const parse_ua = (req, def = "Unknown") => {
    let ua = req.headers["user-agent"];

    if (typeof ua !== "string")
        ua = def;
    else
        ua = ua.trim();

    return ua;
};

/*****************************************************************************/

const RequestEvent = class {

    /*************************************************************************/

    constructor(req, res) {
        this.req = req;
        this.res = res;

        this.method = req.method.toUpperCase().trim();
        this.url = req.url.toLowerCase().trim();

        this.host = parse_host(req);
        this.ip = parse_ip(req);
        this.origin = parse_origin(req);
        this.proto = parse_proto(req);
        this.ua = parse_ua(req);
    }

    /*************************************************************************/

    body(lim = 131072) {
        // About 128 kiB ASCII, can be up to 4 times more with Unicode

        assert(typeof lim === "number" && !isNaN(lim));

        if (this.method !== "POST")
            throw new error.RequestError("Bad method", 405);

        let blocking = false;
        let received = 0;

        let data = [];

        return new Promise((resolve, reject) => {
            this.req.setEncoding("utf8");

            this.req.on("data", (chunk) => {
                if (blocking)
                    return;

                received += chunk.length;

                if (received > lim) {
                    blocking = true;
                    reject(new error.RequestError("Payload too large", 413));
                    return;
                }

                data.push(chunk);
            });

            this.req.on("end", () => {
                blocking = true;

                data = data.join("");

                let r;
                try {
                    r = JSON.parse(data);
                } catch (err) {
                    return void reject(err);
                }

                if (typeof r !== "object" || r === null)
                    return void reject(
                        new error.RequestError("Invalid payload", 400),
                    );

                resolve(r);
            });

            this.req.on("error", (err) => {
                blocking = true;

                // TODO: See if this error can be triggered by client, if yes,
                // change it to RequestError so call stack won't get logged
                reject(err);
            });
        });
    }

    /*************************************************************************/

    auto_upgrade() {
        assert(this.url.startsWith("/"));

        if (PROD && this.proto === "http") {
            this.ez301(
                "https://" + host + this.url,
                "HTTPS upgrade required",
            );
            return true;
        }

        return false;
    }

    /*************************************************************************/

    ez200(obj = {}, pretty = false) {
        assert(typeof obj === "object" && typeof pretty === "boolean");

        this.res.writeHead(200, headers);

        let data = Object.assign({ success: true }, obj);
        if (pretty)
            data = JSON.stringify(data, null, 2);
        else
            data = JSON.stringify(data);

        this.res.end(data);
    }

    ez301(loc, msg = "Resource moved") {
        assert(typeof loc === "string" && typeof msg === "string");

        this.res.writeHead(301, Object.assign(
            {},
            headers,
            { "Location": loc },
        ));

        this.res.end(JSON.stringify({
            success: false,
            message: msg,
        }));
    }

    /*************************************************************************/

    fail(code, msg = "Error occurred") {
        assert(typeof code === "number" && typeof msg === "string");

        this.res.writeHead(code, headers);

        this.res.end(JSON.stringify({
            success: false,
            message: msg,
        }));
    }

    // Assertion in method fail

    ez400(msg = "Bad request") {
        this.fail(400, msg);
    }

    ez403(msg = "Not allowed") {
        this.fail(403, msg);
    }

    ez404(msg = "Not found") {
        this.fail(404, msg);
    }

    ez405(msg = "Bad method") {
        this.fail(405, msg);
    }

    ez500(msg = "Server broken") {
        this.fail(500, msg);
    }

    /*************************************************************************/

};

/*****************************************************************************/

const handler = (req, res) => {
    const e = new RequestEvent(req, res);

    if (!enabled)
        return void e.ez403();

    if (!e.url.startsWith("/"))
        return void e.ez400();

    if (e.method !== "GET" && e.method !== "POST")
        return void e.ez405();

    if (e.auto_upgrade())
        return;

    const app = apps.get(e.url);
    if (typeof app === "function")
        return void app(e);

    e.ez404();
};

const server = http.createServer(handler);
server.listen(port);

/*****************************************************************************/

let closed = false;

const close = () => {
    assert(!closed);

    closed = true;

    return new Promise((resolve, reject) => {
        server.close(resolve);
    });
};

/*****************************************************************************/

exports.set_host = set_host;
exports.set_enabled = set_enabled;

exports.bind = bind;
exports.alias = alias;

exports.close = close;

/*****************************************************************************/
