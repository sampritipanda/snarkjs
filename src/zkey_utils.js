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

// Format
// ======
// Header(1)
//      Prover Type 1 Groth
// HeaderGroth(2)
//      n8q
//      q
//      n8r
//      r
//      NVars
//      NPub
//      DomainSize  (multiple of 2
//      alpha1
//      beta1
//      delta1
//      beta2
//      gamma2
//      delta2
// IC(3)
// Coefs(4)
// PointsA(5)
// PointsB1(6)
// PointsB2(7)
// PointsC(8)
// PointsH(9)
// Contributions(10)

import { Scalar, F1Field } from "ffjavascript";
import * as binFileUtils from "@iden3/binfileutils";

import * as chunkFileUtils from "./chunk_utils.js";
import { getCurveFromQ as getCurve } from "./curves.js";
import { log2 } from "./misc.js";

export async function writeHeader(zkeyName, zkey) {

    // Write the header
    ///////////
    const fdSection1 = await chunkFileUtils.startWriteSectionFile(zkeyName, 1);
    await fdSection1.writeULE32(1); // Groth
    await chunkFileUtils.endWriteSectionFile(fdSection1);

    // Write the Groth header section
    ///////////

    const curve = await getCurve(zkey.q);

    const fdSection2 = await chunkFileUtils.startWriteSectionFile(zkeyName, 2);
    const primeQ = curve.q;
    const n8q = (Math.floor( (Scalar.bitLength(primeQ) - 1) / 64) +1)*8;

    const primeR = curve.r;
    const n8r = (Math.floor( (Scalar.bitLength(primeR) - 1) / 64) +1)*8;

    await fdSection2.writeULE32(n8q);
    await binFileUtils.writeBigInt(fdSection2, primeQ, n8q);
    await fdSection2.writeULE32(n8r);
    await binFileUtils.writeBigInt(fdSection2, primeR, n8r);
    await fdSection2.writeULE32(zkey.nVars);                         // Total number of bars
    await fdSection2.writeULE32(zkey.nPublic);                       // Total number of public vars (not including ONE)
    await fdSection2.writeULE32(zkey.domainSize);                  // domainSize
    await writeG1(fdSection2, curve, zkey.vk_alpha_1);
    await writeG1(fdSection2, curve, zkey.vk_beta_1);
    await writeG2(fdSection2, curve, zkey.vk_beta_2);
    await writeG2(fdSection2, curve, zkey.vk_gamma_2);
    await writeG1(fdSection2, curve, zkey.vk_delta_1);
    await writeG2(fdSection2, curve, zkey.vk_delta_2);

    await chunkFileUtils.endWriteSectionFile(fdSection2);
}

async function writeG1(fd, curve, p) {
    const buff = new Uint8Array(curve.G1.F.n8*2);
    curve.G1.toRprLEM(buff, 0, p);
    await fd.write(buff);
}

async function writeG2(fd, curve, p) {
    const buff = new Uint8Array(curve.G2.F.n8*2);
    curve.G2.toRprLEM(buff, 0, p);
    await fd.write(buff);
}

async function readG1(fd, curve, toObject) {
    const buff = await fd.read(curve.G1.F.n8*2);
    const res = curve.G1.fromRprLEM(buff, 0);
    return toObject ? curve.G1.toObject(res) : res;
}

async function readG2(fd, curve, toObject) {
    const buff = await fd.read(curve.G2.F.n8*2);
    const res = curve.G2.fromRprLEM(buff, 0);
    return toObject ? curve.G2.toObject(res) : res;
}


export async function readHeader(zkeyFileName, maxZKeyVersion) {
    // Read Header
    /////////////////////
    const fd = await chunkFileUtils.startReadSectionFile(zkeyFileName, 1, maxZKeyVersion);
    const protocolId = await fd.readULE32();
    await chunkFileUtils.endReadSectionFile(fd);

    if (protocolId == 1) {
        return await readHeaderGroth16(zkeyFileName, maxZKeyVersion);
    } else {
        throw new Error("Protocol not supported: ");
    }        
}




async function readHeaderGroth16(zkeyFileName, maxZKeyVersion, toObject) {
    const zkey = {};

    zkey.protocol = "groth16";

    // Read Groth Header
    /////////////////////
    const fd = await chunkFileUtils.startReadSectionFile(zkeyFileName, 2, maxZKeyVersion);
    const n8q = await fd.readULE32();
    zkey.n8q = n8q;
    zkey.q = await binFileUtils.readBigInt(fd, n8q);

    const n8r = await fd.readULE32();
    zkey.n8r = n8r;
    zkey.r = await binFileUtils.readBigInt(fd, n8r);
    zkey.curve = await getCurve(zkey.q);
    zkey.nVars = await fd.readULE32();
    zkey.nPublic = await fd.readULE32();
    zkey.domainSize = await fd.readULE32();
    zkey.power = log2(zkey.domainSize);
    zkey.vk_alpha_1 = await readG1(fd, zkey.curve, toObject);
    zkey.vk_beta_1 = await readG1(fd, zkey.curve, toObject);
    zkey.vk_beta_2 = await readG2(fd, zkey.curve, toObject);
    zkey.vk_gamma_2 = await readG2(fd, zkey.curve, toObject);
    zkey.vk_delta_1 = await readG1(fd, zkey.curve, toObject);
    zkey.vk_delta_2 = await readG2(fd, zkey.curve, toObject);
    await binFileUtils.endReadSection(fd);

    return zkey;
}




