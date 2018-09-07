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

    Database engine.

******************************************************************************/

"use strict";

/*****************************************************************************/

const assert = require("assert");
const error = require("./error.js");
const pg = require("pg");

/*****************************************************************************/

const DEBUG_DATABASE_URL = "postgres://postgres:root@localhost:5432/testdb";

const QUERY_SEP = " ";

/*****************************************************************************/

const ERR_DB_GENERIC = "Database error";
const ERR_DB_ENCODING = "Database encoding error";
const ERR_DB_CORRUPTED = "Database currupted";

const ERR_MAP_NOT_FOUND = "Entry not found";
const ERR_MAP_NEW_VAL_NOT_VALID = "New value not valid";

const ERR_REP_ID_NOT_VALID = "Serial number not valid";

/*****************************************************************************/

const path = PROD ? process.env.DATABASE_URL : DEBUG_DATABASE_URL;

assert(typeof path === "string");

/*****************************************************************************/

const config = {
    connectionString: path,
    ssl: true,
};

if (!PROD)
    config.ssl = false;

const pool = new pg.Pool(config);

pool.on("error", (err) => {
    console.error(err.stack);
});

/*****************************************************************************/

const init = async () => {
    // Key, value
    await pool.query([
        "CREATE TABLE IF NOT EXISTS map (",
        "    key VARCHAR NOT NULL PRIMARY KEY,",
        "    val VARCHAR NOT NULL",
        ");",
    ].join(QUERY_SEP));

    // Serial number, JSON data
    await pool.query([
        "CREATE TABLE IF NOT EXISTS reports (",
        "    id BIGSERIAL PRIMARY KEY,",
        "    dt VARCHAR NOT NULL",
        ");",
    ].join(QUERY_SEP));

    // Domain, solution text or identifier
    await pool.query([
        "CREATE TABLE IF NOT EXISTS solutions (",
        "    dom VARCHAR NOT NULL PRIMARY KEY,",
        "    sol VARCHAR NOT NULL",
        ");",
    ].join(QUERY_SEP));

    const r = await pool.query(
        "SELECT character_set_name FROM information_schema.character_sets;",
    );
    if (r.rowCount === 0)
        throw new Error(ERR_DB_ENCODING);
    for (const row of r.rows) {
        if (row.character_set_name !== "UTF8")
            throw new Error(ERR_DB_ENCODING);
    }
};

const gc = async () => {
    await pool.query("VACUUM;");
};

/*****************************************************************************/

// This map can still be modified with some hack, but it should not be doable
// by accident

const StaticMap = class extends Map {
    constructor(init) {
        super(init);
        Object.freeze(this);
    }

    set() {
        assert(!Object.isFrozen(this));

        return super.set.apply(this, arguments);
    }

    delete() {
        assert(!Object.isFrozen(this));

        return super.delete.apply(this, arguments);
    }

    clear() {
        assert(!Object.isFrozen(this));

        return super.clear.apply(this, arguments);
    }
};

/*****************************************************************************/

const map_def = new StaticMap([
    ["testkey", "testval"],

    ["nalastver", "1.0.0.65"],
    ["naminver", "1.0.0.65"],

    ["ndlastver", "15.0.0.40"],
    ["ndminver", "15.0.0.40"],
]);

const re_valid_ver = /^\d+\.\d+\.\d+\.\d+$/;

const map_validator = (key, val) => {
    switch (key) {
        case "testkey":
            return val.length > 0;

        case "nalastver":
        case "naminver":
        case "ndlastver":
        case "ndminver":
            return re_valid_ver.test(val);

        default:
            assert(false);
    }
};

const map_sanitizer = (key, val) => {
    assert(typeof key === "string");

    if (typeof val !== "string" || val.length === 0)
        throw new Error(ERR_DB_CORRUPTED);

    switch (key) {
        case "testkey":
            return val;

        case "nalastver":
        case "naminver":
        case "ndlastver":
        case "ndminver":
            if (re_valid_ver.test(val))
                return val;
            else
                throw new Error(ERR_DB_CORRUPTED);

        default:
            assert(false);
    }
};

