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

    Main script.

******************************************************************************/

"use strict";

/*****************************************************************************/

process.on("unhandledRejection", (err) => {
    throw err;
});

/*****************************************************************************/

const assert = require("assert");

/*****************************************************************************/

const prod = process.env.NODE_ENV === "production";
Object.defineProperty(global, "PROD", {
    enumerable: true,
    get() {
        return prod;
    },
    set() {
        assert(false);
    },
});

if (PROD)
    console.log("Started in production mode");
else
    console.warn("Started in debug mode");

/*****************************************************************************/

const db = require("./private/db.js");
const hack = require("./private/hack.js");
const server = require("./private/server.js");

/*****************************************************************************/

// Kill switches for quick disaster response
const ALLOW_SERVER = true;
const ALLOW_REPORTS = false;

// Kill switches for debugging
const ALLOW_INVALID_URLS = true;
const ALLOW_DEBUG_CALLS = true;
const ALLOW_DEBUG_ECHOS = true;

/*****************************************************************************/

const HOST_DOMAIN = "nanoserver.herokuapp.com";

// Set to 10 minutes for now, considering the lifetime of the map, this could
// be a bit too long
const VACUUM_INTERVAL = 600000;

const SIZE_LIM_ECHO_CALL = 32;
const SIZE_LIM_DB_CALL = 8192;

const MIN_LEN_DB_SECRET = 16;
const MAX_LEN_DB_SECRET = 512;

// 5 messages per 30 minutes
const THROTTLE_TIMEOUT = 1800000;
const THROTTLE_COUNT = 5;

/*****************************************************************************/

server.set_enabled(ALLOW_SERVER);

if (!ALLOW_SERVER)
    console.warn("Server started in maintenance mode");

/*****************************************************************************/

const now = () => {
    return Date.now();
};

const time = () => {
    const d = new Date();
    return d.toUTCString();
};

const started = time();

if (PROD)
    server.set_host(HOST_DOMAIN);

/*****************************************************************************/

const CallThrottler = class {
    constructor() {
        this.stamp = 0;
        this.tokens = new Set();

        this.reset();
    }

    reset(override = null) {
        if (override === null)
            override = now();

        this.stamp = override;
        this.tokens.clear();
    }

    vacuum() {
        const n = now();

        if (this.stamp + THROTTLE_TIMEOUT < n)
            this.reset(n);
    }

    add(tok) {
        this.vacuum();

        if (this.tokens.size > THROTTLE_COUNT)
            return false;

        if (this.tokens.has(tok))
            return false;

        this.tokens.add(tok);
        return true;
    }

    disposed() {
        return this.tokens.size === 0;
    }
};

/*****************************************************************************/

// Heroku will shutdown the server on inactivity, but that only happens after
// 30 minutes, by which time this map would be useless anyway
const call_map = new Map();

const vacuum = () => {
    for (const [key, val] of call_map) {
        val.vacuum();
        if (val.disposed())
            call_map.delete(key);
    }
};

setInterval(vacuum, VACUUM_INTERVAL).unref();

/*****************************************************************************/

const handle_err = (e, err, code) => {
    assert(typeof code === "number" && code !== 200);

    if (err.message === "Bad method")
        return void e.ez405();

    console.log(err.stack);

    if (ALLOW_DEBUG_ECHOS)
        return void e.fail(code, err.message);

    const key = "ez" + code.toString();
    if (typeof e[key] === "function")
        e[key]();
    else
        e.fail(code);
};

/*****************************************************************************/

// This can be used to wake up the Dyno

server.bind("/noop", (e) => {
    e.ez200();
});

server.alias("/noop", "/");

/*****************************************************************************/