async function readHeaderPlonk(fd, sections, toObject) {
    const zkey = {};

    zkey.protocol = "plonk";

    // Read Plonk Header
    /////////////////////
    await binFileUtils.startReadUniqueSection(fd, sections, 2);
    const n8q = await fd.readULE32();
    zkey.n8q = n8q;
    zkey.q = await binFileUtils.readBigInt(fd, n8q);

    const n8r = await fd.readULE32();
    zkey.n8r = n8r;
    zkey.r = await binFileUtils.readBigInt(fd, n8r);
    zkey.curve = await getCurve(zkey.q);
    zkey.nVars = await fd.readULE32();
    zkey.nPublic = await fd.readULE32();
    zkey.domainSize = await fd.readULE32();
    zkey.power = log2(zkey.domainSize);
    zkey.nAdditions = await fd.readULE32();
    zkey.nConstrains = await fd.readULE32();
    zkey.k1 = await fd.read(n8r);
    zkey.k2 = await fd.read(n8r);

    zkey.Qm = await readG1(fd, zkey.curve, toObject);
    zkey.Ql = await readG1(fd, zkey.curve, toObject);
    zkey.Qr = await readG1(fd, zkey.curve, toObject);
    zkey.Qo = await readG1(fd, zkey.curve, toObject);
    zkey.Qc = await readG1(fd, zkey.curve, toObject);
    zkey.S1 = await readG1(fd, zkey.curve, toObject);
    zkey.S2 = await readG1(fd, zkey.curve, toObject);
    zkey.S3 = await readG1(fd, zkey.curve, toObject);
    zkey.X_2 = await readG2(fd, zkey.curve, toObject);

    await binFileUtils.endReadSection(fd);

    return zkey;
}

export async function readZKey(fileName, toObject) {
    const maxZKeyVersion = 2;
    // const {fd, sections} = await binFileUtils.readBinFile(fileName, "zkey", 1);

    const zkey = await zkeyUtils.readHeader(zkeyFileName, maxZKeyVersion);

    if (zkey.protocol != "groth16") {
        throw new Error("zkey file is not groth16");
    }

    // const fd = await chunkFileUtils.startReadSectionFile(zkeyFileName, 1, maxZKeyVersion);
    // const protocolId = await fd.readULE32();
    // await chunkFileUtils.endReadSectionFile(fd);

    const Fr = new F1Field(zkey.r);
    const Rr = Scalar.mod(Scalar.shl(1, zkey.n8r*8), zkey.r);
    const Rri = Fr.inv(Rr);
    const Rri2 = Fr.mul(Rri, Rri);

    let curve = await getCurve(zkey.q);

    // Read IC Section
    ///////////
    const fd3 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 3, maxZKeyVersion);
    zkey.IC = [];
    for (let i=0; i<= zkey.nPublic; i++) {
        const P = await readG1(fd3, curve, toObject);
        zkey.IC.push(P);
    }
    await chunkFileUtils.endReadSectionFile(fd3);

    // Read Coefs
    ///////////
    const fd4 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 4, maxZKeyVersion);
    const nCCoefs = await fd4.readULE32();
    zkey.ccoefs = [];
    for (let i=0; i<nCCoefs; i++) {
        const m = await fd4.readULE32();
        const c = await fd4.readULE32();
        const s = await fd4.readULE32();
        const v = await readFr2(fd4, toObject);
        zkey.ccoefs.push({
            matrix: m,
            constraint: c,
            signal: s,
            value: v
        });
    }
    await chunkFileUtils.endReadSectionFile(fd4);

    // Read A points
    ///////////
    const fd5 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 5, maxZKeyVersion);
    zkey.A = [];
    for (let i=0; i<zkey.nVars; i++) {
        const A = await readG1(fd5, curve, toObject);
        zkey.A[i] = A;
    }
    await chunkFileUtils.endReadSectionFile(fd5);


    // Read B1
    ///////////
    const fd6 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 6, maxZKeyVersion);
    zkey.B1 = [];
    for (let i=0; i<zkey.nVars; i++) {
        const B1 = await readG1(fd6, curve, toObject);

        zkey.B1[i] = B1;
    }
    await chunkFileUtils.endReadSectionFile(fd6);


    // Read B2 points
    ///////////
    const fd7 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 7, maxZKeyVersion);
    zkey.B2 = [];
    for (let i=0; i<zkey.nVars; i++) {
        const B2 = await readG2(fd7, curve, toObject);
        zkey.B2[i] = B2;
    }
    await chunkFileUtils.endReadSectionFile(fd7);


    // Read C points
    ///////////
    const fd8 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 8, maxZKeyVersion);
    zkey.C = [];
    for (let i=zkey.nPublic+1; i<zkey.nVars; i++) {
        const C = await readG1(fd8, curve, toObject);

        zkey.C[i] = C;
    }
    await chunkFileUtils.endReadSectionFile(fd8);


    // Read H points
    ///////////
    const fd9 = await chunkFileUtils.startReadSectionFile(zkeyFileName, 9, maxZKeyVersion);
    zkey.hExps = [];
    for (let i=0; i<zkey.domainSize; i++) {
        const H = await readG1(fd9, curve, toObject);
        zkey.hExps.push(H);
    }
    await chunkFileUtils.endReadSectionFile(fd9);

    return zkey;

    async function readFr2(fd, toObject) {
        const n = await binFileUtils.readBigInt(fd, zkey.n8r);
        return Fr.mul(n, Rri2);
    }

}


