import fs from "fs";
import * as binFileUtils from "@iden3/binfileutils";
import * as fastFile from "fastfile";
import { BigBuffer } from "ffjavascript";
import localforage from "localforage";

// Each section is its own file.

function sectionName(sectionId) {
    return String.fromCharCode('a'.charCodeAt(0) + sectionId);
}

export async function startWriteSectionFile(zkeyName, sectionId) {
	const fd = await binFileUtils.createBinFile(zkeyName + sectionName(sectionId), "zky" + sectionName(sectionId), 1, 1, 1<<22, 1<<24);

	fd.writingSection = {
        pSectionSize: fd.pos
    };
	await fd.writeULE64(0); // Temporally set to 0 length
	return fd;
}

export async function endWriteSectionFile(fd) {
    if (typeof fd.writingSection === "undefined") throw new Error("Not writing a section");

    const sectionSize = fd.pos - fd.writingSection.pSectionSize - 8;
    const oldPos = fd.pos;
    fd.pos = fd.writingSection.pSectionSize;
    await fd.writeULE64(sectionSize);
    fd.pos = oldPos;
    await fd.close();
    delete fd.writingSection;
}

export async function startReadSectionFile(zkeyName, sectionId, maxVersion) {
	const fileName = zkeyName + sectionName(sectionId);
	const type = "zky" + sectionName(sectionId);
    const item = await localforage.getItem(
      fileName
    );
    const fd = await fastFile.readExisting(new Uint8Array(item));

    const b = await fd.read(4);
    let readedType = "";
    for (let i=0; i<4; i++) readedType += String.fromCharCode(b[i]);

    if (readedType != type) throw new Error(fileName + ": Invalid File format");

    let v = await fd.readULE32();

    if (v>maxVersion) throw new Error("Version not supported");

    let nSections = await fd.readULE32();
    if (nSections != 1) throw new Error("More than one section found");

    let size = await fd.readULE64();
    fd.readingSection = {
    	size: size,
    	p: fd.pos,
    }
    return fd;
}

export async function endReadSectionFile(fd, noCheck) {
    if (typeof fd.readingSection === "undefined") throw new Error("Not reading a section");
    if (!noCheck) {
        if (fd.pos-fd.readingSection.p !=  fd.readingSection.size) throw new Error("Invalid section size reading");
    }
    await fd.close();
    delete fd.readingSection;
}

export async function readSectionFile(zkeyName, sectionId, maxVersion) {
	const fd = await startReadSectionFile(zkeyName, sectionId, maxVersion);
    let buff;
    if (fd.readingSection.size < (1 << 30) ) {
        buff = new Uint8Array(fd.readingSection.size);
    } else {
        buff = new BigBuffer(fd.readingSection.size);
    }

    await fd.readToBuffer(buff, 0, fd.readingSection.size, fd.pos);
    await endReadSectionFile(fd);
    return buff;
}

export async function copySectionFile(zkeyNameOld, zkeyNameNew, sectionId) {
    await fs.copyFile(zkeyNameOld + sectionName(sectionId), zkeyNameNew + sectionName(sectionId), (err) => {
        if (err) throw err;
    });
}

export async function sectionFileIsEqual(zkeyNameOld, zkeyNameNew, sectionId, maxVersion) {
    const fdOld = await startReadSectionFile(zkeyNameOld, sectionId, maxVersion);
    const fdNew = await startReadSectionFile(zkeyNameNew, sectionId, maxVersion);

    const MAX_BUFF_SIZE = fdOld.pageSize * 16;
    if (fdOld.readingSection.size != fdNew.readingSection.size) return false;
    const totalBytes=fdOld.readingSection.size;
    for (let i=0; i<totalBytes; i+= MAX_BUFF_SIZE) {
        const n = Math.min(totalBytes-i, MAX_BUFF_SIZE);
        const buff1 = await fdOld.read(n);
        const buff2 = await fdNew.read(n);
        for (let j=0; j<n; j++) if (buff1[j] != buff2[j]) return false;
    }
    await endReadSectionFile(fdOld);
    await endReadSectionFile(fdNew);
    return true;
}