const map_get = async (key) => {
    assert(typeof key === "string");

    if (!map_def.has(key))
        throw new error.RequestError(ERR_MAP_NOT_FOUND, 400);

    const r = await pool.query("SELECT val FROM map WHERE key = $1;", [key]);

    if (r.rowCount === 0)
        return map_def.get(key);
    else if (r.rowCount === 1)
        return map_sanitizer(key, r.rows[0].val);
    else
        throw new Error(ERR_DB_CORRUPTED);
};

const map_set = async (key, val) => {
    assert(typeof key === "string" && typeof val === "string");

    if (!map_def.has(key))
        throw new error.RequestError(ERR_MAP_NOT_FOUND, 400);

    if (!map_validator(key, val))
        throw new error.RequestError(ERR_MAP_NEW_VAL_NOT_VALID, 400);

    await pool.query(
        [
            "INSERT INTO map (key, val) VALUES ($1, $2)",
            "ON CONFLICT (key) DO UPDATE SET val = $2;",
        ].join(QUERY_SEP),
        [key, val],
    );
};

/*****************************************************************************/

const re_is_numeric = /^\d+$/;

const rep_get = async () => {
    const r = await pool.query("SELECT * FROM reports LIMIT 20;");

    // Sanitizing the results is left to the administration client

    return r.rows;
};

const rep_set = async (dt) => {
    assert(typeof dt === "string" && id.length > 0);

    // Validation is left to the server

    await pool.query("INSERT INTO reports (dt) VALUES ($1);", [dt]);
};

const rep_del = async (id) => {
    // BIGSERIAL is too big for JavaScript number type
    assert(typeof id === "string");

    if (!re_is_numeric.test(id))
        throw new error.RequestError(ERR_REP_ID_NOT_VALID, 400);

    await pool.query("DELETE FROM reports WHERE id = $1::BIGSERIAL;", [id]);
};

/*****************************************************************************/

const sol_sanitizer = (val) => {
    if (typeof val !== "string" || val.length === 0)
        throw new Error(ERR_DB_CORRUPTED);

    // TODO: Maybe better validation than this?

    return val;
};

const sol_get = async (dom) => {
    assert(typeof dom === "string" && dom.length > 0);

    const r = await pool.query(
        "SELECT sol FROM solutions WHERE dom = $1;",
        [dom],
    );

    if (r.rowCount === 0)
        return null;
    else if (r.rowCount === 1)
        return sol_sanitizer(r.rows[0].sol);
    else
        throw new Error(ERR_DB_CORRUPTED);
};

const sol_set = async (dom, sol) => {
    assert(typeof dom === "string" && dom.length > 0);
    assert(typeof sol === "string" && sol.length > 0);

    // Validation is left to the server

    await pool.query(
        [
            "INSERT INTO solutions (dom, sol) VALUES ($1, $2)",
            "ON CONFLICT (dom) DO UPDATE SET sol = $2;",
        ].join(QUERY_SEP),
        [dom, sol],
    );
};

const sol_del = async (dom) => {
    assert(typeof dom === "string" && dom.length > 0);

    await pool.query("DELETE FROM solutions WHERE dom = $1;", [dom]);
};

/*****************************************************************************/

let closed = false;

const close = () => {
    assert(!closed);

    closed = true;

    return new Promise((resolve, reject) => {
        pool.end(resolve);
    });
};

/*****************************************************************************/

exports.init = init;
exports.gc = gc;

exports.map_get = map_get;
exports.map_set = map_set;

exports.rep_get = rep_get;
exports.rep_set = rep_set;
exports.rep_del = rep_del;

exports.sol_get = sol_get;
exports.sol_set = sol_set;
exports.sol_del = sol_del;

exports.close = close;

/*****************************************************************************/