async function readContribution(fd, curve, toObject) {
    const c = {delta:{}};
    c.deltaAfter = await readG1(fd, curve, toObject);
    c.delta.g1_s = await readG1(fd, curve, toObject);
    c.delta.g1_sx = await readG1(fd, curve, toObject);
    c.delta.g2_spx = await readG2(fd, curve, toObject);
    c.transcript = await fd.read(64);
    c.type = await fd.readULE32();

    const paramLength = await fd.readULE32();
    const curPos = fd.pos;
    let lastType =0;
    while (fd.pos-curPos < paramLength) {
        const buffType = await fd.read(1);
        if (buffType[0]<= lastType) throw new Error("Parameters in the contribution must be sorted");
        lastType = buffType[0];
        if (buffType[0]==1) {     // Name
            const buffLen = await fd.read(1);
            const buffStr = await fd.read(buffLen[0]);
            c.name = new TextDecoder().decode(buffStr);
        } else if (buffType[0]==2) {
            const buffExp = await fd.read(1);
            c.numIterationsExp = buffExp[0];
        } else if (buffType[0]==3) {
            const buffLen = await fd.read(1);
            c.beaconHash = await fd.read(buffLen[0]);
        } else {
            throw new Error("Parameter not recognized");
        }
    }
    if (fd.pos != curPos + paramLength) {
        throw new Error("Parametes do not match");
    }

    return c;
}


export async function readMPCParams(zkeyFileName, maxZKeyVersion, curve) {
    const fd = await chunkFileUtils.startReadSectionFile(zkeyFileName, 10, maxZKeyVersion);
    const res = { contributions: []};
    res.csHash = await fd.read(64);
    const n = await fd.readULE32();
    for (let i=0; i<n; i++) {
        const c = await readContribution(fd, curve);
        res.contributions.push(c);
    }
    await chunkFileUtils.endReadSectionFile(fd);

    return res;
}

async function writeContribution(fd, curve, c) {
    await writeG1(fd, curve, c.deltaAfter);
    await writeG1(fd, curve, c.delta.g1_s);
    await writeG1(fd, curve, c.delta.g1_sx);
    await writeG2(fd, curve, c.delta.g2_spx);
    await fd.write(c.transcript);
    await fd.writeULE32(c.type || 0);

    const params = [];
    if (c.name) {
        params.push(1);      // Param Name
        const nameData = new TextEncoder("utf-8").encode(c.name.substring(0,64));
        params.push(nameData.byteLength);
        for (let i=0; i<nameData.byteLength; i++) params.push(nameData[i]);
    }
    if (c.type == 1) {
        params.push(2);      // Param numIterationsExp
        params.push(c.numIterationsExp);

        params.push(3);      // Beacon Hash
        params.push(c.beaconHash.byteLength);
        for (let i=0; i<c.beaconHash.byteLength; i++) params.push(c.beaconHash[i]);
    }
    if (params.length>0) {
        const paramsBuff = new Uint8Array(params);
        await fd.writeULE32(paramsBuff.byteLength);
        await fd.write(paramsBuff);
    } else {
        await fd.writeULE32(0);
    }

}

export async function writeMPCParams(zkeyName, curve, mpcParams) {
    const fd = await chunkFileUtils.startWriteSectionFile(zkeyName, 10);
    await fd.write(mpcParams.csHash);
    await fd.writeULE32(mpcParams.contributions.length);
    for (let i=0; i<mpcParams.contributions.length; i++) {
        await writeContribution(fd, curve,mpcParams.contributions[i]);
    }
    await chunkFileUtils.endWriteSectionFile(fd);
}

export function hashG1(hasher, curve, p) {
    const buff = new Uint8Array(curve.G1.F.n8*2);
    curve.G1.toRprUncompressed(buff, 0, p);
    hasher.update(buff);
}

export function hashG2(hasher,curve, p) {
    const buff = new Uint8Array(curve.G2.F.n8*2);
    curve.G2.toRprUncompressed(buff, 0, p);
    hasher.update(buff);
}

export function hashPubKey(hasher, curve, c) {
    hashG1(hasher, curve, c.deltaAfter);
    hashG1(hasher, curve, c.delta.g1_s);
    hashG1(hasher, curve, c.delta.g1_sx);
    hashG2(hasher, curve, c.delta.g2_spx);
    hasher.update(c.transcript);
}