server.bind("/echo", async (e) => {
    if (!ALLOW_DEBUG_CALLS)
        return void e.ez403();

    if (e.method !== "POST")
        return void e.ez405();

    let p;
    try {
        p = await e.body(SIZE_LIM_ECHO_CALL);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    const payload = {
        headers: e.req.headers,
        payload: p,
    };
    e.ez200(payload, true);
});

server.bind("/info", (e) => {
    if (!ALLOW_DEBUG_CALLS)
        return void e.ez403();

    const payload = {
        method: e.method,
        url: e.url,

        host: e.host,
        ip: e.ip,
        proto: e.proto,
        ua: e.ua,

        headers: e.req.headers,
        socket_ip: e.req.socket.remoteAddress,

        started: started,
        production: PROD,
    };
    e.ez200(payload, true);
});

/*****************************************************************************/

const db_secret = process.env.MY_DB_SECRET;

if (PROD) {
    assert(typeof db_secret === "string");
    assert(
        MIN_LEN_DB_SECRET <= db_secret.length &&
        db_secret.length <= MAX_LEN_DB_SECRET
    );
}

const db_auth = async (e) => {
    if (e.method !== "POST")
        return void e.ez405();

    let p;
    try {
        p = await e.body(SIZE_LIM_DB_CALL);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    if (!PROD)
        return p;

    if (typeof p.auth !== "string")
        return void e.ez403();

    if (!hack.strcmp(p.auth, db_secret))
        return void e.ez403();

    return p;
};

/*****************************************************************************/

server.bind("/dbinit", async (e) => {
    if (!await db_auth(e))
        return;

    try {
        await db.init();
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200();
});

server.bind("/dbgc", async (e) => {
    if (!await db_auth(e))
        return;

    try {
        await db.gc();
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200();
});

/*****************************************************************************/

server.bind("/mapget", async (e) => {
    let p;
    try {
        p = await e.body(SIZE_LIM_DB_CALL);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    if (typeof p.key !== "string")
        return void e.ez400();

    let r;
    try {
        r = await db.map_get(p.key);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    e.ez200({ val: r });
});

server.bind("/mapset", async (e) => {
    const p = await db_auth(e);
    if (!p)
        return;

    if (typeof p.key !== "string" || typeof p.val !== "string")
        return void e.ez400();

    try {
        await db.map_set(p.key, p.val);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    e.ez200();
});

/*****************************************************************************/

// Domains should be all lower case
const re_extract_domain = /^https?:\/\/([a-z0-9_\-.]+)(?::|\/|\?|$)/;

server.bind("/repget", async (e) => {
    if (!db_auth(e))
        return;

    let r;
    try {
        r = await db.rep_get();
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200({ val: r });
});

server.bind("/repset", async (e) => {

    /*************************************************************************/

    if (!ALLOW_REPORTS)
        return void e.ez403();

    // This should be enough to block cross site request forgery
    if (e.origin !== "Unknown" && !e.origin.startsWith("chrome-extension://"))
        return void e.ez403();

    /*************************************************************************/

    let p;
    try {
        p = await e.body();
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    /*************************************************************************/

    const payload = {
        ip: e.ip,
        ua: e.ua,

        now: time(),
    };

    if (typeof p.app !== "string")
        return void e.ez400();
    payload.app = p.app;

    if (typeof p.ver !== "string")
        return void e.ez400();
    payload.ver = p.ver;

    if (typeof p.cat !== "string")
        return void e.ez400();
    payload.cat = p.cat;

    if (typeof p.url !== "string")
        return void e.ez400();
    payload.url = p.url;

    if (typeof p.msg !== "string")
        return void e.ez400();
    payload.msg = p.msg;

    // payload.dom is set later

    /*************************************************************************/

    if (call_map.has(e.ip)) {
        if (!call_map.get(e.ip).add(payload.url)) {
            return void e.ez200({
                success: false,
                message: "You submitted too many reports, take a break!",
            });
        }
    } else {
        const t = new CallThrottler();
        t.add(payload.url);
        call_map.set(e.ip, t);
    }

    /*************************************************************************/

    let dom = re_extract_domain.exec(payload.url);

    if (dom === null) {

        console.warn("Invalid URL: " + payload.url);

        if (!ALLOW_INVALID_URLS) {
            return void e.ez200({
                success: false,
                message: "Invalid URL.",
            });
        }

    } else {

        dom = dom[1];

        let r;
        try {
            r = await db.sol_get(dom);
        } catch (err) {
            return void handle_err(e, err, 500);
        }

        if (r !== null) {
            return void ez200({
                success: false,
                message: r,
            });
        }

    }

    payload.dom = dom;

    /*************************************************************************/

    try {
        await db.rep_set(JSON.stringify(payload));
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200();

    /*************************************************************************/

});

server.bind("/repdel", async (e) => {
    const p = await db_auth(e);
    if (!p)
        return;

    if (typeof p.id !== "string" || p.id.length === 0)
        return void e.ez400();

    try {
        await db.rep_del(p.id);
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200();
});

/*****************************************************************************/

server.bind("/solget", async (e) => {
    let p;
    try {
        p = await e.body();
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    if (typeof p.dom !== "string" || p.dom.length === 0)
        return void e.ez400();

    let r;
    try {
        r = await db.sol_get(p.dom);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    e.ez200({ val: r });
});

server.bind("/solset", async (e) => {
    const p = await db_auth(e);
    if (!p)
        return;

    if (typeof p.dom !== "string" || typeof p.sol !== "string")
        return void e.ez400();
    if (p.dom.length === 0 || p.sol.length === 0)
        return void e.ez400();

    try {
        await db.sol_set(p.dom, p.sol);
    } catch (err) {
        return void handle_err(e, err, 400);
    }

    e.ez200();
});

server.bind("/soldel", async (e) => {
    const p = await db_auth(e);
    if (!p)
        return;

    if (typeof p.dom !== "string" || p.dom.length === 0)
        return void e.ez400();

    try {
        await db.sol_del(p.dom);
    } catch (err) {
        return void handle_err(e, err, 500);
    }

    e.ez200();
});

/*****************************************************************************/

let closing = false;

const close = async () => {
    if (closing)
        return;

    closing = true;

    await server.close();
    await db.close();
};

process.on("SIGHUP", close);
process.on("SIGTERM", close);
process.on("SIGINT", close);

/*****************************************************************************/
