/*
    Copyright 2018 0KIMS association.

    This file is part of snarkJS.

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

import * as binFileUtils from "@iden3/binfileutils";
import * as chunkFileUtils from "./chunk_utils.js";
import * as zkeyUtils from "./zkey_utils.js";
import { getCurveFromQ as getCurve } from "./curves.js";
import * as misc from "./misc.js";
import Blake2b from "blake2b-wasm";
import * as utils from "./zkey_utils.js";
import { hashToG2 as hashToG2 } from "./keypair.js";
import { applyKeyToSection } from "./mpc_applykey.js";

export default async function convert(zkeyNameOld, zkeyNameNew) {
    await Blake2b.ready();

    const {fd: fdOld, sections: sections} = await binFileUtils.readBinFile(zkeyNameOld, "zkey", 2);
    const zkey = await zkeyUtils.readHeader(fdOld, sections);

    if (zkey.protocol != "groth16") {
        throw new Error("zkey file is not groth16");
    }

    const curve = await getCurve(zkey.q);

    const mpcParams = await zkeyUtils.readMPCParams(zkeyNameOld, maxZKeyVersion, curve);

    await zkeyUtils.writeHeader(zkeyNameNew, zkey);

    // IC
    await copyToChunk(fdOld, sections, zkeyNameNew, 3);

    // Coeffs (Keep original)
    await copyToChunk(fdOld, sections, zkeyNameNew, 4);

    // A Section
    await copyToChunk(fdOld, sections, zkeyNameNew, 5);

    // B1 Section
    await copyToChunk(fdOld, sections, zkeyNameNew, 6);

    // B2 Section
    await copyToChunk(fdOld, sections, zkeyNameNew, 7);

    // remaining sections
    await copyToChunk(fdOld, sections, zkeyNameNew, 8);
    await copyToChunk(fdOld, sections, zkeyNameNew, 9);
    await copyToChunk(fdOld, sections, zkeyNameNew, 10);
}

export async function copyToChunk(fdFrom, sections, zkeyNameNew, sectionId, size) {
    if (typeof size === "undefined") {
        size = sections[sectionId][0].size;
    }
    const chunkSize = fdFrom.pageSize;
    await startReadUniqueSection(fdFrom, sections, sectionId);

    let fdTo = await chunkFileUtils.startWriteSectionFile(zkeyNameNew, sectionId);
    for (let p=0; p<size; p+=chunkSize) {
        const l = Math.min(size -p, chunkSize);
        const buff = await fdFrom.read(l);
        await fdTo.write(buff);
    }
    await chunkFileUtils.endWriteSectionFile(fdTo);
    await endReadSection(fdFrom, size != sections[sectionId][0].size);
}