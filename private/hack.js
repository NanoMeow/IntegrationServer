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

    Anti-hacking engine.

******************************************************************************/

"use strict";

/*****************************************************************************/

const assert = require("assert");
const crypto = require("crypto");

/*****************************************************************************/

const strcmp = (a, b) => {
    // This will disclose length difference between the two strings, which is
    // fine

    assert(typeof a === "string" && typeof b === "string");

    const ba = Buffer.from(a);
    const bb = Buffer.from(b);

    if (ba.length !== bb.length)
        return false;

    return crypto.timingSafeEqual(ba, bb);
};

/*****************************************************************************/

exports.strcmp = strcmp;

/*****************************************************************************/
